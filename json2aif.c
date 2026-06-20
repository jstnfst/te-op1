/*
 * json2aif.c — create an OP-1 Field AIFF-C patch file from a JSON file
 *
 * Usage:
 *   json2aif <patch.json> [output.aif]        — pass-through
 *   json2aif zero <patch.json> [output.aif]   — zero knobs/fx_params/lfo_params
 *   json2aif max  <patch.json> [output.aif]   — set all three arrays to 32767
 *
 * Reads synth metadata from <patch.json>.
 * Produces an AIFF-C file with:
 *   - Standard AIFC container (FVER + COMM + APPL + SSND)
 *   - COMM: mono, 16-bit, 44100 Hz, sowt (little-endian signed PCM)
 *   - APPL: "op-1" signature + JSON padded to 1028 bytes (OP-1 fixed size)
 *   - SSND: 1 second of silence (44100 zero samples)
 *
 * NOTE: epiphany.aif uses 22050 Hz. If the OP-1 Field rejects 44100 Hz
 * synth patches, change SAMPLE_RATE to 22050 and NUM_FRAMES accordingly.
 *
 * Build: cl json2aif.c /Fe:json2aif.exe /D_CRT_SECURE_NO_WARNINGS
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

/* ---- tunables ------------------------------------------------------------ */

#define SAMPLE_RATE   44100
#define NUM_CHANNELS  1
#define BIT_DEPTH     16
#define DURATION_SEC  1
#define NUM_FRAMES    (SAMPLE_RATE * DURATION_SEC)   /* 44100 */

/* OP-1 APPL chunk: fixed 1028 bytes (4-byte "op-1" sig + 1024-byte JSON area) */
#define APPL_DATA_SIZE  1028
#define APPL_JSON_MAX   (APPL_DATA_SIZE - 4)   /* 1024 */

/* ---- big-endian write helpers -------------------------------------------- */

static void w16(uint8_t *p, uint16_t v) {
    p[0] = (v >> 8) & 0xFF;
    p[1] =  v       & 0xFF;
}

static void w32(uint8_t *p, uint32_t v) {
    p[0] = (v >> 24) & 0xFF;
    p[1] = (v >> 16) & 0xFF;
    p[2] = (v >>  8) & 0xFF;
    p[3] =  v        & 0xFF;
}

/*
 * Write a sample rate as an IEEE 754 80-bit extended (10 bytes, big-endian).
 * Only handles integer Hz values representable with mantissa <= 2^16.
 */
static void write_80bit_extended(uint8_t *p, uint32_t hz) {
    /* Find highest set bit to determine exponent */
    int exp = 0;
    uint32_t tmp = hz;
    while (tmp > 1) { tmp >>= 1; exp++; }
    /* Biased exponent for 80-bit extended: bias = 16383 */
    uint16_t biased_exp = (uint16_t)(exp + 16383);
    /* Explicit-integer mantissa: hz shifted left to fill 64 bits */
    uint64_t mantissa = (uint64_t)hz << (63 - exp);

    p[0] = (biased_exp >> 8) & 0xFF;
    p[1] =  biased_exp       & 0xFF;
    p[2] = (uint8_t)(mantissa >> 56);
    p[3] = (uint8_t)(mantissa >> 48);
    p[4] = (uint8_t)(mantissa >> 40);
    p[5] = (uint8_t)(mantissa >> 32);
    p[6] = (uint8_t)(mantissa >> 24);
    p[7] = (uint8_t)(mantissa >> 16);
    p[8] = (uint8_t)(mantissa >>  8);
    p[9] = (uint8_t)(mantissa      );
}

/* ---- output path helpers ------------------------------------------------- */

static char *make_aif_path(const char *json_path) {
    size_t len = strlen(json_path);
    char *out = malloc(len + 5);
    if (!out) return NULL;
    memcpy(out, json_path, len);
    out[len] = '\0';

    char *dot = strrchr(out, '.');
    char *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bsep = strrchr(out, '\\');
    if (!sep || (bsep && bsep > sep)) sep = bsep;
#endif
    if (dot && (!sep || dot > sep))
        strcpy(dot, ".aif");
    else
        strcpy(out + len, ".aif");
    return out;
}

/* Like make_aif_path but inserts _<suffix> before the .aif extension.
   foo.json -> foo_zero.aif  (suffix="zero") */
static char *make_aif_path_mode(const char *json_path, const char *suffix)
{
    size_t len  = strlen(json_path);
    size_t slen = strlen(suffix);
    char *out = malloc(len + slen + 6);   /* _<suffix>.aif\0 */
    if (!out) return NULL;
    memcpy(out, json_path, len);
    out[len] = '\0';

    char *dot = strrchr(out, '.');
    char *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bsep = strrchr(out, '\\');
    if (!sep || (bsep && bsep > sep)) sep = bsep;
#endif
    if (dot && (!sep || dot > sep)) *dot = '\0';   /* strip extension */

    strcat(out, "_");
    strcat(out, suffix);
    strcat(out, ".aif");
    return out;
}

/* ---- JSON array replacement ---------------------------------------------- */

/*
 * In src (length srclen), replace the first occurrence of "key":[...] with
 * "key":[fill,fill,...,fill] (always 8 values) and write the result to out.
 * Returns the new string length, or -1 if the key is not found.
 */
static int json_replace_array(const char *src, size_t srclen,
                               char *out,  size_t outsz,
                               const char *key, int fill)
{
    char pat[64];
    snprintf(pat, sizeof(pat), "\"%s\":[", key);

    const char *p = strstr(src, pat);
    if (!p) return -1;

    /* copy everything up to and including the opening '[' */
    size_t prefix = (size_t)(p - src) + strlen(pat);
    if (prefix >= outsz) return -1;
    memcpy(out, src, prefix);
    size_t pos = prefix;

    /* write 8 fill values */
    for (int i = 0; i < 8; i++) {
        int w = snprintf(out + pos, outsz - pos, "%s%d", i ? "," : "", fill);
        if (w <= 0 || (size_t)w >= outsz - pos) return -1;
        pos += (size_t)w;
    }

    /* closing bracket */
    if (pos >= outsz - 1) return -1;
    out[pos++] = ']';

    /* skip the old array in src (find matching ']') and copy the rest */
    const char *arr_open  = p + strlen(pat) - 1;   /* points at '[' in src */
    const char *arr_close = strchr(arr_open, ']');
    if (!arr_close) return -1;
    arr_close++;                                     /* step past ']' */

    size_t rest = srclen - (size_t)(arr_close - src);
    if (pos + rest >= outsz) return -1;
    memcpy(out + pos, arr_close, rest);
    pos += rest;
    out[pos] = '\0';
    return (int)pos;
}

/* ---- chunk builders ------------------------------------------------------ */

/* Write 8-byte chunk header (ID + big-endian size) and return new pos */
static uint32_t write_chunk_header(uint8_t *buf, uint32_t pos,
                                   const char *id, uint32_t size) {
    memcpy(buf + pos, id, 4);
    w32(buf + pos + 4, size);
    return pos + 8;
}

/* ---- main ---------------------------------------------------------------- */

int main(int argc, char *argv[]) {
    /* detect optional zero / max subcommand */
    int  mode      = 0;   /* 0 = pass-through, 1 = zero, 2 = max */
    int  arg_shift = 0;
    if (argc >= 2) {
        if      (strcmp(argv[1], "zero") == 0) { mode = 1; arg_shift = 1; }
        else if (strcmp(argv[1], "max")  == 0) { mode = 2; arg_shift = 1; }
    }
    int    real_argc = argc - arg_shift;
    char **real_argv = argv + arg_shift;

    if (real_argc < 2 || real_argc > 3) {
        fprintf(stderr, "Usage: %s [zero|max] <patch.json> [output.aif]\n", argv[0]);
        return 1;
    }
    const char *json_path = real_argv[1];

    /* --- read and validate JSON --- */
    FILE *jf = fopen(json_path, "rb");
    if (!jf) { perror(json_path); return 1; }
    fseek(jf, 0, SEEK_END);
    long json_size = ftell(jf);
    rewind(jf);

    char *json_raw = malloc(json_size + 1);
    if (!json_raw) { fprintf(stderr, "out of memory\n"); return 1; }
    fread(json_raw, 1, json_size, jf);
    fclose(jf);
    json_raw[json_size] = '\0';

    /* strip trailing whitespace */
    while (json_size > 0 && (json_raw[json_size-1] == '\n' ||
                              json_raw[json_size-1] == '\r' ||
                              json_raw[json_size-1] == ' '))
        json_size--;
    json_raw[json_size] = '\0';

    /* --- apply zero / max transform if requested ---
     * Scratch buffers ping-pong so we never write back into json_raw,
     * which may be too small for the expanded (max) result.            */
    static char scratch[2][APPL_JSON_MAX + 2];
    const char *json_write_ptr  = json_raw;
    long        json_write_size = json_size;

    if (mode != 0) {
        static const char *KEYS[] = { "knobs", "fx_params", "lfo_params" };
        int         fill = (mode == 1) ? 0 : 32767;
        int         cur  = 0;
        const char *src  = json_raw;
        size_t      slen = (size_t)json_size;

        for (int k = 0; k < 3; k++) {
            int r = json_replace_array(src, slen,
                                       scratch[cur], sizeof(scratch[0]),
                                       KEYS[k], fill);
            if (r > 0) {
                src  = scratch[cur];
                slen = (size_t)r;
                cur ^= 1;
            }
        }
        json_write_ptr  = src;
        json_write_size = (long)slen;
    }

    if (json_write_size > APPL_JSON_MAX) {
        fprintf(stderr, "JSON too large (%ld bytes, max %d)\n",
                json_write_size, APPL_JSON_MAX);
        return 1;
    }

    /* -----------------------------------------------------------------------
     * Chunk sizes:
     *
     * FVER  data: 4 bytes
     * COMM  data: 2 (channels) + 4 (frames) + 2 (bitdepth)
     *             + 10 (80-bit rate) + 4 (comprType) + 42 (pascal string) = 64
     * APPL  data: 1028 (fixed OP-1 size)
     * SSND  data: 4 (offset) + 4 (blockSize) + NUM_FRAMES*2 (audio)
     * ---------------------------------------------------------------------- */

    static const char *COMPR_NAME = "Signed integer (little-endian) linear PCM";
    uint8_t pascal_len = (uint8_t)strlen(COMPR_NAME);  /* 41 = 0x29 */
    /* Pascal string must be padded to even total length (len byte + chars).
       41 chars + 1 len byte = 42 bytes — already even, no padding needed. */
    uint32_t pascal_total = 1 + pascal_len;  /* 42 */
    uint32_t comm_size = 2 + 4 + 2 + 10 + 4 + pascal_total;  /* 64 */

    uint32_t audio_bytes = NUM_FRAMES * (BIT_DEPTH / 8);   /* 88200 */
    uint32_t ssnd_size   = 4 + 4 + audio_bytes;            /* 88208 */

    uint32_t form_body =
        (8 + 4)          +   /* FVER */
        (8 + comm_size)  +   /* COMM */
        (8 + APPL_DATA_SIZE) +   /* APPL */
        (8 + ssnd_size);     /* SSND */

    uint32_t total_size = 12 + form_body;

    uint8_t *buf = calloc(1, total_size);  /* calloc zeroes audio for us */
    if (!buf) { fprintf(stderr, "out of memory\n"); return 1; }

    uint32_t pos = 0;

    /* --- FORM header --- */
    memcpy(buf + pos, "FORM", 4); pos += 4;
    w32(buf + pos, form_body);    pos += 4;
    memcpy(buf + pos, "AIFC", 4); pos += 4;

    /* --- FVER chunk --- */
    pos = write_chunk_header(buf, pos, "FVER", 4);
    w32(buf + pos, 0xA2805140);  /* the one and only AIFC version constant */
    pos += 4;

    /* --- COMM chunk --- */
    pos = write_chunk_header(buf, pos, "COMM", comm_size);
    w16(buf + pos, NUM_CHANNELS);   pos += 2;
    w32(buf + pos, NUM_FRAMES);     pos += 4;
    w16(buf + pos, BIT_DEPTH);      pos += 2;
    write_80bit_extended(buf + pos, SAMPLE_RATE); pos += 10;
    memcpy(buf + pos, "sowt", 4);   pos += 4;
    buf[pos++] = pascal_len;
    memcpy(buf + pos, COMPR_NAME, pascal_len); pos += pascal_len;
    /* pascal_total is 42 (even) so no pad byte needed */

    /* --- APPL chunk --- */
    pos = write_chunk_header(buf, pos, "APPL", APPL_DATA_SIZE);
    memcpy(buf + pos, "op-1", 4);                           pos += 4;
    memcpy(buf + pos, json_write_ptr, json_write_size);     pos += json_write_size;
    buf[pos++] = '\n';
    /* fill remainder of 1024-byte JSON area with spaces */
    uint32_t remaining = APPL_JSON_MAX - (uint32_t)json_write_size - 1;
    memset(buf + pos, ' ', remaining);  pos += remaining;

    /* --- SSND chunk --- */
    pos = write_chunk_header(buf, pos, "SSND", ssnd_size);
    w32(buf + pos, 0); pos += 4;   /* offset */
    w32(buf + pos, 0); pos += 4;   /* blockSize */
    /* audio: already zeroed by calloc — 44100 frames of silence */
    pos += audio_bytes;

    /* --- write output file --- */
    char *out_path;
    int   out_path_allocated = 0;
    if (real_argc == 3) {
        out_path = (char *)real_argv[2];
    } else if (mode == 1) {
        out_path = make_aif_path_mode(json_path, "zero");
        out_path_allocated = 1;
    } else if (mode == 2) {
        out_path = make_aif_path_mode(json_path, "max");
        out_path_allocated = 1;
    } else {
        out_path = make_aif_path(json_path);
        out_path_allocated = 1;
    }
    if (!out_path) { fprintf(stderr, "out of memory\n"); return 1; }

    FILE *of = fopen(out_path, "wb");
    if (!of) { perror(out_path); return 1; }
    if (fwrite(buf, 1, total_size, of) != total_size) {
        fprintf(stderr, "write error: %s\n", out_path); return 1;
    }
    fclose(of);

    printf("Wrote %s\n", out_path);
    printf("  FVER : 0xA2805140 (AIFC standard)\n");
    printf("  COMM : %u ch, %u frames, %u-bit, %u Hz, sowt\n",
           NUM_CHANNELS, NUM_FRAMES, BIT_DEPTH, SAMPLE_RATE);
    printf("  APPL : %d bytes  (%ld bytes JSON + padding)\n",
           APPL_DATA_SIZE, json_write_size);
    printf("  SSND : %u bytes  (%u frames silence)\n", ssnd_size, NUM_FRAMES);
    printf("  Total: %u bytes\n", total_size);

    free(json_raw);
    free(buf);
    if (out_path_allocated) free(out_path);
    return 0;
}
