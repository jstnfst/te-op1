/*
 * explore-aif.c - OP-1 Field .aif file explorer
 *
 * Build: cl explore-aif.c /Fe:explore-aif.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: explore-aif.exe <file.aif> [flags]
 *
 *   --read-bytes [N]     hex dump first N bytes (default 128)
 *   --parse-chunks       walk IFF chunk tree
 *   --dump-chunk <ID>    hex+text dump of a specific chunk
 *   --show-json          extract and print JSON blocks
 *   --decode-fver        print FVER value
 *   --decode-comm        full COMM decode
 *   --analyze-ssnd       SSND audio statistics
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include "op1_aif.h"

static int  flag_read_bytes   = 0;
static int  flag_parse_chunks = 0;
static int  flag_show_json    = 0;
static int  flag_decode_fver  = 0;
static int  flag_decode_comm  = 0;
static int  flag_analyze_ssnd = 0;
static char flag_dump_chunk[8] = {0};
static int  byte_count = 128;

static uint8_t  *g_buf   = NULL;
static uint32_t  g_fsize = 0;

static void print_as_text(const uint8_t *data, uint32_t size) {
    uint32_t i;
    for (i = 0; i < size; i++) {
        uint8_t b = data[i];
        putchar((b >= 32 && b < 127) ? (char)b : '.');
    }
    putchar('\n');
}

/* ---- --read-bytes ---- */

static void do_read_bytes(void) {
    uint32_t count = (uint32_t)byte_count;
    if (count > g_fsize) count = g_fsize;
    printf("\n=== First %u bytes ===\n", count);
    hex_dump(g_buf, 0, count);
}

/* ---- --parse-chunks ---- */

static void do_parse_chunks(void) {
    uint32_t pos = 12;
    uint32_t form_size = u32be(g_buf + 4);
    printf("\n=== AIFF Chunk Structure ===\n");
    printf("FORM ID   : %.4s\n",  g_buf);
    printf("FORM size : %u\n",    form_size);
    printf("Form type : %.4s\n\n", g_buf + 8);

    if (memcmp(g_buf, "FORM", 4) != 0)
        fprintf(stderr, "Warning: not a valid IFF file\n");

    while (pos + 8 <= g_fsize) {
        char id[5]  = {0};
        memcpy(id, g_buf + pos, 4);
        uint32_t csz  = u32be(g_buf + pos + 4);
        uint32_t data = pos + 8;

        printf("  [%06X] '%s'  size=%u\n", pos, id, csz);

        if (strcmp(id, "COMM") == 0 && csz >= 18) {
            uint16_t ch = u16be(g_buf + data);
            uint32_t fr = u32be(g_buf + data + 2);
            uint16_t bd = u16be(g_buf + data + 6);
            printf("           Channels=%u  Frames=%u  BitDepth=%u\n", ch, fr, bd);
        } else if (strcmp(id, "APPL") == 0 && csz >= 4) {
            printf("           App signature: '%.4s'\n", g_buf + data);
        }

        pos = data + csz + (csz & 1);
    }
}

/* ---- --dump-chunk ---- */

static void do_dump_chunk(void) {
    uint32_t pos = 12;
    int found = 0;
    printf("\n=== Chunk dump: '%s' ===\n", flag_dump_chunk);

    while (pos + 8 <= g_fsize) {
        char id[5] = {0};
        memcpy(id, g_buf + pos, 4);
        uint32_t csz  = u32be(g_buf + pos + 4);
        uint32_t data = pos + 8;

        if (strcmp(id, flag_dump_chunk) == 0) {
            found = 1;
            printf("Found '%s' at offset 0x%06X, size=%u\n", flag_dump_chunk, pos, csz);
            hex_dump(g_buf + data, data, csz);
            printf("--- as text ---\n");
            print_as_text(g_buf + data, csz);
        }

        pos = data + csz + (csz & 1);
    }
    if (!found)
        fprintf(stderr, "Warning: chunk '%s' not found in file\n", flag_dump_chunk);
}

/* ---- --show-json ---- */

static void do_show_json(void) {
    int depth = 0, found = 0;
    uint32_t start = 0, i;
    printf("\n=== JSON-like content scan ===\n");

    for (i = 0; i < g_fsize; i++) {
        uint8_t c = g_buf[i];
        if (c == '{') {
            if (depth == 0) start = i;
            depth++;
        } else if (c == '}') {
            depth--;
            if (depth == 0) {
                found = 1;
                printf("--- JSON block at offset 0x%06X ---\n", start);
                fwrite(g_buf + start, 1, i - start + 1, stdout);
                putchar('\n');
            }
        }
    }
    if (!found)
        printf("Warning: No JSON-like blocks found\n");
}

/* ---- --decode-fver ---- */

static void do_decode_fver(void) {
    uint32_t pos = 12;
    int found = 0;
    printf("\n=== FVER Chunk ===\n");

    while (pos + 8 <= g_fsize) {
        char id[5] = {0};
        memcpy(id, g_buf + pos, 4);
        uint32_t csz  = u32be(g_buf + pos + 4);
        uint32_t data = pos + 8;

        if (strcmp(id, "FVER") == 0 && csz >= 4) {
            found = 1;
            uint32_t ver = u32be(g_buf + data);
            printf("  Raw value : 0x%08X\n", ver);
            if (ver == 0xA2805140u)
                printf("  Meaning   : AIFC format version 1 (standard, value 0xA2805140)\n");
            else
                printf("  Meaning   : Unknown version\n");
        }

        pos = data + csz + (csz & 1);
    }
    if (!found)
        fprintf(stderr, "Warning: FVER chunk not found\n");
}

/* ---- --decode-comm ---- */

static void do_decode_comm(void) {
    uint32_t pos = 12;
    int found = 0;
    printf("\n=== COMM Chunk (full decode) ===\n");

    while (pos + 8 <= g_fsize) {
        char id[5] = {0};
        memcpy(id, g_buf + pos, 4);
        uint32_t csz  = u32be(g_buf + pos + 4);
        uint32_t data = pos + 8;

        if (strcmp(id, "COMM") == 0 && csz >= 18) {
            const uint8_t *ext = g_buf + data + 8;
            uint16_t biased_exp = ((uint16_t)(ext[0] & 0x7F) << 8) | ext[1];
            uint32_t mant_hi    = u32be(ext + 2);
            uint32_t hz         = read_80bit_ext(ext);

            found = 1;
            printf("  numChannels  : %u\n",  u16be(g_buf + data));
            printf("  numFrames    : %u\n",  u32be(g_buf + data + 2));
            printf("  sampleSize   : %u-bit\n", u16be(g_buf + data + 6));
            printf("  sampleRate   : %u Hz  (from 80-bit extended: exp=%u mantHi=0x%08X)\n",
                   hz, biased_exp, mant_hi);
            {
                uint32_t frames = u32be(g_buf + data + 2);
                if (hz) printf("  Duration     : %.4f seconds\n", (double)frames / hz);
            }

            if (csz >= 24) {
                char comp[5] = {0};
                memcpy(comp, g_buf + data + 18, 4);
                uint8_t plen = g_buf[data + 22];
                char name[256] = {0};
                uint32_t nm = plen < 255 ? plen : 255;
                if (data + 23 + nm <= g_fsize)
                    memcpy(name, g_buf + data + 23, nm);

                printf("  comprType    : '%s'\n", comp);
                printf("  comprName    : '%s'\n", name);

                if      (strcmp(comp, "NONE") == 0) printf("  Meaning      : Uncompressed big-endian PCM\n");
                else if (strcmp(comp, "sowt") == 0) printf("  Meaning      : Uncompressed little-endian signed PCM\n");
                else if (strcmp(comp, "fl32") == 0) printf("  Meaning      : 32-bit float PCM\n");
                else if (strcmp(comp, "alaw") == 0) printf("  Meaning      : A-law compressed\n");
                else if (strcmp(comp, "ulaw") == 0) printf("  Meaning      : mu-law compressed\n");
                else                                 printf("  Meaning      : Unknown compression type\n");
            }

            printf("\n  Raw hex of COMM data:\n");
            hex_dump(g_buf + data, data, csz);
        }

        pos = data + csz + (csz & 1);
    }
    if (!found)
        fprintf(stderr, "Warning: COMM chunk not found\n");
}

/* ---- --analyze-ssnd ---- */

static void do_analyze_ssnd(void) {
    uint32_t pos = 12;
    int found = 0;
    printf("\n=== SSND Chunk Analysis ===\n");

    while (pos + 8 <= g_fsize) {
        char id[5] = {0};
        memcpy(id, g_buf + pos, 4);
        uint32_t csz  = u32be(g_buf + pos + 4);
        uint32_t data = pos + 8;

        if (strcmp(id, "SSND") == 0 && csz >= 8) {
            uint32_t ssnd_off   = u32be(g_buf + data);
            uint32_t ssnd_blk   = u32be(g_buf + data + 4);
            uint32_t audio_start = data + 8 + ssnd_off;
            uint32_t audio_bytes = csz - 8 - ssnd_off;
            uint32_t num_samples = audio_bytes / 2;
            uint32_t i;

            found = 1;
            printf("  Chunk size   : %u bytes\n", csz);
            printf("  SSND offset  : %u  (bytes before audio data)\n", ssnd_off);
            printf("  SSND blkSize : %u  (0 = not block-aligned)\n",   ssnd_blk);
            printf("  Audio start  : 0x%06X\n",   audio_start);
            printf("  Audio bytes  : %u\n",        audio_bytes);
            printf("  Num samples  : %u\n",        num_samples);

            int min_val = 32767, max_val = -32768;
            uint32_t zero_count = 0;

            for (i = 0; i < num_samples; i++) {
                uint32_t off = audio_start + i * 2;
                if (off + 1 >= g_fsize) break;
                int sample = (int)(int16_t)((g_buf[off + 1] << 8) | g_buf[off]);
                if (sample < min_val) min_val = sample;
                if (sample > max_val) max_val = sample;
                if (sample == 0) zero_count++;
            }

            {
                int peak = abs(min_val) > abs(max_val) ? abs(min_val) : abs(max_val);
                double silence = num_samples ? (double)zero_count / num_samples * 100.0 : 0.0;
                double dbfs = 20.0 * log10((double)peak / 32767.0 + 1e-10);

                printf("  Min sample   : %d  (%.4f normalized)\n", min_val, min_val / 32768.0);
                printf("  Max sample   : %d  (%.4f normalized)\n", max_val, max_val / 32767.0);
                printf("  Zero samples : %u / %u  (%.1f%% silence)\n", zero_count, num_samples, silence);
                printf("  Peak level   : %.2f dBFS\n", dbfs);
            }

            {
                uint32_t end = audio_start + audio_bytes;
                uint32_t first_end = audio_start + 32 < end ? audio_start + 32 : end;
                uint32_t tail_start = end > 32 ? end - 32 : audio_start;

                printf("\n  First 32 bytes of audio data:\n");
                hex_dump(g_buf + audio_start, audio_start, first_end - audio_start);
                printf("  Last 32 bytes of audio data:\n");
                hex_dump(g_buf + tail_start,  tail_start,  end - tail_start);
            }
        }

        pos = data + csz + (csz & 1);
    }
    if (!found)
        fprintf(stderr, "Warning: SSND chunk not found\n");
}

/* ---- main ---- */

int main(int argc, char *argv[]) {
    int i;
    FILE *f;
    long fsz;

    if (argc < 2) {
        fprintf(stderr,
            "Usage: %s <file.aif> [--read-bytes [N]] [--parse-chunks]\n"
            "                     [--dump-chunk <ID>] [--show-json]\n"
            "                     [--decode-fver] [--decode-comm] [--analyze-ssnd]\n",
            argv[0]);
        return 1;
    }

    for (i = 2; i < argc; i++) {
        if (strcmp(argv[i], "--read-bytes") == 0) {
            flag_read_bytes = 1;
            if (i + 1 < argc && argv[i+1][0] != '-') {
                byte_count = atoi(argv[++i]);
                if (byte_count <= 0) byte_count = 128;
            }
        } else if (strcmp(argv[i], "--parse-chunks") == 0) {
            flag_parse_chunks = 1;
        } else if (strcmp(argv[i], "--dump-chunk") == 0 && i + 1 < argc) {
            strncpy(flag_dump_chunk, argv[++i], 4);
        } else if (strcmp(argv[i], "--show-json") == 0) {
            flag_show_json = 1;
        } else if (strcmp(argv[i], "--decode-fver") == 0) {
            flag_decode_fver = 1;
        } else if (strcmp(argv[i], "--decode-comm") == 0) {
            flag_decode_comm = 1;
        } else if (strcmp(argv[i], "--analyze-ssnd") == 0) {
            flag_analyze_ssnd = 1;
        }
    }

    f = fopen(argv[1], "rb");
    if (!f) { perror(argv[1]); return 1; }
    fseek(f, 0, SEEK_END);
    fsz = ftell(f);
    rewind(f);
    g_buf = (uint8_t *)malloc((size_t)fsz);
    if (!g_buf) { fclose(f); fprintf(stderr, "Out of memory\n"); return 1; }
    fread(g_buf, 1, (size_t)fsz, f);
    fclose(f);
    g_fsize = (uint32_t)fsz;

    printf("File: %s  (%u bytes)\n", argv[1], g_fsize);

    if (flag_read_bytes)    do_read_bytes();
    if (flag_parse_chunks)  do_parse_chunks();
    if (flag_dump_chunk[0]) do_dump_chunk();
    if (flag_show_json)     do_show_json();
    if (flag_decode_fver)   do_decode_fver();
    if (flag_decode_comm)   do_decode_comm();
    if (flag_analyze_ssnd)  do_analyze_ssnd();

    free(g_buf);
    return 0;
}
