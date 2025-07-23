#include <gtk/gtk.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// פונקציות מערכת ניהול הזיכרון (extern)
void init_memory(size_t size);
void* alloc(size_t size);
void free_block(void* ptr);
void defragment();
void print_memory_state();

#define MAX_BLOCKS 100
void* allocated_blocks[MAX_BLOCKS];
int block_count = 0;

GtkWidget *output_view;
GtkWidget *input_entry;

void gui_print_memory_state() {
    FILE* f = fopen("mem_state.txt", "w");
    if (!f) return;
    freopen("mem_state.txt", "w", stdout);
    print_memory_state();
    freopen("CON", "w", stdout);
    fclose(f);

    FILE* r = fopen("mem_state.txt", "r");
    if (!r) return;
    char buffer[4096];
    size_t len = fread(buffer, 1, sizeof(buffer) - 1, r);
    buffer[len] = '\0';
    fclose(r);

    GtkTextBuffer *buffer_widget = gtk_text_view_get_buffer(GTK_TEXT_VIEW(output_view));
    gtk_text_buffer_set_text(buffer_widget, buffer, -1);
}

void on_init_clicked(GtkButton *button, gpointer user_data) {
    init_memory(1024);
    block_count = 0;
    gui_print_memory_state();
}

void on_alloc_clicked(GtkButton *button, gpointer user_data) {
    const char* text = gtk_entry_get_text(GTK_ENTRY(input_entry));
    size_t size = atoi(text);
    if (block_count >= MAX_BLOCKS) return;
    void* ptr = alloc(size);
    if (ptr) {
        allocated_blocks[block_count++] = ptr;
    }
    gui_print_memory_state();
}

void on_free_clicked(GtkButton *button, gpointer user_data) {
    if (block_count == 0) return;
    void* ptr = allocated_blocks[--block_count];
    free_block(ptr);
    gui_print_memory_state();
}

void on_defrag_clicked(GtkButton *button, gpointer user_data) {
    defragment();
    gui_print_memory_state();
}

int main(int argc, char *argv[]) {
    gtk_init(&argc, &argv);

    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "🧠 Dynamic Memory Manager");
    gtk_window_set_default_size(GTK_WINDOW(window), 800, 600);
    gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);
    gtk_window_set_icon_from_file(GTK_WINDOW(window), "icon.png", NULL);

    GtkWidget *main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(main_box), 15);
    gtk_container_add(GTK_CONTAINER(window), main_box);

    input_entry = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(input_entry), "Enter allocation size (bytes)");
    gtk_box_pack_start(GTK_BOX(main_box), input_entry, FALSE, FALSE, 0);

    GtkWidget *button_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_box_pack_start(GTK_BOX(main_box), button_box, FALSE, FALSE, 0);

    GtkWidget *init_btn = gtk_button_new_with_label("🔄 Init");
    GtkWidget *alloc_btn = gtk_button_new_with_label("➕ Alloc");
    GtkWidget *free_btn = gtk_button_new_with_label("➖ Free");
    GtkWidget *defrag_btn = gtk_button_new_with_label("🧩 Defrag");

    gtk_widget_set_size_request(init_btn, 100, 40);
    gtk_widget_set_size_request(alloc_btn, 100, 40);
    gtk_widget_set_size_request(free_btn, 100, 40);
    gtk_widget_set_size_request(defrag_btn, 100, 40);

    gtk_box_pack_start(GTK_BOX(button_box), init_btn, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(button_box), alloc_btn, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(button_box), free_btn, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(button_box), defrag_btn, TRUE, TRUE, 0);

    output_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(output_view), FALSE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(output_view), GTK_WRAP_WORD_CHAR);
    gtk_widget_set_vexpand(output_view, TRUE);
    gtk_box_pack_start(GTK_BOX(main_box), output_view, TRUE, TRUE, 0);

    g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);
    g_signal_connect(init_btn, "clicked", G_CALLBACK(on_init_clicked), NULL);
    g_signal_connect(alloc_btn, "clicked", G_CALLBACK(on_alloc_clicked), NULL);
    g_signal_connect(free_btn, "clicked", G_CALLBACK(on_free_clicked), NULL);
    g_signal_connect(defrag_btn, "clicked", G_CALLBACK(on_defrag_clicked), NULL);

    gtk_widget_show_all(window);
    gtk_main();

    return 0;
}
