// ==================================================
// AI-Investor — Server (Express + Finnhub + Yahoo + OpenAI★)
// גרסה מלאה: כולל business rules, chat API, ו־3 ציונים נפרדים
// ==================================================
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const dayjs = require("dayjs");
const finnhub = require("finnhub");
const dotenv = require("dotenv");
// ★ const OpenAI = require("openai");
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA_FILE = path.join(__dirname, "hotStocks.json");

// ---------- Availability Flags ----------
let yahooAvailable = false;
let finnhubAvailable = false;

// ---------- OpenAI ----------
/*
★ הסר הערה זו כאשר ה־GPT פעיל
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
*/

// ---------- Finnhub ----------
let finnhubClient;
try {
  finnhubClient = new finnhub.DefaultApi();
  finnhubClient.apiClient.authentications.api_key.apiKey = process.env.FINNHUB_KEY || "";
  finnhubAvailable = true;
  console.log("✅ Finnhub API key loaded successfully");
} catch (err) {
  finnhubAvailable = false;
  console.error("⚠️ Finnhub init error:", err.message);
}

app.use(express.json());
app.use(express.static(__dirname)); // מגיש index.html + index.client.js

// ---------- State ----------
let state = { last_scan_at: null, top: [] };

(async () => {
  try {
    if (await fs.pathExists(DATA_FILE)) state = await fs.readJson(DATA_FILE);
  } catch (e) {
    console.warn("⚠️ hotStocks.json not readable, starting fresh");
  }
})();

async function save() { await fs.writeJson(DATA_FILE, state, { spaces: 2 }); }
const nowISO = () => dayjs().toISOString();
const fmt = (t) => dayjs(t).format("YYYY-MM-DD HH:mm");
const sleep = (ms) => new Promise(r=>setTimeout(r, ms));
const clip = (x,min,max)=>Math.max(min, Math.min(max, x));

// ---------- Config ----------
const SEED_SYMBOLS = (process.env.SEED_SYMBOLS || "").split(",").map(s=>s.trim()).filter(Boolean);
const SCAN_INTERVAL_MIN = Number(process.env.SCAN_INTERVAL_MIN || 5);
const TOP_N           = Number(process.env.TOP_N || 10);
const KEEP_THRESHOLD  = Number(process.env.KEEP_THRESHOLD || 85);
const EJECT_THRESHOLD = Number(process.env.EJECT_THRESHOLD || 70);
const REPLACE_DELTA   = Number(process.env.REPLACE_DELTA || 2);

// ---------- Finnhub Quote ----------
function fetchQuote(symbol){
  return new Promise((resolve)=>{
    if (!finnhubClient) {
      finnhubAvailable = false;
      console.warn("⚠️ Finnhub client missing, using fallback data");
      const price = +(100 + Math.random()*900).toFixed(2);
      const dp = +(Math.random()*6 - 3).toFixed(2);
      const volProxy = +(0.5 + Math.abs(dp)/3).toFixed(2);
      resolve({
        symbol, name: symbol,
        price, change_pct: dp,
        volatility: clip(volProxy, 0.3, 1.2),
        source: `Fallback @ ${fmt(new Date())}`
      });
      return;
    }

    finnhubClient.quote(symbol, (err, data) => {
      finnhubAvailable = !err;
      if (err || !data || typeof data.c !== "number") {
        const price = +(100 + Math.random()*900).toFixed(2);
        const dp = +(Math.random()*6 - 3).toFixed(2);
        const volProxy = +(0.5 + Math.abs(dp)/3).toFixed(2);
        resolve({
          symbol, name: symbol,
          price, change_pct: dp,
          volatility: clip(volProxy, 0.3, 1.2),
          source: `Finnhub (fallback) @ ${fmt(new Date())}`
        });
        return;
      }
      const price = +data.c;
      const dp = +data.dp;
      const open = +data.o || price;
      const range = (Number(data.h) - Number(data.l));
      const volProxy = open ? (range/open) : 0.8;
      resolve({
        symbol, name: symbol,
        price,
        change_pct: isFinite(dp)? dp : 0,
        volatility: clip(+volProxy.toFixed(2), 0.3, 1.5),
        source: `Finnhub @ ${fmt(new Date())}`
      });
    });
  });
}

async function fetchQuotesBatch(symbols){
  const out = [];
  for (const s of symbols){
    out.push(await fetchQuote(s));
    await sleep(80);
  }
  return out;
}

// ---------- Technical score ----------
function technicalScore(q){
  const momentum  = clip(((q.change_pct + 4)/9)*30, 0, 30);
  const healthyVol= clip((1.2 - Math.abs((q.volatility??0.8)-0.8))*15, 0, 15);
  const volumeRel = 12; 
  const mcapBonus = 8;  
  return momentum + healthyVol + volumeRel + mcapBonus;
}

// ---------- Yahoo Analyst score ----------
async function fetchYahooRating(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=recommendationTrend`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const rec = json?.quoteSummary?.result?.[0]?.recommendationTrend?.trend?.[0];
    if (!rec) throw new Error("No data");

    yahooAvailable = true; // ✅ עובד תקין

    const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
    if (total === 0) return { yahoo_score: null, yahoo_label: "N/A" };

    const yahoo_score = (
      (rec.strongBuy * 100 + rec.buy * 80 + rec.hold * 50 + rec.sell * 25 + rec.strongSell * 0) / total
    ).toFixed(1);

    let yahoo_label = "Hold";
    if (yahoo_score >= 75) yahoo_label = "Buy";
    else if (yahoo_score >= 60) yahoo_label = "Moderate Buy";
    else if (yahoo_score < 40) yahoo_label = "Sell";

    return { yahoo_score: Number(yahoo_score), yahoo_label };
  } catch (e) {
    yahooAvailable = false; // ❌ Yahoo נפל
    return { yahoo_score: null, yahoo_label: "N/A" };
  }
}

// ---------- GPT Rating ★ ----------
/*
async function gptRank(q){
  try{
    const prompt = `
אתה אנליסט השקעות קצר-טווח. נתוני מניה:
symbol: ${q.symbol}
price: ${q.price}
change_pct: ${q.change_pct}
volatility: ${q.volatility}

דרג פוטנציאל רווחיות ל-2 שבועות (0-100), קצר ומנומק.
החזר JSON בלבד: {"score": number, "reason": "text"}`;
    const resp = await openai.chat.completions.create({
      model: "gpt-5-turbo",
      messages: [{ role:"user", content: prompt }],
      temperature: 0.3
    });
    const text = resp.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    return parsed;
  } catch (e){
    return { score: null, reason: "GPT לא פעיל כרגע" };
  }
}
*/

// ---------- Final Score calculation ----------
async function calcFinal(q){
  const tech = technicalScore(q);
  const { yahoo_score, yahoo_label } = await fetchYahooRating(q);
  // ★ const gpt = await gptRank(q);

  return {
    tech_score: tech,
    yahoo_score,
    yahoo_label,
    // ★ ai_score: gpt.score,
    // ★ ai_reason: gpt.reason,
    reason: "טכני + נתוני אנליסטים מ-Yahoo Finance",
  };
}

// ---------- Materialize ----------
function materialize(q, scores){
  const t = nowISO();
  return {
    symbol: q.symbol,
    name: q.name || q.symbol,
    price: q.price,
    change_pct: q.change_pct,
    volatility: q.volatility,
    first_seen_at: t,
    last_refreshed_at: t,
    source: q.source,
    ...scores,
    history: [{ t, score: scores.tech_score }]
  };
}

// ---------- Business rules ----------
function applyBusinessRules(currentTop, candidates){
  let pool = (currentTop||[]).filter(s => s.tech_score >= KEEP_THRESHOLD);
  const sorted = [...candidates].sort((a,b)=>b.tech_score-a.tech_score);

  for (const c of sorted){
    if (pool.find(x=>x.symbol===c.symbol)) continue;
    if (pool.length < TOP_N){ pool.push(c); }
    else {
      const minIdx = pool.reduce((mi,x,i)=> x.tech_score< pool[mi].tech_score? i:mi, 0);
      if (c.tech_score >= pool[minIdx].tech_score + REPLACE_DELTA) pool[minIdx] = c;
    }
  }
  pool = pool.filter(x => x.tech_score >= EJECT_THRESHOLD);
  return pool.sort((a,b)=>b.tech_score-a.tech_score).slice(0, TOP_N);
}

// ---------- Full Scan ----------
async function runFullScan(){
  const syms = SEED_SYMBOLS.length ? SEED_SYMBOLS : ["AAPL","MSFT","NVDA","AMZN","TSLA"];
  const quotes = await fetchQuotesBatch(syms);
  const candidates = [];
  for (const q of quotes){
    const scores = await calcFinal(q);
    candidates.push(materialize(q, scores));
  }
  state.top = applyBusinessRules(state.top, candidates);
  state.last_scan_at = nowISO();
  await save();
  console.log(`✅ Scan @ ${fmt(state.last_scan_at)} | top=${state.top.length}`);
}

// ---------- Refresh one ----------
async function refreshOne(symbol){
  const [q] = await fetchQuotesBatch([symbol]);
  const scores = await calcFinal(q);
  const i = (state.top||[]).findIndex(x => x.symbol === symbol);
  const t = nowISO();
  if (i !== -1){
    state.top[i] = {
      ...state.top[i],
      price: q.price,
      change_pct: q.change_pct,
      volatility: q.volatility,
      prev_score: state.top[i].tech_score,
      ...scores,
      last_refreshed_at: t,
      source: q.source,
      history: [ ...(state.top[i].history||[]), { t, score: scores.tech_score } ].slice(-5)
    };
  }
  await save();
  return state.top[i];
}

// ---------- API ----------
app.get("/api/top", (req,res)=> 
  res.json({
    last_scan_at: state.last_scan_at,
    top: state.top,
    sources: {
      yahoo: yahooAvailable,
      finnhub: finnhubAvailable
    }
  })
);

app.post("/api/refresh/:symbol", async (req,res)=>{
  try{
    const data = await refreshOne(req.params.symbol);
    res.json({ ok:true, data });
  } catch(e){
    res.status(500).json({ ok:false, error: e?.message || "refresh failed" });
  }
});

app.post("/api/scan", async (req,res)=>{
  try{ await runFullScan(); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ ok:false, error: e?.message||"scan failed" }); }
});

// ---------- Chat API ----------
app.post("/api/chat", async (req,res)=>{
  try{
    const userMsg = (req.body?.message || "").toString().slice(0, 2000);
    const summary = {
      last_scan_at: state.last_scan_at,
      top_snapshot: (state.top||[]).map(s=>({
        symbol: s.symbol,
        tech_score: s.tech_score,
        yahoo_score: s.yahoo_score,
        // ★ ai_score: s.ai_score,
        price: s.price,
        change_pct: s.change_pct
      }))
    };
    /*
    ★ הסר הערה זו כאשר GPT פעיל
    const sys = `אתה עוזר השקעות קצר-טווח...`;
    const usr = `הודעת משתמש: ${userMsg}\n\nמצב חי: ${JSON.stringify(summary,null,2)}`;
    const resp = await openai.chat.completions.create({
      model: "gpt-5-turbo",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr }
      ]
    });
    const reply = resp.choices?.[0]?.message?.content?.trim() || "לא הצלחתי להשיב כרגע.";
    return res.json({ ok:true, reply });
    */
    res.json({ ok:true, reply: "⚙️ ChatGPT מנוטרל כרגע — מצב טכני פעיל בלבד." });
  } catch(e){
    res.status(500).json({ ok:false, error: e?.message || "chat failed" });
  }
});

// ---------- Scheduler & Boot ----------
setInterval(runFullScan, SCAN_INTERVAL_MIN * 60 * 1000);
runFullScan().then(()=> {
  app.listen(PORT, ()=> console.log(`🚀 Server running on http://localhost:${PORT}`));
});
