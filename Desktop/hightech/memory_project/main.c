#include "memory_manager.h"
#include <stdio.h>

int main() {
    init_memory(1024);

    void* a = alloc(100);
    void* b = alloc(200);
    void* c = alloc(150);

    free_block(a);
    free_block(c);

    printf("Before defragment:\n");
    print_memory_state();

    printf("After defragment:\n");
    defragment();
    print_memory_state();

    return 0;
}
