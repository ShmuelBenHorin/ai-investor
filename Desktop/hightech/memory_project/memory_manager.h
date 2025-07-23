#ifndef MEMORY_MANAGER_H
#define MEMORY_MANAGER_H

#include <stddef.h>

void init_memory(size_t size);
void* alloc(size_t size);
void free_block(void* ptr);
void print_memory_state();
void defragment();

#endif
