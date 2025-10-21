// ---------- API ----------
async function apiTop(){ 
  const r = await fetch('/api/top'); 
  return r.json(); 
}
async function apiRefresh(sym){ 
  await fetch('/api/refresh/'+encodeURIComponent(sym), { method:'POST' }); 
}
async function apiChat(message){
  // ★ GPT מנוטרל זמנית – נחזיר תשובה מקומית במקום חיבור לאינטרנט
  return {
    ok: true,
    reply: "⚙️ ChatGPT מנוטרל כרגע — המערכת פועלת במצב תצוגה בלבד. הנתונים שמוצגים בדשבורד מתעדכנים בזמן אמת מהמקורות הפיננסיים."
  };
  /*
  // ★ הסר את ההערות האלו כאשר GPT פעיל
  const r = await fetch('/api/chat', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ message })
  });
  return r.json();
  */
}

// ---------- UI Helpers ----------
// ---------- Loader Control ----------
function showLoader(text = 'מתחבר ל־Yahoo Finance...') {
  const el = document.getElementById('loader');
  if (el) {
    el.style.display = 'block';
    el.style.background = '#0ea5e9';
    el.querySelector('span').textContent = text;
  }
}
function hideLoader() {
  const el = document.getElementById('loader');
  if (el) el.style.display = 'none';
}
function showErrorLoader(text = '⚠️ חיבור ל־Yahoo Finance נכשל — מוצגים נתוני גיבוי בלבד.') {
  const el = document.getElementById('loader');
  if (el) {
    el.style.display = 'block';
    el.style.background = '#dc2626';
    el.querySelector('span').textContent = text;
  }
}

function fmt(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('he-IL', { hour12:false });
}

function renderTop(data){
  document.getElementById('lastUpdated').textContent = 'עדכון אחרון: ' + fmt(data.last_scan_at);
  const grid = document.getElementById('grid'); 
  grid.innerHTML = '';

  (data.top || []).forEach(item=>{
    const el = document.createElement('article'); 
    el.className = 'card';

    const arrow = item.prev_score == null ? '→' : (item.score > item.prev_score ? '↑' : item.score < item.prev_score ? '↓' : '→');
    const ch = (item.change_pct ?? 0);
    const chClass = ch >= 0 ? 'pos' : 'neg';

    el.innerHTML = `
      <div class="row1">
        <div class="ticker">${item.symbol}</div>
        <div class="name">${item.name || item.symbol}</div>
      </div>
      <div class="row2">
        <div class="price">$ ${Number(item.price).toFixed(2)}</div>
        <div class="change ${chClass}">(${Number(ch).toFixed(2)}%)</div>
      </div>
      <div class="row3">
        <span class="badge">נכנסה: ${fmt(item.first_seen_at)}</span>
        <span class="source">${item.source || ''}</span>
      </div>
      <div class="row4">
        <div class="score">דירוג טכני: ${Number(item.tech_score ?? item.score).toFixed(2)}</div>
        <div class="score">📊 Yahoo: ${item.yahoo_score ? item.yahoo_score + ' (' + item.yahoo_label + ')' : 'N/A'}</div>
        <!-- ★ <div class="score">🤖 GPT: ${item.ai_score ? item.ai_score + ' (' + item.ai_reason + ')' : '—'}</div> -->
        <div class="trend">${arrow}</div>
      </div>
      <canvas class="spark" width="300" height="36"></canvas>
      <div class="actions">
        <button class="btn">רענן מניה</button>
      </div>
      <div class="reason">${item.reason || ''}</div>
    `;

    // Refresh handler
    el.querySelector('.btn').addEventListener('click', async ()=>{
      const btn = el.querySelector('.btn');
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = 'מרענן…';
      try{ await apiRefresh(item.symbol); await loadTop(); }
      finally{ btn.disabled = false; btn.textContent = old; }
    });

    // Sparkline (גרף מגמה קטן)
    try{
      const canvas = el.querySelector('.spark');
      const ctx = canvas.getContext('2d');
      const hs = (item.history || []).map(h=>Number(h.score));
      if (hs.length >= 2){
        const w = canvas.width, h = canvas.height;
        const min = Math.min(...hs), max = Math.max(...hs);
        const pad = 4;
        ctx.clearRect(0,0,w,h);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#60a5fa';
        ctx.beginPath();
        hs.forEach((v,i)=>{
          const x = pad + (i*(w-2*pad)/(hs.length-1));
          const y = h - pad - ((v-min)/(max-min||1))*(h-2*pad);
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
      }
    } catch (e){ /* ignore */ }

    grid.appendChild(el);
  });
}

async function loadTop(){
  const loader = document.getElementById('loader');
  try {
    loader.style.display = 'flex';
    loader.style.background = 'linear-gradient(90deg,#0ea5e9,#0284c7)';
    loader.querySelector('span').textContent = 'מתחבר ל־Yahoo Finance...';

    const res = await fetch('/api/top');
    if (!res.ok) throw new Error(`שרת החזיר ${res.status} (${res.statusText})`);
    const data = await res.json();

    // אם אין מניות
    if (!data.top || data.top.length === 0)
      throw new Error("לא נמצאו מניות. יתכן שמפתח ה־API שגוי או שחיבור ל־Yahoo נכשל.");

    // אם Yahoo נפל אבל יש נתונים מגיבוי
    if (data.sources && data.sources.yahoo === false) {
      loader.style.background = '#f97316'; // כתום אזהרה
      loader.querySelector('span').textContent =
        '⚠️ חיבור ל־Yahoo Finance נכשל — מוצגים נתונים מגיבוי בלבד.';
      setTimeout(()=> loader.style.display='none', 4000);
    } else {
      loader.style.display = 'none';
    }

    renderTop(data);
  } catch (e) {
    console.error('❌ שגיאה בטעינת נתונים:', e);
    loader.style.display = 'flex';
    loader.style.background = '#dc2626';
    loader.querySelector('span').textContent =
      '❌ שגיאה: ' + (e.message || 'החיבור נכשל. בדוק את האינטרנט או את מפתח ה־API שלך.');
  }
}

// ---------- Chat ----------
function pushChat(role, text){
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (role === 'me' ? 'me' : 'ai');
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

async function sendChat(){
  const input = document.getElementById('chatInput');
  const msg = (input.value || '').trim();
  if (!msg) return;
  pushChat('me', msg);
  input.value = '';
  const sendBtn = document.getElementById('chatSend');
  sendBtn.disabled = true;
  try {
    const res = await apiChat(msg);
    pushChat('ai', res?.reply || 'לא הצלחתי לענות כרגע.');
  } catch(e){
    pushChat('ai', 'שגיאה בשליחה. נסה שוב.');
  } finally {
    sendBtn.disabled = false;
  }
}

document.getElementById('chatSend').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', (e)=> {
  if (e.key === 'Enter') sendChat();
});

// ---------- Boot ----------
loadTop();
setInterval(loadTop, 60000); // עדכון אוטומטי כל דקה
