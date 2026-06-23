/*
 * op1_aif.h — shared binary helpers for OP-1 Field AIFF-C file tools
 */
#ifndef OP1_AIF_H
#define OP1_AIF_H

#include <stdint.h>
#include <stdio.h>

static inline uint32_t u32be(const uint8_t *p) {
    return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];
}

static inline uint16_t u16be(const uint8_t *p) {
    return ((uint16_t)p[0]<<8)|p[1];
}

/* Decode an IEEE 754 80-bit extended (big-endian, 10 bytes) to Hz. */
static inline uint32_t read_80bit_ext(const uint8_t *p) {
    uint16_t exp = ((uint16_t)(p[0] & 0x7F) << 8) | p[1];
    uint64_t man = 0;
    int i;
    for (i = 2; i < 10; i++) man = (man << 8) | p[i];
    if (!exp && !man) return 0;
    {
        int sh = (int)exp - 16383 - 63;
        if (sh >= 0)  return (uint32_t)(man <<  sh);
        if (sh > -64) return (uint32_t)(man >> -sh);
    }
    return 0;
}

/* Print a hex+ASCII dump of len bytes, labelled from base_offset. */
static inline void hex_dump(const uint8_t *buf, uint32_t base_offset, uint32_t len) {
    uint32_t i;
    for (i = 0; i < len; i += 16) {
        uint32_t j;
        printf("%06X  ", base_offset + i);
        for (j = 0; j < 16; j++) {
            if (i + j < len) printf("%02X ", buf[i + j]);
            else              printf("   ");
        }
        printf(" ");
        for (j = 0; j < 16 && i + j < len; j++) {
            uint8_t b = buf[i + j];
            printf("%c", (b >= 32 && b < 127) ? (char)b : '.');
        }
        printf("\n");
    }
}

#endif /* OP1_AIF_H */
