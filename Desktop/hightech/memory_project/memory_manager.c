// memory_manager.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct Block {
    size_t size;
    int free;
    struct Block* next;
    void* data;
} Block;

static void* memory = NULL;
static size_t memory_size = 0;
static Block* head = NULL;

void init_memory(size_t size) {
    memory = malloc(size);
    memory_size = size;
    head = (Block*)malloc(sizeof(Block));
    head->size = size;
    head->free = 1;
    head->next = NULL;
    head->data = memory;
}

void* alloc(size_t size) {
    Block* curr = head;
    while (curr) {
        if (curr->free && curr->size >= size) {
            if (curr->size > size + sizeof(Block)) {
                Block* new_block = (Block*)malloc(sizeof(Block));
                new_block->size = curr->size - size - sizeof(Block);
                new_block->free = 1;
                new_block->next = curr->next;
                new_block->data = (char*)curr->data + size;

                curr->size = size;
                curr->next = new_block;
            }
            curr->free = 0;
            return curr->data;
        }
        curr = curr->next;
    }
    return NULL;
}

void free_block(void* ptr) {
    Block* curr = head;
    while (curr) {
        if (curr->data == ptr) {
            curr->free = 1;
            return;
        }
        curr = curr->next;
    }
}

void print_memory_state() {
    Block* curr = head;
    int index = 0;
    while (curr) {
        printf("Block %d: %s (%zu bytes)\n", index, curr->free ? "Free" : "Used", curr->size);
        curr = curr->next;
        index++;
    }
}
void defragment() {
    Block* curr = head;
    while (curr && curr->next) {
        if (curr->free && curr->next->free) {
            Block* next_block = curr->next;
            curr->size += next_block->size + sizeof(Block);
            curr->next = next_block->next;
            free(next_block);
        } else {
            curr = curr->next;
        }
    }
}

