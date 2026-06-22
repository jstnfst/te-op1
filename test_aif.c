/*
 * test_aif.c — validates OP-1 Field .aif patch files against hardware-verified invariants.
 *
 * Usage: test_aif.exe <file.aif> [file2.aif ...]
 * Exit : 0 = all tests passed, 1 = one or more failures.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

/* Hardware-verified constants (oracle: oracle/amp-cwo-elem-0000.aif) */
#define EXPECTED_FILE_SIZE   58940u
#define EXPECTED_FVER_VAL    0xA2805140u
#define EXPECTED_CHANNELS    1
#define EXPECTED_FRAMES      28896u
#define EXPECTED_BITS        16
#define EXPECTED_SAMPLE_RATE 22050u
#define EXPECTED_APPL_DATA   1028u   /* "op-1" + JSON area */
#define APPL_JSON_MAX        1024
#define EXPECTED_SSND_AUDIO  57792u  /* EXPECTED_FRAMES * 1 ch * 2 bytes = 28896*2 */

static int g_pass = 0;
static int g_fail = 0;

static void check(int cond, const char *name)
{
    if (cond) { printf("  PASS  %s\n", name); g_pass++; }
    else       { printf("  FAIL  %s\n", name); g_fail++; }
}

static uint32_t u32be(const uint8_t *p)
{
    return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];
}
static uint16_t u16be(const uint8_t *p) { return ((uint16_t)p[0]<<8)|p[1]; }

static uint32_t read_80bit_ext(const uint8_t *p)
{
    uint16_t exp = ((uint16_t)(p[0] & 0x7F) << 8) | p[1];
    uint64_t man = 0;
    int i;
    for (i = 2; i < 10; i++) man = (man << 8) | p[i];
    if (!exp && !man) return 0;
    {
        int sh = (int)exp - 16383 - 63;
        if (sh >= 0)    return (uint32_t)(man << sh);
        if (sh > -64)   return (uint32_t)(man >> (-sh));
    }
    return 0;
}

/* Locate the JSON string inside the APPL data block.
   APPL layout: [4 "op-1"] [JSON...] [\n] [spaces...]
   Returns pointer into appl_data+4, sets *len to JSON byte count. */
static const char *appl_json(const uint8_t *appl_data, uint32_t appl_size, int *len)
{
    if (appl_size < 5) return NULL;
    if (memcmp(appl_data, "op-1", 4) != 0) return NULL;
    const char *j = (const char *)(appl_data + 4);
    int max = (int)(appl_size - 4);
    int n = 0;
    while (n < max && j[n] != '\n') n++;
    *len = n;
    return j;
}

static int json_has_key(const char *json, int jlen, const char *key)
{
    char pat[72];
    snprintf(pat, sizeof(pat), "\"%s\":", key);
    int plen = (int)strlen(pat);
    int i;
    for (i = 0; i <= jlen - plen; i++)
        if (memcmp(json + i, pat, (size_t)plen) == 0) return 1;
    return 0;
}

/* Verify all required keys appear in strict alphabetical order. */
static int json_keys_in_order(const char *json, int jlen)
{
    static const char *ORDER[] = {
        "adsr", "fx_active", "fx_params", "fx_type",
        "knobs", "lfo_active", "lfo_params", "lfo_type",
        "mtime", "name", "octave", "synth_version", "type",
        NULL
    };
    int search_from = 0;
    int i;
    for (i = 0; ORDER[i]; i++) {
        char pat[72];
        snprintf(pat, sizeof(pat), "\"%s\":", ORDER[i]);
        int plen = (int)strlen(pat);
        int found = -1, j;
        for (j = search_from; j <= jlen - plen; j++) {
            if (memcmp(json + j, pat, (size_t)plen) == 0) { found = j; break; }
        }
        if (found < 0) return 0;
        search_from = found + 1;
    }
    return 1;
}

/* mtime must be a positive floating-point number. */
static int json_mtime_valid(const char *json, int jlen)
{
    const char *pat = "\"mtime\":";
    int plen = (int)strlen(pat);
    int i;
    for (i = 0; i <= jlen - plen; i++) {
        if (memcmp(json + i, pat, (size_t)plen) == 0) {
            double v = 0.0;
            if (sscanf(json + i + plen, "%lf", &v) == 1 && v > 0.0) return 1;
            return 0;
        }
    }
    return 0;
}

static int test_file(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "Cannot open: %s\n", path); return 1; }

    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);

    uint8_t *buf = (uint8_t *)malloc((size_t)fsize);
    if (!buf) { fclose(f); fprintf(stderr, "Out of memory\n"); return 1; }
    if ((long)fread(buf, 1, (size_t)fsize, f) != fsize) {
        fclose(f); free(buf); fprintf(stderr, "Read error\n"); return 1;
    }
    fclose(f);

    printf("\n%s\n", path);

    /* ── Container ─────────────────────────────────────────────────────────── */
    check((uint32_t)fsize == EXPECTED_FILE_SIZE, "file size == 58940 bytes");
    check(fsize >= 12 &&
          memcmp(buf, "FORM", 4) == 0 &&
          memcmp(buf + 8, "AIFC", 4) == 0,
          "FORM/AIFC container header");

    /* ── Chunk parsing ─────────────────────────────────────────────────────── */
    const uint8_t *fver_d = NULL; uint32_t fver_sz = 0;
    const uint8_t *comm_d = NULL; uint32_t comm_sz = 0;
    const uint8_t *appl_d = NULL; uint32_t appl_sz = 0;
    const uint8_t *ssnd_d = NULL; uint32_t ssnd_sz = 0;

    char order[4][5] = {"","","",""};
    int nchunks = 0;

    uint32_t pos = 12;
    while (pos + 8 <= (uint32_t)fsize) {
        char id[5] = {0};
        memcpy(id, buf + pos, 4);
        uint32_t csz = u32be(buf + pos + 4);
        if (nchunks < 4) { memcpy(order[nchunks], id, 4); order[nchunks][4] = 0; }
        nchunks++;
        if      (strcmp(id, "FVER") == 0) { fver_d = buf+pos+8; fver_sz = csz; }
        else if (strcmp(id, "COMM") == 0) { comm_d = buf+pos+8; comm_sz = csz; }
        else if (strcmp(id, "APPL") == 0) { appl_d = buf+pos+8; appl_sz = csz; }
        else if (strcmp(id, "SSND") == 0) { ssnd_d = buf+pos+8; ssnd_sz = csz; }
        pos += 8 + csz + (csz & 1);
    }

    check(nchunks == 4 &&
          strcmp(order[0], "FVER") == 0 &&
          strcmp(order[1], "COMM") == 0 &&
          strcmp(order[2], "APPL") == 0 &&
          strcmp(order[3], "SSND") == 0,
          "chunk order: FVER COMM APPL SSND");

    /* ── FVER ──────────────────────────────────────────────────────────────── */
    check(fver_d && fver_sz >= 4 && u32be(fver_d) == EXPECTED_FVER_VAL,
          "FVER == 0xA2805140");

    /* ── COMM ──────────────────────────────────────────────────────────────── */
    if (comm_d && comm_sz >= 26) {
        check(u16be(comm_d)     == EXPECTED_CHANNELS,    "COMM channels == 1");
        check(u32be(comm_d + 2) == EXPECTED_FRAMES,      "COMM frames == 28896");
        check(u16be(comm_d + 6) == EXPECTED_BITS,        "COMM bit depth == 16");
        check(read_80bit_ext(comm_d + 8) == EXPECTED_SAMPLE_RATE, "COMM sample rate == 22050 Hz");
        check(comm_sz >= 22 && memcmp(comm_d + 18, "sowt", 4) == 0, "COMM codec == sowt");
    } else {
        check(0, "COMM channels == 1");
        check(0, "COMM frames == 28896");
        check(0, "COMM bit depth == 16");
        check(0, "COMM sample rate == 22050 Hz");
        check(0, "COMM codec == sowt");
    }

    /* ── APPL / JSON ───────────────────────────────────────────────────────── */
    check(appl_sz == EXPECTED_APPL_DATA,                       "APPL size == 1028 bytes");
    check(appl_d && appl_sz >= 4 && memcmp(appl_d,"op-1",4)==0,"APPL signature == \"op-1\"");

    int jlen = 0;
    const char *json = (appl_d && appl_sz >= 4)
                       ? appl_json(appl_d, appl_sz, &jlen)
                       : NULL;

    check(json && jlen > 0 && jlen <= APPL_JSON_MAX, "JSON length <= 1024 bytes");

    check(!json ||
          !((uint8_t)json[0] == 0xEF &&
            (uint8_t)json[1] == 0xBB &&
            (uint8_t)json[2] == 0xBF),
          "JSON no UTF-8 BOM");

    /* Required keys */
    {
        static const char *KEYS[] = {
            "adsr","fx_active","fx_params","fx_type",
            "knobs","lfo_active","lfo_params","lfo_type",
            "mtime","name","octave","synth_version","type", NULL
        };
        int k;
        for (k = 0; KEYS[k]; k++) {
            char label[80];
            snprintf(label, sizeof(label), "JSON has key \"%s\"", KEYS[k]);
            check(json && json_has_key(json, jlen, KEYS[k]), label);
        }
    }

    check(json && json_keys_in_order(json, jlen), "JSON keys in alphabetical order");
    check(json && json_mtime_valid(json, jlen),   "JSON mtime is a positive number");

    /* ── SSND ──────────────────────────────────────────────────────────────── */
    /* SSND data layout: [4 offset][4 blockSize][audio...] */
    check(ssnd_d && ssnd_sz >= 8 && (ssnd_sz - 8) == EXPECTED_SSND_AUDIO,
          "SSND audio == 57800 bytes");

    free(buf);
    return 0;
}

int main(int argc, char *argv[])
{
    int i;
    if (argc < 2) {
        fprintf(stderr, "Usage: test_aif.exe <file.aif> [file2.aif ...]\n");
        return 1;
    }
    for (i = 1; i < argc; i++)
        test_file(argv[i]);

    printf("\n%d passed, %d failed\n\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
