/*
 * mondo.c - OP-1 Field patch tool multi-tool
 *
 * Subcommands (each was previously its own .exe):
 *   mondo dump      <file.aif | directory>                       (was op1dump.exe)
 *   mondo build     [zero|max] <patch.json> [output.aif]         (was json2aif.exe)
 *   mondo build     <directory>
 *   mondo build     explore [-dest <synth|envelope|fx|mix>] [-param <N>]
 *   mondo test      <file.aif> [file2.aif ...]                   (was test_aif.exe)
 *   mondo diff      <file_a> <file_b>                            (was diff-patches.exe)
 *   mondo explore   <file.aif> [flags]                           (was explore-aif.exe)
 *   mondo summarize                                              (was summarize.exe)
 *   mondo rename    <patch.json [patch2.json ...] | directory>   (was rename-patch.exe)
 *   mondo sort      <patch.aif | directory>                      (was sort-synths.exe)
 *   mondo tag       <patch.json [patch2.json ...] | directory>   (was tag-patch.exe)
 *   mondo wrap      <input.aif|.wav> [output.aif]                (was wrap-sampler.exe)
 *   mondo wrap      <directory>
 *   mondo samples   <preset.json | directory> [output.js]        (was dump-samples.exe)
 *
 * Build: cl mondo.c cJSON.c /Fe:mondo.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <math.h>
#ifdef _WIN32
#include <io.h>        /* _findfirst, _findnext */
#include <windows.h>
#endif
#include "op1_aif.h"
#include "cJSON.h"

/* ---- macros shared verbatim (same name, same value) across two or more
   subcommands - defined once here instead of once per subcommand. ---- */
#define MAX_LABEL   48   /* max chars per param name (dump, summarize) */
#define MAX_PARAMS   8   /* knob/param slot count (dump, summarize) */
#define BIT_DEPTH   16   /* sampler bit depth (build, wrap) */

/* ---- struct shared verbatim across four subcommands ---- */
typedef struct { int processed; int failed; } WalkStats;

/* =========================================================================
 * ============================  mondo dump  ==============================
 * (was op1dump.c - dump OP-1 Field synth metadata from an AIFF file)
 * ========================================================================= */

#define PARAMS_FILE  "op1-params.json"

/* ---- minimal JSON extractors ---- */

static const char *dump_json_find_value(const char *json, const char *key) {
    /* Match the quoted key, then tolerate whitespace around the colon so both
       compact ("type":"x") and pretty-printed ("type" : "x") JSON work - the
       latter is what hardware-exported patches use. */
    char search[128];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return NULL;
    p += strlen(search);
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != ':') return NULL;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    return p;
}

static int dump_json_get_string(const char *json, const char *key,
                           char *out, size_t outsz) {
    const char *p = dump_json_find_value(json, key);
    if (!p || *p != '"') return 0;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return 1;
}

static int dump_json_get_int(const char *json, const char *key, int *out) {
    const char *p = dump_json_find_value(json, key);
    if (!p) return 0;
    return sscanf(p, "%d", out) == 1;
}

static int json_get_double(const char *json, const char *key, double *out) {
    const char *p = dump_json_find_value(json, key);
    if (!p) return 0;
    return sscanf(p, "%lf", out) == 1;
}

static int dump_json_get_bool(const char *json, const char *key, int *out) {
    const char *p = dump_json_find_value(json, key);
    if (!p) return 0;
    if (strncmp(p, "true",  4) == 0) { *out = 1; return 1; }
    if (strncmp(p, "false", 5) == 0) { *out = 0; return 1; }
    return 0;
}

static int dump_json_get_int_array(const char *json, const char *key,
                              int *arr, int maxlen) {
    const char *p = dump_json_find_value(json, key);
    if (!p || *p != '[') return 0;
    p++;
    int count = 0;
    while (count < maxlen) {
        while (*p == ' ' || *p == '\n' || *p == '\r') p++;
        if (*p == ']' || *p == '\0') break;
        if (sscanf(p, "%d", &arr[count]) != 1) break;
        count++;
        while (*p && *p != ',' && *p != ']') p++;
        if (*p == ',') p++;
    }
    return count;
}

/*
 * Extract a JSON string array: ["a", "b", null, "c"] into out[0..maxn-1].
 * null entries and empty strings produce an empty string in out.
 * Returns the number of elements parsed.
 */
static int json_get_string_array(const char *p,
                                 char out[][MAX_LABEL], int maxn) {
    if (!p) return 0;
    while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') p++;
    if (*p != '[') return 0;
    p++;
    int count = 0;
    while (count < maxn) {
        while (*p == ' ' || *p == '\n' || *p == '\r' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;
        if (*p == '"') {
            p++;
            int i = 0;
            while (*p && *p != '"' && i + 1 < MAX_LABEL) out[count][i++] = *p++;
            out[count][i] = '\0';
            if (*p == '"') p++;
        } else if (strncmp(p, "null", 4) == 0) {
            out[count][0] = '\0';
            p += 4;
        } else {
            break;
        }
        count++;
    }
    return count;
}

/* ---- param file (op1-params.json) ---- */

static char *g_params_json = NULL;  /* loaded once, kept for lifetime */

static void load_params_file(void) {
    FILE *f = fopen(PARAMS_FILE, "rb");
    if (!f) return;  /* not found - all types will show as unmapped */
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    g_params_json = malloc(sz + 1);
    if (!g_params_json) { fclose(f); return; }
    fread(g_params_json, 1, sz, f);
    g_params_json[sz] = '\0';
    fclose(f);
}

/*
 * Look up labels for a given group ("synth", "fx", "lfo") and type name.
 * Fills out[0..MAX_PARAMS-1] and returns the count of entries found.
 * Returns 0 if the type is not in the params file.
 */
static int dump_get_labels(const char *group, const char *type,
                      char out[][MAX_LABEL]) {
    if (!g_params_json) return 0;
    char key[128];
    snprintf(key, sizeof(key), "%s.%s", group, type);
    const char *p = dump_json_find_value(g_params_json, key);
    if (!p) return 0;
    return json_get_string_array(p, out, MAX_PARAMS);
}

/* ---- display helpers ---- */

static float op1_norm(int v) { return (float)v / 32767.0f; }

/*
 * Print a labeled parameter block.
 *
 * - Named params (non-empty label) are always shown.
 * - Unnamed params (empty label or not in file) are shown only when non-zero,
 *   tagged [unknown] so they can be identified and added to op1-params.json.
 */
static void print_params(const char *section, const char *type,
                         const int *arr, int n,
                         char labels[][MAX_LABEL], int nlabels) {
    int mapped = (nlabels > 0);
    printf("  %s (%s)%s:\n", section, type,
           mapped ? "" : "  [not in op1-params.json]");

    for (int i = 0; i < n; i++) {
        const char *label = (i < nlabels && labels[i][0]) ? labels[i] : NULL;
        if (label) {
            printf("    %-16s : %6d  (%.3f)\n", label, arr[i], op1_norm(arr[i]));
        } else if (arr[i] != 0) {
            printf("    knob %-11d : %6d  (%.3f)  [unknown]\n",
                   i, arr[i], op1_norm(arr[i]));
        }
    }
}

/* ---- WAV sidecar writer ---- */

static void w16le(uint8_t *p, uint16_t v) {
    p[0] = v & 0xFF; p[1] = (v >> 8) & 0xFF;
}
static void w32le(uint8_t *p, uint32_t v) {
    p[0] = v & 0xFF; p[1] = (v >> 8) & 0xFF;
    p[2] = (v >> 16) & 0xFF; p[3] = (v >> 24) & 0xFF;
}

static int write_wav(const char *path,
                     const uint8_t *pcm, uint32_t audio_bytes,
                     uint16_t channels, uint32_t rate, uint16_t bits) {
    FILE *wf = fopen(path, "wb");
    if (!wf) { perror(path); return 1; }
    uint32_t byte_rate   = rate * channels * (bits / 8);
    uint16_t block_align = (uint16_t)(channels * (bits / 8));
    uint32_t riff_size   = 36 + audio_bytes;
    uint8_t  h[44];
    memcpy(h,    "RIFF", 4); w32le(h + 4,  riff_size);
    memcpy(h+8,  "WAVE", 4);
    memcpy(h+12, "fmt ", 4); w32le(h + 16, 16);
    w16le(h+20, 1);                  /* PCM */
    w16le(h+22, channels);           w32le(h+24, rate);
    w32le(h+28, byte_rate);          w16le(h+32, block_align);
    w16le(h+34, bits);
    memcpy(h+36, "data", 4);         w32le(h+40, audio_bytes);
    fwrite(h,   1, 44,         wf);
    fwrite(pcm, 1, audio_bytes, wf);
    fclose(wf);
    return 0;
}

/* ---- file processor ---- */

static int dump_file(const char *path) {
    /* --- read file --- */
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);

    uint8_t *buf = malloc(fsize);
    if (!buf) { fprintf(stderr, "out of memory\n"); return 1; }
    if (fread(buf, 1, fsize, f) != (size_t)fsize) {
        fprintf(stderr, "read error\n"); free(buf); return 1;
    }
    fclose(f);

    /* --- validate AIFF-C --- */
    if (fsize < 12 ||
        memcmp(buf,    "FORM", 4) != 0 ||
        (memcmp(buf+8, "AIFF", 4) != 0 &&
         memcmp(buf+8, "AIFC", 4) != 0)) {
        fprintf(stderr, "%s: not a valid AIFF/AIFF-C file\n", path);
        free(buf); return 1;
    }

    char form_type[5] = {0};
    memcpy(form_type, buf + 8, 4);
    printf("File      : %s\n", path);
    printf("Container : FORM/%s  (%ld bytes)\n\n", form_type, fsize);

    /* --- walk IFF chunks --- */
    const char *json_str = NULL;
    char json_buf[2048] = {0};

    uint16_t        comm_channels    = 0;
    uint16_t        comm_bitdepth    = 0;
    uint32_t        comm_rate        = 0;
    int             comm_le          = 0;   /* samples little-endian? ('sowt') */
    const uint8_t  *ssnd_audio       = NULL;
    uint32_t        ssnd_audio_bytes = 0;

    uint32_t pos = 12;
    while (pos + 8 <= (uint32_t)fsize) {
        char id[5] = {0};
        memcpy(id, buf + pos, 4);
        uint32_t size = u32be(buf + pos + 4);
        uint32_t data = pos + 8;

        /* COMM is 18 bytes for plain AIFF; AIFF-C adds a 4-byte compression
           type (+ pascal string). Earlier this gated on >=26 and so skipped
           plain-AIFF patches, leaving channels/rate/bits at 0. */
        if (strcmp(id, "COMM") == 0 && size >= 18) {
            uint16_t ch  = u16be(buf + data);
            uint32_t fr  = u32be(buf + data + 2);
            uint16_t bd  = u16be(buf + data + 6);
            uint32_t hz  = read_80bit_ext(buf + data + 8);
            char comp[5] = "NONE";                 /* plain AIFF: PCM, big-endian */
            if (size >= 22) { memcpy(comp, buf + data + 18, 4); comp[4] = '\0'; }
            comm_le = (memcmp(comp, "sowt", 4) == 0);   /* sowt = little-endian */
            printf("Audio     : %u ch, %u frames, %u-bit, %u Hz, %s\n",
                   ch, fr, bd, hz, comp);
            printf("Duration  : %.3f sec\n", hz ? (double)fr / hz : 0.0);
            comm_channels = ch;
            comm_bitdepth = bd;
            comm_rate     = hz;
            (void)fr;
        }

        if (strcmp(id, "APPL") == 0 && size >= 5 &&
            memcmp(buf + data, "op-1", 4) == 0) {
            uint32_t jlen = size - 4;
            if (jlen >= sizeof(json_buf)) jlen = sizeof(json_buf) - 1;
            memcpy(json_buf, buf + data + 4, jlen);
            int end = (int)jlen - 1;
            while (end >= 0 && (json_buf[end] == ' ' || json_buf[end] == '\n' ||
                                json_buf[end] == '\r' || json_buf[end] == '\0'))
                end--;
            json_buf[end + 1] = '\0';
            json_str = json_buf;
        }

        if (strcmp(id, "SSND") == 0 && size >= 8) {
            uint32_t ssnd_off = u32be(buf + data);
            ssnd_audio       = buf + data + 8 + ssnd_off;
            ssnd_audio_bytes = size - 8 - ssnd_off;
            printf("Sample    : %u bytes of audio data\n", ssnd_audio_bytes);
        }

        pos = data + size + (size & 1);
    }

    if (!json_str) {
        fprintf(stderr, "%s: no 'op-1' APPL chunk found\n", path);
        free(buf); return 1;
    }

    /* --- parse & display --- */
    char synth_type[64] = {0};
    char fx_type[64]    = {0};
    char lfo_type[64]   = {0};
    int  ival;
    double dval;

    dump_json_get_string(json_str, "type",     synth_type, sizeof(synth_type));
    dump_json_get_string(json_str, "fx_type",  fx_type,    sizeof(fx_type));
    dump_json_get_string(json_str, "lfo_type", lfo_type,   sizeof(lfo_type));

    printf("\n=== OP-1 Field Synth Metadata ===\n\n");

    char sval[64];
    if (dump_json_get_string(json_str, "name",          sval, sizeof(sval))) printf("  Name          : %s\n", sval);
    printf(                                                               "  Type          : %s\n", synth_type);
    if (dump_json_get_int   (json_str, "synth_version", &ival))               printf("  Synth version : %d\n", ival);
    else if (dump_json_get_int(json_str, "drum_version", &ival))              printf("  Drum version  : %d\n", ival);
    if (dump_json_get_int   (json_str, "octave",        &ival))               printf("  Octave        : %d\n", ival);
    if (json_get_double(json_str, "mtime",         &dval))               printf("  mtime         : %.0f\n", dval);

    /* synth knobs */
    int knobs[MAX_PARAMS] = {0};
    int nknobs = dump_json_get_int_array(json_str, "knobs", knobs, MAX_PARAMS);
    char knob_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nklabels = dump_get_labels("synth", synth_type, knob_labels);
    printf("\n");
    if (nknobs > 0)
        print_params("Synth knobs", synth_type, knobs, nknobs, knob_labels, nklabels);

    /* envelope */
    int adsr[MAX_PARAMS] = {0};
    int nadsr = dump_json_get_int_array(json_str, "adsr", adsr, MAX_PARAMS);
    printf("\n");
    if (nadsr > 0) {
        printf("  Envelope (ADSR):\n");
        for (int i = 0; i < nadsr; i++) {
            char lbuf[16];
            snprintf(lbuf, sizeof(lbuf), "adsr[%d]", i);
            printf("    %-16s : %6d  (%.3f)\n", lbuf, adsr[i], op1_norm(adsr[i]));
        }
    }

    /* fx */
    int fx_active = 0;
    dump_json_get_bool(json_str, "fx_active", &fx_active);
    int fx[MAX_PARAMS] = {0};
    int nfx = dump_json_get_int_array(json_str, "fx_params", fx, MAX_PARAMS);
    char fx_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nflabels = dump_get_labels("fx", fx_type, fx_labels);
    printf("\n");
    printf("  FX (%s)  active: %s\n", fx_type, fx_active ? "yes" : "no");
    if (nfx > 0)
        print_params("FX params", fx_type, fx, nfx, fx_labels, nflabels);

    /* lfo */
    int lfo_active = 0;
    dump_json_get_bool(json_str, "lfo_active", &lfo_active);
    int lfo[MAX_PARAMS] = {0};
    int nlfo = dump_json_get_int_array(json_str, "lfo_params", lfo, MAX_PARAMS);
    char lfo_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nllabels = dump_get_labels("lfo", lfo_type, lfo_labels);
    printf("\n");
    printf("  LFO (%s)  active: %s\n", lfo_type, lfo_active ? "yes" : "no");
    if (nlfo > 0)
        print_params("LFO params", lfo_type, lfo, nlfo, lfo_labels, nllabels);

    printf("\n--- raw JSON ---\n%s\n", json_str);

    /* --- write .json sidecar --- */
    size_t inlen = strlen(path);
    char *json_path = malloc(inlen + 6);
    if (!json_path) { fprintf(stderr, "out of memory\n"); free(buf); return 1; }
    memcpy(json_path, path, inlen);
    json_path[inlen] = '\0';
    char *dot = strrchr(json_path, '.');
    char *sep = strrchr(json_path, '/');
#ifdef _WIN32
    char *bsep = strrchr(json_path, '\\');
    if (!sep || (bsep && bsep > sep)) sep = bsep;
#endif
    if (dot && (!sep || dot > sep)) strcpy(dot, ".json");
    else strcpy(json_path + inlen, ".json");

    FILE *jf = fopen(json_path, "w");
    if (!jf) {
        perror(json_path);
    } else {
        fprintf(jf, "%s\n", json_str);
        fclose(jf);
        printf("\nWrote %s\n", json_path);
    }

    free(json_path);

    /* --- write .wav audio sidecar (sampler presets only) --- */
    if (strcmp(synth_type, "sampler") == 0 && ssnd_audio && ssnd_audio_bytes > 0) {
        char *wav_path = malloc(inlen + 6);
        if (wav_path) {
            memcpy(wav_path, path, inlen);
            wav_path[inlen] = '\0';
            char *wdot = strrchr(wav_path, '.');
            char *wsep = strrchr(wav_path, '/');
#ifdef _WIN32
            char *wbs = strrchr(wav_path, '\\');
            if (!wsep || (wbs && wbs > wsep)) wsep = wbs;
#endif
            if (wdot && (!wsep || wdot > wsep)) strcpy(wdot, ".wav");
            else strcpy(wav_path + inlen, ".wav");
            /* WAV is little-endian; plain-AIFF samples are big-endian, so swap
               unless the source is already little-endian ('sowt'). */
            const uint8_t *wav_audio = ssnd_audio;
            uint8_t *swapped = NULL;
            if (!comm_le && comm_bitdepth == 16) {
                swapped = malloc(ssnd_audio_bytes);
                if (swapped) {
                    for (uint32_t i = 0; i + 1 < ssnd_audio_bytes; i += 2) {
                        swapped[i]     = ssnd_audio[i + 1];
                        swapped[i + 1] = ssnd_audio[i];
                    }
                    wav_audio = swapped;
                }
            }
            if (write_wav(wav_path, wav_audio, ssnd_audio_bytes,
                          comm_channels, comm_rate, comm_bitdepth) == 0)
                printf("Wrote %s\n", wav_path);
            free(swapped);
            free(wav_path);
        }
    }

    free(buf);
    return 0;
}

/* ---- directory walker ---- */

#ifdef _WIN32
static void dump_walk_dir(const char *dir, WalkStats *stats) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            dump_walk_dir(child, stats);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 4 && _stricmp(fd.cFileName + len - 4, ".aif") == 0) {
                if (dump_file(child) == 0)
                    stats->processed++;
                else
                    stats->failed++;
            }
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}
#endif

static int cmd_dump(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <file.aif | directory>\n", argv[0]);
        return 1;
    }

    load_params_file();

#ifdef _WIN32
    DWORD attrs = GetFileAttributesA(argv[1]);
    if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
        WalkStats stats = {0, 0};
        clock_t t0 = clock();
        dump_walk_dir(argv[1], &stats);
        double elapsed = (double)(clock() - t0) / CLOCKS_PER_SEC;
        printf("\n=== Done: %d processed, %d failed  (%.2f sec) ===\n",
               stats.processed, stats.failed, elapsed);
        free(g_params_json);
        return stats.failed ? 1 : 0;
    }
#endif

    int ret = dump_file(argv[1]);
    free(g_params_json);
    return ret;
}

/* =========================================================================
 * ============================  mondo build  =============================
 * (was json2aif.c - create an OP-1 Field AIFF-C patch file from a JSON file)
 * ========================================================================= */

#define SAMPLE_RATE          22050
#define NUM_CHANNELS         1
#define NUM_FRAMES           28896  /* matches OP-1 Field hardware export frame count */
#define APPL_DATA_SIZE_SYNTH 1028   /* oracle standard: 4-byte sig + 1024-byte JSON area */
#define APPL_DATA_SIZE_DBOX  4100   /* dbox/drum only: 4-byte sig + 4096-byte JSON area */
#define BUILD_APPL_JSON_MAX  (APPL_DATA_SIZE_DBOX - 4)  /* max buffer for JSON building */

#define SAMPLER_FADE_MIN          0
#define SAMPLER_FADE_MAX          644245094  /* oracle sampler-max-0003 */
#define SAMPLER_BASE_FREQ_MIN     7902.132000f  /* oracle min-0000, fadetune-min */
#define SAMPLER_BASE_FREQ_MAX     24.499715f    /* oracle fadetune-max, max-0002 */

/* ---- binary write helpers ---- */

static void build_w16(uint8_t *p, uint16_t v) {
    p[0] = (v >> 8) & 0xFF; p[1] = v & 0xFF;
}
static void build_w32(uint8_t *p, uint32_t v) {
    p[0] = (v >> 24) & 0xFF; p[1] = (v >> 16) & 0xFF;
    p[2] = (v >>  8) & 0xFF; p[3] =  v         & 0xFF;
}

static void build_write_80bit_extended(uint8_t *p, uint32_t hz) {
    int exp = 0;
    uint32_t tmp = hz;
    while (tmp > 1) { tmp >>= 1; exp++; }
    uint16_t biased_exp = (uint16_t)(exp + 16383);
    uint64_t mantissa   = (uint64_t)hz << (63 - exp);
    p[0] = (biased_exp >> 8) & 0xFF; p[1] = biased_exp & 0xFF;
    p[2] = (uint8_t)(mantissa >> 56); p[3] = (uint8_t)(mantissa >> 48);
    p[4] = (uint8_t)(mantissa >> 40); p[5] = (uint8_t)(mantissa >> 32);
    p[6] = (uint8_t)(mantissa >> 24); p[7] = (uint8_t)(mantissa >> 16);
    p[8] = (uint8_t)(mantissa >>  8); p[9] = (uint8_t)(mantissa      );
}

/* ---- output path helpers ---- */

static char *make_aif_path(const char *json_path) {
    size_t len = strlen(json_path);
    char *out = (char *)malloc(len + 5);
    if (!out) return NULL;
    memcpy(out, json_path, len);
    out[len] = '\0';
    char *dot = strrchr(out, '.'), *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bs = strrchr(out, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    if (dot && (!sep || dot > sep)) strcpy(dot, ".aif");
    else strcpy(out + len, ".aif");
    return out;
}

static char *make_aif_path_mode(const char *json_path, const char *suffix) {
    size_t len = strlen(json_path), slen = strlen(suffix);
    char *out = (char *)malloc(len + slen + 6);
    if (!out) return NULL;
    memcpy(out, json_path, len); out[len] = '\0';
    char *dot = strrchr(out, '.'), *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bs = strrchr(out, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    if (dot && (!sep || dot > sep)) *dot = '\0';
    strcat(out, "_"); strcat(out, suffix); strcat(out, ".aif");
    return out;
}

static char *make_wav_path(const char *json_path) {
    size_t len = strlen(json_path);
    char *out = (char *)malloc(len + 5);
    if (!out) return NULL;
    memcpy(out, json_path, len); out[len] = '\0';
    char *dot = strrchr(out, '.'), *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bs = strrchr(out, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    if (dot && (!sep || dot > sep)) strcpy(dot, ".wav");
    else strcpy(out + len, ".wav");
    return out;
}

/* True if the JSON's "type" value equals `want`, tolerating whitespace around
   the colon - compact ("type":"x") and pretty ("type" : "x") JSON both work.
   The quoted "type" token can't match inside "fx_type"/"lfo_type". */
static int json_type_is(const char *json, const char *want) {
    const char *p = strstr(json, "\"type\"");
    if (!p) return 0;
    p += 6;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != ':') return 0;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != '"') return 0;
    p++;
    size_t n = strlen(want);
    return strncmp(p, want, n) == 0 && p[n] == '"';
}

/* ---- JSON helpers ---- */

static int json_replace_array(const char *src, size_t srclen,
                               char *out, size_t outsz,
                               const char *key, int fill) {
    char pat[64];
    snprintf(pat, sizeof(pat), "\"%s\":[", key);
    const char *p = strstr(src, pat);
    if (!p) return -1;
    size_t prefix = (size_t)(p - src) + strlen(pat);
    if (prefix >= outsz) return -1;
    memcpy(out, src, prefix);
    size_t pos = prefix;
    int i;
    for (i = 0; i < 8; i++) {
        int w = snprintf(out + pos, outsz - pos, "%s%d", i ? "," : "", fill);
        if (w <= 0 || (size_t)w >= outsz - pos) return -1;
        pos += (size_t)w;
    }
    if (pos >= outsz - 1) return -1;
    out[pos++] = ']';
    const char *arr_open  = p + strlen(pat) - 1;
    const char *arr_close = strchr(arr_open, ']');
    if (!arr_close) return -1;
    arr_close++;
    size_t rest = srclen - (size_t)(arr_close - src);
    if (pos + rest >= outsz) return -1;
    memcpy(out + pos, arr_close, rest);
    pos += rest;
    out[pos] = '\0';
    return (int)pos;
}

static int json_inject_mtime(const char *src, size_t srclen,
                              char *out, size_t outsz) {
    char ts[32];
    snprintf(ts, sizeof(ts), "%.1f", (double)time(NULL));
    size_t ts_len = strlen(ts);
    const char *p = strstr(src, "\"mtime\":");
    if (p) {
        size_t prefix = (size_t)(p - src) + 8;
        if (prefix >= outsz) return -1;
        memcpy(out, src, prefix);
        size_t pos = prefix;
        if (pos + ts_len >= outsz) return -1;
        memcpy(out + pos, ts, ts_len); pos += ts_len;
        const char *v = src + prefix;
        if (*v == '-') v++;
        while (*v >= '0' && *v <= '9') v++;
        if (*v == '.') { v++; while (*v >= '0' && *v <= '9') v++; }
        size_t rest = srclen - (size_t)(v - src);
        if (pos + rest >= outsz) return -1;
        memcpy(out + pos, v, rest); pos += rest;
        out[pos] = '\0';
        return (int)pos;
    }
    const char *nk = strstr(src, "\"name\":");
    if (!nk) return -1;
    size_t prefix = (size_t)(nk - src);
    char ins[48];
    snprintf(ins, sizeof(ins), "\"mtime\":%s,", ts);
    size_t ins_len = strlen(ins);
    size_t rest = srclen - prefix;
    if (prefix + ins_len + rest >= outsz) return -1;
    memcpy(out, src, prefix);
    memcpy(out + prefix, ins, ins_len);
    memcpy(out + prefix + ins_len, nk, rest);
    size_t pos = prefix + ins_len + rest;
    out[pos] = '\0';
    return (int)pos;
}

/* ---- chunk header ---- */

static uint32_t write_chunk_header(uint8_t *buf, uint32_t pos,
                                   const char *id, uint32_t size) {
    memcpy(buf + pos, id, 4); build_w32(buf + pos + 4, size);
    return pos + 8;
}

/* ---- sine wave generator ---- */

static void gen_sine_wave(float freq_hz, uint32_t sample_rate,
                          uint32_t num_frames, int16_t *buf) {
    uint32_t i;
    for (i = 0; i < num_frames; i++)
        buf[i] = (int16_t)(29491.0f * sinf(2.0f * 3.14159265f * freq_hz * (float)i / (float)sample_rate));
}

/* ---- core AIF writer ---- */

/*
 * Write an AIFF-C file from a pre-built JSON string.
 * audio_data: PCM samples to embed in SSND; NULL writes silence.
 * audio_frames: frame count for COMM and SSND; use NUM_FRAMES for silence.
 * Returns 0 on success, 1 on error.
 * If allow_overwrite is 0, fails if aif_path already exists.
 */
static int write_aif(const char *json_str, int json_len,
                     const char *aif_path, int allow_overwrite,
                     const int16_t *audio_data, uint32_t audio_frames,
                     uint16_t aud_channels, uint32_t aud_rate,
                     uint32_t appl_data_size) {
    int appl_json_max = (int)appl_data_size - 4 - 1; /* -4 sig, -1 newline */
    if (json_len > appl_json_max) {
        fprintf(stderr, "JSON too large (%d bytes, max %d)\n", json_len, appl_json_max);
        return 1;
    }

    if (!allow_overwrite) {
        FILE *chk = fopen(aif_path, "rb");
        if (chk) {
            fclose(chk);
            fprintf(stderr, "error: output file already exists: %s\n", aif_path);
            fprintf(stderr, "  delete it first or choose a different output path.\n");
            return 1;
        }
    }

    static const char *COMPR_NAME = "Signed integer (little-endian) linear PCM";
    uint8_t pascal_len  = (uint8_t)strlen(COMPR_NAME);
    uint32_t pascal_total = 1 + pascal_len;            /* 42 */
    uint32_t comm_size  = 2 + 4 + 2 + 10 + 4 + pascal_total;  /* 64 */
    uint32_t audio_bytes = audio_frames * aud_channels * (BIT_DEPTH / 8);
    uint32_t ssnd_size   = 4 + 4 + audio_bytes;
    uint32_t chunks_size = (8+4) + (8+comm_size) + (8+appl_data_size) + (8+ssnd_size);
    uint32_t form_body   = 4 + chunks_size;  /* "AIFC" type (4) + all chunk bytes */
    uint32_t total_size  = 8 + form_body;    /* "FORM" (4) + size field (4) + form_body */

    uint8_t *buf = (uint8_t *)calloc(1, total_size);
    if (!buf) { fprintf(stderr, "out of memory\n"); return 1; }

    uint32_t pos = 0;
    memcpy(buf+pos,"FORM",4); pos+=4;
    build_w32(buf+pos, form_body);  pos+=4;
    memcpy(buf+pos,"AIFC",4); pos+=4;

    pos = write_chunk_header(buf, pos, "FVER", 4);
    build_w32(buf+pos, 0xA2805140); pos+=4;

    pos = write_chunk_header(buf, pos, "COMM", comm_size);
    build_w16(buf+pos, aud_channels); pos+=2;
    build_w32(buf+pos, audio_frames); pos+=4;
    build_w16(buf+pos, BIT_DEPTH);    pos+=2;
    build_write_80bit_extended(buf+pos, aud_rate); pos+=10;
    memcpy(buf+pos,"sowt",4);    pos+=4;
    buf[pos++] = pascal_len;
    memcpy(buf+pos, COMPR_NAME, pascal_len); pos+=pascal_len;

    pos = write_chunk_header(buf, pos, "APPL", appl_data_size);
    memcpy(buf+pos,"op-1",4);                    pos+=4;
    memcpy(buf+pos, json_str, (size_t)json_len); pos+=(uint32_t)json_len;
    buf[pos++] = '\n';
    uint32_t pad = appl_data_size - 4 - (uint32_t)json_len - 1;
    memset(buf+pos, ' ', pad); pos+=pad;

    pos = write_chunk_header(buf, pos, "SSND", ssnd_size);
    build_w32(buf+pos,0); pos+=4;
    build_w32(buf+pos,0); pos+=4;
    if (audio_data)
        memcpy(buf+pos, audio_data, audio_bytes);
    pos += audio_bytes;

    FILE *f = fopen(aif_path, "wb");
    if (!f) { perror(aif_path); free(buf); return 1; }
    if (fwrite(buf, 1, total_size, f) != total_size) {
        fprintf(stderr, "write error: %s\n", aif_path); fclose(f); free(buf); return 1;
    }
    fclose(f);
    free(buf);
    return 0;
}

/* ---- WAV sidecar reader ---- */

static int16_t *read_wav_audio(const char *path, uint32_t *out_frames,
                                uint32_t *out_rate, uint16_t *out_channels) {
    FILE *wf = fopen(path, "rb");
    if (!wf) return NULL;
    fseek(wf, 0, SEEK_END); long fsize = ftell(wf); rewind(wf);
    uint8_t *buf = (uint8_t *)malloc((size_t)fsize);
    if (!buf) { fclose(wf); return NULL; }
    if (fread(buf, 1, (size_t)fsize, wf) != (size_t)fsize) { free(buf); fclose(wf); return NULL; }
    fclose(wf);

    if (fsize < 44 || memcmp(buf, "RIFF", 4) || memcmp(buf + 8, "WAVE", 4))
        { free(buf); return NULL; }

    uint16_t channels = 0, bits = 0;
    uint32_t rate = 0, data_bytes = 0;
    const uint8_t *pcm = NULL;
    uint32_t pos = 12;
    while (pos + 8 <= (uint32_t)fsize) {
        char id[5] = {0}; memcpy(id, buf + pos, 4);
        uint32_t sz = (uint32_t)buf[pos+4] | ((uint32_t)buf[pos+5] << 8)
                    | ((uint32_t)buf[pos+6] << 16) | ((uint32_t)buf[pos+7] << 24);
        uint32_t dp = pos + 8;
        if (strcmp(id, "fmt ") == 0 && sz >= 16) {
            channels = (uint16_t)(buf[dp+2] | (buf[dp+3] << 8));
            rate     = (uint32_t)buf[dp+4] | ((uint32_t)buf[dp+5] << 8)
                     | ((uint32_t)buf[dp+6] << 16) | ((uint32_t)buf[dp+7] << 24);
            bits     = (uint16_t)(buf[dp+14] | (buf[dp+15] << 8));
        }
        if (strcmp(id, "data") == 0) { pcm = buf + dp; data_bytes = sz; }
        pos = dp + sz + (sz & 1);
    }
    if (!pcm || !channels || !rate || bits != 16) { free(buf); return NULL; }

    int16_t *out = (int16_t *)malloc(data_bytes);
    if (!out) { free(buf); return NULL; }
    memcpy(out, pcm, data_bytes);
    free(buf);
    *out_frames   = data_bytes / (channels * 2u);
    *out_rate     = rate;
    *out_channels = channels;
    return out;
}

/* =========================================================================
 * EXPLORE: oracle tables and generation logic
 * ========================================================================= */

static const char *SYNTH_TYPES[] = {
    "amp","cluster","dbox","digital","dimension","dna","drwave",
    "dsynth","fm","phase","pulse","sampler","string","vocoder","voltage", NULL
};
static const char *FX_TYPES[] = {
    "cwo","delay","grid","mother","nitro","phone","punch","spring","terminal", NULL
};
static const char *LFO_TYPES[] = {
    "element","midi","random","tremolo","value","velocity", NULL
};

typedef struct { const char *name; int ver; } SynthVer;
typedef struct { const char *name; int v[8]; } ParamRow;

static int synth_version(const char *type) {
    static const SynthVer T[] = {
        {"amp",3},{"cluster",3},{"digital",3},{"dimension",3},{"dna",3},
        {"drwave",2},{"dsynth",2},{"fm",3},{"phase",2},{"pulse",2},
        {"sampler",3},{"string",3},{"vocoder",3},{"voltage",2},{NULL,0}
    };
    int i;
    for (i = 0; T[i].name; i++)
        if (strcmp(T[i].name, type) == 0) return T[i].ver;
    return 3;
}

static const int ZEROS[8] = {0,0,0,0,0,0,0,0};
static const int MAXS[8]  = {32767,32767,32767,32767,32767,32767,32767,32767};

static const int *param_lookup(const ParamRow *tbl, const char *type, const int *def) {
    for (; tbl->name; tbl++)
        if (strcmp(tbl->name, type) == 0) return tbl->v;
    return def;
}

static const int SYNTH_ADSR[15][8] = {
    {  576,  4160, 17408, 15808, 14336,  7872, 18432,  3276 }, /* amp       */
    {  576,  6592,     0, 14912, 14336,    64, 18432, 16384 }, /* cluster   */
    {    0,     0,     0,     0,     0,     0,     0,     0 }, /* dbox (no adsr) */
    {   64, 12352, 10239,  3008,  2048,    64, 18432, 16229 }, /* digital   */
    { 2624,  8640,  7168,  6720,  2048,   192, 18432, 21093 }, /* dimension */
    {   64, 16320, 32767, 11712,  2048,  6432, 18432,  9829 }, /* dna       */
    {   64,  5696, 12800, 12736,  6140,    64, 18432, 26981 }, /* drwave    */
    {   64,  7162, 32767, 15808,  5120,  6464,  4000,  4000 }, /* dsynth    */
    {   64,  7162, 32767, 15808,  5120,  6464,  4000,  4000 }, /* fm        */
    {   64,  7162, 32767, 15808,  5120,  6464,  4000,  4000 }, /* phase     */
    {   64,  7162, 32767, 15808,  5120,  6464,  4000,  4000 }, /* pulse     */
    {   64, 10746, 32767, 10000,  4000,    64,  4000, 18021 }, /* sampler   */
    { 1088,  3066, 21504, 13376,  2048,  4000, 18432, 18021 }, /* string    */
    {   64,  7162, 32767, 15808,  5120,  6464,  4000,  4000 }, /* vocoder   */
    {   64,  2624, 29695, 14784,  9216,  4000, 18432, 28005 }, /* voltage   */
};

static const ParamRow SYNTH_KNOBS_MIN[] = {
    {"cluster", {3072,0,512,3,0,0,0,0}},
    {"digital", {0,2048,-32768,0,0,0,0,0}},
    {"dna",     {-29491,4608,0,0,0,0,0,0}},
    {"fm",      {0,0,1024,0,15000,0,100,1500}},
    {"sampler", {0,0,0,0,8192,0,0,0}},
    {"string",  {64,512,0,8256,0,0,0,0}},
    {NULL, {0}}
};

static const ParamRow SYNTH_KNOBS_MAX[] = {
    {"amp",       {32767,32767,32767,32767,0,0,0,0}},
    {"cluster",   {17408,32767,24064,1638,0,0,0,0}},
    {"digital",   {32767,26624,32767,32767,0,0,0,0}},
    {"dimension", {32767,32767,32767,32767,0,0,0,0}},
    {"dna",       {32767,12800,32767,32767,0,0,0,0}},
    {"drwave",    {24568,16379,16377,32767,0,0,0,0}},
    {"fm",        {32767,32767,17408,32767,15000,0,100,1500}},
    {"phase",     {32767,29491,32767,32767,0,0,0,0}},
    {"pulse",     {23168,16384,16384,16384,0,0,0,0}},
    {"sampler",   {32766,32767,32767,32767,24576,32767,32767,32767}},
    {"string",    {8256,24064,16384,16448,0,0,0,0}},
    {"vocoder",   {32767,32767,32767,32767,0,0,0,0}},
    {"voltage",   {32767,32767,32767,32767,0,0,0,0}},
    {NULL, {0}}
};

static const ParamRow FX_PARAMS_MIN[] = {
    {"delay",  {1024,3276,0,0,0,0,0,0}},
    {"grid",   {1344,1344,0,0,8000,8000,8000,8000}},
    {"nitro",  {64,-32768,0,64,0,0,0,0}},
    {"phone",  {204,3072,1536,0,8000,8000,8000,8000}},
    {"punch",  {1344,0,1536,0,8000,8000,8000,8000}},
    {"spring", {1344,7744,0,0,8000,8000,8000,8000}},
    {NULL, {0}}
};

static const ParamRow FX_PARAMS_MAX[] = {
    {"cwo",    {32767,32767,32767,32767,0,0,0,0}},
    {"delay",  {11264,32767,16384,32767,0,0,0,0}},
    {"grid",   {16704,16704,32767,32767,8000,8000,8000,8000}},
    {"nitro",  {16448,32767,20643,16448,0,0,0,0}},
    {"phone",  {20480,17408,16896,32767,8000,8000,8000,8000}},
    {"punch",  {12480,32767,25088,32767,8000,8000,8000,8000}},
    {"spring", {16448,16448,16384,32767,8000,8000,8000,8000}},
    {NULL, {0}}
};

static const ParamRow LFO_MIN_PARAMS[] = {
    {"element",  {1024,-32767,1024,1024,0,0,0,0}},
    {"midi",     {1024,1024,1024,1024,1024,1024,1024,1024}},
    {"random",   {0,0,1024,0,1024,0,0,0}},
    {"tremolo",  {0,-32767,-32767,0,0,0,0,0}},
    {"value",    {0,-32767,1024,1024,0,0,0,0}},
    {NULL, {0}}   /* velocity handled dynamically */
};

static const ParamRow LFO_MAX_PARAMS[] = {
    {"element",  {7168,32767,7168,15360,0,0,0,0}},
    {"midi",     {15360,15360,15360,15360,7168,7168,7168,7168}},
    {"random",   {32767,32767,7168,32767,15360,0,0,0}},
    {"tremolo",  {32440,32767,32767,32767,0,0,0,32767}},
    {"value",    {16384,32767,11264,15360,28086,0,0,0}},
    {"velocity", {32767,32767,7168,15360,0,0,0,0}},
    {NULL, {0}}
};

/* ---- explore helpers ---- */

static void build_make_dirs(const char *path) {
    char tmp[512];
    char *p;
    strncpy(tmp, path, sizeof(tmp) - 1);
    tmp[sizeof(tmp) - 1] = '\0';
    for (p = tmp + 1; *p; p++) {
        if (*p == '\\' || *p == '/') {
            char c = *p; *p = '\0';
            CreateDirectoryA(tmp, NULL);
            *p = c;
        }
    }
    CreateDirectoryA(tmp, NULL);
}

static void get_slug(const char *name, char *out) {
    int i = 0;
    while (*name && i < 4) {
        unsigned char c = (unsigned char)*name++;
        if (c >= 'a' && c <= 'z')      out[i++] = (char)c;
        else if (c >= '0' && c <= '9') out[i++] = (char)c;
        else if (c >= 'A' && c <= 'Z') out[i++] = (char)(c + 32);
    }
    while (i < 4) out[i++] = '_';
    out[4] = '\0';
}

/* dyna_env: [0]=ATTACK [1]=GAIN [2]=RELEASE [3]=SMOOTH [4-7]=unused */
static const int DBOX_DYNA_ENV_MIN[8] = {-32768,     0, -32768,     0, 0, 0, 0, 0};
static const int DBOX_DYNA_ENV_MAX[8] = { 32767,  8192,  32767, 32767, 0, 0, 0, 0};

/* 24 per-pad rows, all zeros - min explore */
static const char DBOX_DATA_ZEROS[] =
    "[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],"
    "[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]]";

/* all 24 pads at max; oracle max: 24832/32767 for param[0], 32767 for rest */
static const char DBOX_DATA_MAX[] =
    "[[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767],"
    "[24832,32767,32767,32767,32767,32767,32767,32767]]";

static int build_dbox_patch_json(const char *fx, const char *lfo,
                                  const char *name,
                                  const int fxp[8], const int lfop[8],
                                  const int dyna_env[8],
                                  const char *dbox_data,
                                  char *out, size_t outsz) {
    return snprintf(out, outsz,
        "{\"dbox_data\":%s,"
        "\"drum_version\":2,"
        "\"dyna_env\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"fx_active\":true,"
        "\"fx_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"fx_type\":\"%s\","
        "\"lfo_active\":true,"
        "\"lfo_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"lfo_type\":\"%s\","
        "\"mtime\":%ld.0,"
        "\"name\":\"%s\","
        "\"octave\":0,"
        "\"type\":\"dbox\"}",
        dbox_data,
        dyna_env[0],dyna_env[1],dyna_env[2],dyna_env[3],
        dyna_env[4],dyna_env[5],dyna_env[6],dyna_env[7],
        fxp[0],fxp[1],fxp[2],fxp[3],fxp[4],fxp[5],fxp[6],fxp[7], fx,
        lfop[0],lfop[1],lfop[2],lfop[3],lfop[4],lfop[5],lfop[6],lfop[7], lfo,
        (long)time(NULL), name);
}

static int build_patch_json(const char *synth, const char *fx, const char *lfo,
                             const char *name, int ver,
                             const int knobs[8], const int fxp[8], const int lfop[8],
                             const int adsr[8],
                             char *out, size_t outsz) {
    return snprintf(out, outsz,
        "{\"adsr\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"fx_active\":true,"
        "\"fx_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"fx_type\":\"%s\","
        "\"knobs\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"lfo_active\":true,"
        "\"lfo_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"lfo_type\":\"%s\","
        "\"mtime\":%ld.0,"
        "\"name\":\"%s\","
        "\"octave\":0,"
        "\"synth_version\":%d,"
        "\"type\":\"%s\"}",
        adsr[0],adsr[1],adsr[2],adsr[3],adsr[4],adsr[5],adsr[6],adsr[7],
        fxp[0],fxp[1],fxp[2],fxp[3],fxp[4],fxp[5],fxp[6],fxp[7], fx,
        knobs[0],knobs[1],knobs[2],knobs[3],knobs[4],knobs[5],knobs[6],knobs[7],
        lfop[0],lfop[1],lfop[2],lfop[3],lfop[4],lfop[5],lfop[6],lfop[7], lfo,
        (long)time(NULL), name, ver, synth);
}

static int build_sampler_patch_json(const char *synth, const char *fx, const char *lfo,
                                     const char *name, int ver, float base_freq, long fade,
                                     const int knobs[8], const int fxp[8], const int lfop[8],
                                     const int adsr[8],
                                     char *out, size_t outsz) {
    return snprintf(out, outsz,
        "{\"adsr\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"base_freq\":%.6f,"
        "\"fade\":%ld,"
        "\"fx_active\":true,"
        "\"fx_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"fx_type\":\"%s\","
        "\"knobs\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"lfo_active\":true,"
        "\"lfo_params\":[%d,%d,%d,%d,%d,%d,%d,%d],"
        "\"lfo_type\":\"%s\","
        "\"mtime\":%ld.0,"
        "\"name\":\"%s\","
        "\"octave\":0,"
        "\"stereo\":true,"
        "\"synth_version\":%d,"
        "\"type\":\"%s\"}",
        adsr[0],adsr[1],adsr[2],adsr[3],adsr[4],adsr[5],adsr[6],adsr[7],
        base_freq, fade,
        fxp[0],fxp[1],fxp[2],fxp[3],fxp[4],fxp[5],fxp[6],fxp[7], fx,
        knobs[0],knobs[1],knobs[2],knobs[3],knobs[4],knobs[5],knobs[6],knobs[7],
        lfop[0],lfop[1],lfop[2],lfop[3],lfop[4],lfop[5],lfop[6],lfop[7], lfo,
        (long)time(NULL), name, ver, synth);
}

/* ---- run_explore ---- */

static int run_explore(int vel_dest_raw, int vel_param) {
    int si, fi, li, mi;
    int n = 0;
    int vel_min[8] = {0, -32767, vel_dest_raw, vel_param, 0, 0, 0, 0};

    /* Count synth/fx/lfo type lengths */
    int n_synth = 0, n_fx = 0, n_lfo = 0;
    while (SYNTH_TYPES[n_synth]) n_synth++;
    while (FX_TYPES[n_fx])       n_fx++;
    while (LFO_TYPES[n_lfo])     n_lfo++;

    int total = n_synth * n_fx * n_lfo;

    /* Clean slate */
    system("rd /s /q explore 2>nul");

    printf("\nGenerating %d combinations x 2 (min + max) = %d pairs ...\n",
           total, total * 2);
    printf("Each combo = 1 JSON + 1 AIF  ->  %d files total\n\n", total * 4);

    static const char *MODES[2] = {"min", "max"};

    for (si = 0; SYNTH_TYPES[si]; si++) {
        const char *synth = SYNTH_TYPES[si];
        int ver = synth_version(synth);

        const int *adsr = SYNTH_ADSR[si];

        for (li = 0; LFO_TYPES[li]; li++) {
            const char *lfo = LFO_TYPES[li];

            for (mi = 0; mi < 2; mi++) {
                const char *mode = MODES[mi];
                char aif_dir[512], json_dir[512];
                snprintf(aif_dir,  sizeof(aif_dir),  "explore\\aif\\%s\\%s",  mode, synth);
                snprintf(json_dir, sizeof(json_dir), "explore\\json\\%s\\%s", mode, synth);
                build_make_dirs(aif_dir);
                build_make_dirs(json_dir);

                for (fi = 0; FX_TYPES[fi]; fi++) {
                    const char *fx = FX_TYPES[fi];
                    char slug_s[5], slug_f[5], slug_l[5], slug[14];
                    char json_buf[BUILD_APPL_JSON_MAX];
                    char json_path[512], aif_path[512];
                    int  jlen;
                    FILE *jf;

                    get_slug(synth, slug_s);
                    get_slug(fx,    slug_f);
                    get_slug(lfo,   slug_l);
                    snprintf(slug, sizeof(slug), "%s%s%s", slug_s, slug_f, slug_l);

                    const int *knobs, *fxp, *lfop;

                    if (mi == 0) {  /* min */
                        knobs = param_lookup(SYNTH_KNOBS_MIN, synth, ZEROS);
                        fxp   = param_lookup(FX_PARAMS_MIN,   fx,    ZEROS);
                        lfop  = (strcmp(lfo, "velocity") == 0)
                                ? (const int *)vel_min
                                : param_lookup(LFO_MIN_PARAMS, lfo, ZEROS);
                    } else {        /* max */
                        knobs = param_lookup(SYNTH_KNOBS_MAX, synth, MAXS);
                        fxp   = param_lookup(FX_PARAMS_MAX,   fx,    MAXS);
                        lfop  = param_lookup(LFO_MAX_PARAMS,  lfo,   MAXS);
                    }

                    if (strcmp(synth, "dbox") == 0)
                        jlen = build_dbox_patch_json(fx, lfo, slug,
                                                     fxp, lfop,
                                                     mi == 0 ? DBOX_DYNA_ENV_MIN : DBOX_DYNA_ENV_MAX,
                                                     mi == 0 ? DBOX_DATA_ZEROS : DBOX_DATA_MAX,
                                                     json_buf, sizeof(json_buf));
                    else if (strcmp(synth, "sampler") == 0)
                        jlen = build_sampler_patch_json(synth, fx, lfo, slug, ver,
                                                        mi == 0 ? SAMPLER_BASE_FREQ_MIN : SAMPLER_BASE_FREQ_MAX,
                                                        mi == 0 ? SAMPLER_FADE_MIN : SAMPLER_FADE_MAX,
                                                        knobs, fxp, lfop, adsr,
                                                        json_buf, sizeof(json_buf));
                    else
                        jlen = build_patch_json(synth, fx, lfo, slug, ver,
                                                knobs, fxp, lfop, adsr,
                                                json_buf, sizeof(json_buf));

                    if (jlen <= 0 || jlen >= BUILD_APPL_JSON_MAX) {
                        fprintf(stderr, "JSON build failed for %s/%s/%s\n", synth, fx, lfo);
                        continue;
                    }

                    snprintf(json_path, sizeof(json_path), "%s\\%s.json", json_dir, slug);
                    snprintf(aif_path,  sizeof(aif_path),  "%s\\%s.aif",  aif_dir,  slug);

                    jf = fopen(json_path, "wb");
                    if (jf) {
                        fwrite(json_buf, 1, (size_t)jlen, jf);
                        fclose(jf);
                    }

                    {
                        static int16_t sampler_sine[22050];
                        const int16_t *aif_audio  = NULL;
                        uint32_t       aif_frames = NUM_FRAMES;
                        if (strcmp(synth, "sampler") == 0) {
                            gen_sine_wave(440.0f, SAMPLE_RATE, 22050, sampler_sine);
                            aif_audio  = sampler_sine;
                            aif_frames = 22050;
                        }
                        {
                            uint32_t appl_sz = (strcmp(synth, "dbox") == 0)
                                               ? APPL_DATA_SIZE_DBOX : APPL_DATA_SIZE_SYNTH;
                            if (write_aif(json_buf, jlen, aif_path, 1, aif_audio, aif_frames,
                                          NUM_CHANNELS, SAMPLE_RATE, appl_sz) != 0)
                                fprintf(stderr, "write_aif failed: %s\n", aif_path);
                        }
                    }
                }
            }

            n += n_fx;
            if (n % (n_fx * n_lfo) == 0)
                printf("  %d / %d  (last synth: %s)\n", n, total, synth);
        }
    }

    printf("\nDone.  %d combinations processed.\n\n", total);
    return 0;
}

/* =========================================================================
 * SINGLE-FILE PROCESSOR
 * ========================================================================= */

/*
 * Process one JSON file -> AIF.
 * mode: 0=pass-through, 1=zero, 2=max.
 * allow_overwrite: 1 for directory batch mode, 0 for single-file mode.
 * out_path_override: explicit output path, or NULL to derive from json_path.
 */
static int process_json_file(const char *json_path, int mode,
                              int allow_overwrite,
                              const char *out_path_override) {
    FILE *jf = fopen(json_path, "rb");
    if (!jf) { perror(json_path); return 1; }
    fseek(jf, 0, SEEK_END);
    long json_size = ftell(jf);
    rewind(jf);
    char *json_raw = (char *)malloc((size_t)json_size + 1);
    if (!json_raw) { fprintf(stderr, "out of memory\n"); fclose(jf); return 1; }
    fread(json_raw, 1, (size_t)json_size, jf);
    fclose(jf);
    json_raw[json_size] = '\0';

    /* strip UTF-8 BOM */
    if (json_size >= 3 &&
        (uint8_t)json_raw[0] == 0xEF &&
        (uint8_t)json_raw[1] == 0xBB &&
        (uint8_t)json_raw[2] == 0xBF) {
        memmove(json_raw, json_raw + 3, (size_t)(json_size - 3));
        json_size -= 3; json_raw[json_size] = '\0';
    }
    while (json_size > 0 && (json_raw[json_size-1] == '\n' ||
                              json_raw[json_size-1] == '\r' ||
                              json_raw[json_size-1] == ' '))
        json_size--;
    json_raw[json_size] = '\0';

    char scratch[3][BUILD_APPL_JSON_MAX + 2];

    int mt_r = json_inject_mtime(json_raw, (size_t)json_size,
                                  scratch[2], sizeof(scratch[2]));
    const char *mt_src  = (mt_r > 0) ? scratch[2]   : json_raw;
    size_t      mt_slen = (mt_r > 0) ? (size_t)mt_r : (size_t)json_size;

    const char *json_write_ptr  = mt_src;
    int         json_write_size = (int)mt_slen;

    if (mode != 0) {
        static const char *KEYS[] = { "knobs", "fx_params", "lfo_params" };
        int fill = (mode == 1) ? 0 : 32767;
        int cur  = 0;
        const char *src  = mt_src;
        size_t      slen = mt_slen;
        int k;
        for (k = 0; k < 3; k++) {
            int r = json_replace_array(src, slen,
                                       scratch[cur], sizeof(scratch[0]),
                                       KEYS[k], fill);
            if (r > 0) { src = scratch[cur]; slen = (size_t)r; cur ^= 1; }
        }
        json_write_ptr  = src;
        json_write_size = (int)slen;
    }

    /* resolve output path */
    char *out_path;
    int   out_path_alloc = 0;
    if (out_path_override) {
        out_path = (char *)out_path_override;
    } else if (mode == 1) {
        out_path = make_aif_path_mode(json_path, "zero"); out_path_alloc = 1;
    } else if (mode == 2) {
        out_path = make_aif_path_mode(json_path, "max");  out_path_alloc = 1;
    } else {
        out_path = make_aif_path(json_path); out_path_alloc = 1;
    }
    if (!out_path) { fprintf(stderr, "out of memory\n"); free(json_raw); return 1; }

    static int16_t proc_sine[22050];
    const int16_t *aif_audio    = NULL;
    uint32_t       aif_frames   = NUM_FRAMES;
    uint16_t       aif_channels = NUM_CHANNELS;
    uint32_t       aif_rate     = SAMPLE_RATE;
    int16_t       *wav_buf      = NULL;
    const char    *audio_label  = "silence";

    if (json_type_is(json_write_ptr, "sampler")) {
        char *wav_path = make_wav_path(json_path);
        if (wav_path) {
            uint32_t wframes, wrate; uint16_t wchan;
            wav_buf = read_wav_audio(wav_path, &wframes, &wrate, &wchan);
            if (wav_buf) {
                aif_audio    = wav_buf;
                aif_frames   = wframes;
                aif_channels = wchan;
                aif_rate     = wrate;
                audio_label  = "WAV sidecar";
                printf("Using WAV sidecar: %s  (%u ch, %u Hz, %u frames)\n",
                       wav_path, wchan, wrate, wframes);
            }
            free(wav_path);
        }
        if (!wav_buf) {
            gen_sine_wave(440.0f, SAMPLE_RATE, 22050, proc_sine);
            aif_audio    = proc_sine;
            aif_frames   = 22050;
            aif_channels = NUM_CHANNELS;
            aif_rate     = SAMPLE_RATE;
            audio_label  = "A=440 Hz sine";
        }
    }

    uint32_t appl_sz = json_type_is(json_write_ptr, "dbox")
                       ? APPL_DATA_SIZE_DBOX : APPL_DATA_SIZE_SYNTH;
    int ret = write_aif(json_write_ptr, json_write_size, out_path, allow_overwrite,
                        aif_audio, aif_frames, aif_channels, aif_rate, appl_sz);
    if (ret == 0) {
        uint32_t audio_bytes = aif_frames * aif_channels * (BIT_DEPTH / 8);
        uint32_t ssnd_size   = 4 + 4 + audio_bytes;
        printf("Wrote %s\n", out_path);
        printf("  FVER : 0xA2805140 (AIFC standard)\n");
        printf("  COMM : %u ch, %u frames, %u-bit, %u Hz, sowt\n",
               aif_channels, aif_frames, BIT_DEPTH, aif_rate);
        printf("  APPL : %u bytes  (%d bytes JSON + padding)\n",
               appl_sz, json_write_size);
        printf("  SSND : %u bytes  (%u frames, %s)\n", ssnd_size, aif_frames, audio_label);
    }

    if (out_path_alloc) free(out_path);
    free(wav_buf);
    free(json_raw);
    return ret;
}

/* ---- directory walker ---- */

#ifdef _WIN32
static void build_walk_dir(const char *dir, WalkStats *stats) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            build_walk_dir(child, stats);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 5 && _stricmp(fd.cFileName + len - 5, ".json") == 0) {
                if (process_json_file(child, 0, 1, NULL) == 0)
                    stats->processed++;
                else
                    stats->failed++;
            }
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}
#endif

static int cmd_build(int argc, char *argv[]) {
    int i;

    /* -- explore subcommand -- */
    if (argc >= 2 && strcmp(argv[1], "explore") == 0) {
        int vel_dest_raw = 1024;  /* synth */
        int vel_param    = 1024;
        for (i = 2; i < argc - 1; i++) {
            if (strcmp(argv[i], "-dest") == 0) {
                const char *d = argv[++i];
                if      (strcmp(d, "synth")    == 0) vel_dest_raw = 1024;
                else if (strcmp(d, "envelope") == 0) vel_dest_raw = 5824;
                else if (strcmp(d, "fx")       == 0) vel_dest_raw = 10144;
                else if (strcmp(d, "mix")      == 0) vel_dest_raw = 15360;
            } else if (strcmp(argv[i], "-param") == 0) {
                vel_param = atoi(argv[++i]);
            }
        }
        return run_explore(vel_dest_raw, vel_param);
    }

    /* -- directory mode -- */
#ifdef _WIN32
    if (argc == 2) {
        DWORD attrs = GetFileAttributesA(argv[1]);
        if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            WalkStats stats = {0, 0};
            clock_t t0 = clock();
            build_walk_dir(argv[1], &stats);
            double elapsed = (double)(clock() - t0) / CLOCKS_PER_SEC;
            printf("\n=== Done: %d processed, %d failed  (%.2f sec) ===\n",
                   stats.processed, stats.failed, elapsed);
            return stats.failed ? 1 : 0;
        }
    }
#endif

    /* -- single-file subcommands: zero / max / pass-through -- */
    int  mode      = 0;
    int  arg_shift = 0;
    if (argc >= 2) {
        if      (strcmp(argv[1], "zero") == 0) { mode = 1; arg_shift = 1; }
        else if (strcmp(argv[1], "max")  == 0) { mode = 2; arg_shift = 1; }
    }
    int    real_argc = argc - arg_shift;
    char **real_argv = argv + arg_shift;

    if (real_argc < 2 || real_argc > 3) {
        fprintf(stderr,
            "Usage:\n"
            "  %s [zero|max] <patch.json> [output.aif]\n"
            "  %s <directory>\n"
            "  %s explore [-dest <synth|envelope|fx|mix>] [-param <N>]\n",
            argv[0], argv[0], argv[0]);
        return 1;
    }

    const char *json_path      = real_argv[1];
    const char *out_path_override = (real_argc == 3) ? real_argv[2] : NULL;
    return process_json_file(json_path, mode, 0, out_path_override);
}

/* =========================================================================
 * ============================  mondo test  ===============================
 * (was test_aif.c - validates OP-1 Field .aif patch files against
 *  hardware-verified invariants)
 * ========================================================================= */

/* Hardware-verified constants (oracle: oracle/amp-cwo-elem-0000.aif) */
#define EXPECTED_FILE_SIZE   58940u
#define EXPECTED_FVER_VAL    0xA2805140u
#define EXPECTED_CHANNELS    1
#define EXPECTED_FRAMES      28896u
#define EXPECTED_BITS        16
#define EXPECTED_SAMPLE_RATE 22050u
#define EXPECTED_APPL_DATA   1028u   /* "op-1" + JSON area */
#define CHK_APPL_JSON_MAX    1024
#define EXPECTED_SSND_AUDIO  57792u  /* EXPECTED_FRAMES * 1 ch * 2 bytes = 28896*2 */

static int g_pass = 0;
static int g_fail = 0;

static void check(int cond, const char *name)
{
    if (cond) { printf("  PASS  %s\n", name); g_pass++; }
    else       { printf("  FAIL  %s\n", name); g_fail++; }
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

    /* -- Container -- */
    check((uint32_t)fsize == EXPECTED_FILE_SIZE, "file size == 58940 bytes");
    check(fsize >= 12 &&
          memcmp(buf, "FORM", 4) == 0 &&
          memcmp(buf + 8, "AIFC", 4) == 0,
          "FORM/AIFC container header");

    /* -- Chunk parsing -- */
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

    /* -- FVER -- */
    check(fver_d && fver_sz >= 4 && u32be(fver_d) == EXPECTED_FVER_VAL,
          "FVER == 0xA2805140");

    /* -- COMM -- */
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

    /* -- APPL / JSON -- */
    check(appl_sz == EXPECTED_APPL_DATA,                       "APPL size == 1028 bytes");
    check(appl_d && appl_sz >= 4 && memcmp(appl_d,"op-1",4)==0,"APPL signature == \"op-1\"");

    int jlen = 0;
    const char *json = (appl_d && appl_sz >= 4)
                       ? appl_json(appl_d, appl_sz, &jlen)
                       : NULL;

    check(json && jlen > 0 && jlen <= CHK_APPL_JSON_MAX, "JSON length <= 1024 bytes");

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

    /* -- SSND -- */
    /* SSND data layout: [4 offset][4 blockSize][audio...] */
    check(ssnd_d && ssnd_sz >= 8 && (ssnd_sz - 8) == EXPECTED_SSND_AUDIO,
          "SSND audio == 57800 bytes");

    free(buf);
    return 0;
}

static int cmd_test(int argc, char *argv[])
{
    int i;
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <file.aif> [file2.aif ...]\n", argv[0]);
        return 1;
    }
    for (i = 1; i < argc; i++)
        test_file(argv[i]);

    printf("\n%d passed, %d failed\n\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}

/* =========================================================================
 * ============================  mondo diff  ================================
 * (was diff-patches.c - diff two OP-1 Field patch JSON files)
 * ========================================================================= */

static char *resolve_json_path(const char *path) {
    size_t len = strlen(path);
    char *out;
    if (len > 4 && strcmp(path + len - 4, ".aif") == 0) {
        out = (char *)malloc(len + 2);
        memcpy(out, path, len - 4);
        strcpy(out + len - 4, ".json");
    } else {
        out = (char *)malloc(len + 1);
        strcpy(out, path);
    }
    return out;
}

static char *diff_read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "Cannot open: %s\n", path); return NULL; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return NULL; }
    fread(buf, 1, (size_t)sz, f);
    buf[sz] = '\0';
    fclose(f);
    return buf;
}

static const char *SKIP[] = { "mtime", "name", "_file", NULL };

static int should_skip(const char *key) {
    int i;
    for (i = 0; SKIP[i]; i++)
        if (strcmp(key, SKIP[i]) == 0) return 1;
    return 0;
}

static int cmd_diff(int argc, char *argv[]) {
    char *pathA, *pathB, *rawA, *rawB;
    cJSON *ja, *jb, *item;
    int diffs = 0;

    if (argc != 3) {
        fprintf(stderr, "Usage: %s <file_a> <file_b>\n", argv[0]);
        return 1;
    }

    pathA = resolve_json_path(argv[1]);
    pathB = resolve_json_path(argv[2]);

    rawA = diff_read_file(pathA);
    rawB = diff_read_file(pathB);
    if (!rawA || !rawB) return 1;

    ja = cJSON_Parse(rawA);
    jb = cJSON_Parse(rawB);
    if (!ja) { fprintf(stderr, "Failed to parse JSON: %s\n", pathA); return 1; }
    if (!jb) { fprintf(stderr, "Failed to parse JSON: %s\n", pathB); return 1; }

    printf("\nA: %s\n", pathA);
    printf("B: %s\n\n", pathB);

    cJSON_ArrayForEach(item, ja) {
        const char *key = item->string;
        char *astr, *bstr;
        int same;
        cJSON *bitem;

        if (!key || should_skip(key)) continue;

        bitem = cJSON_GetObjectItemCaseSensitive(jb, key);
        astr  = cJSON_PrintUnformatted(item);
        bstr  = bitem ? cJSON_PrintUnformatted(bitem) : NULL;
        same  = (astr && bstr && strcmp(astr, bstr) == 0);

        if (!same) {
            diffs++;
            printf("FIELD: %s\n", key);
            printf("  A : %s\n", astr ? astr : "(missing)");
            printf("  B : %s\n", bstr ? bstr : "(missing)");

            if (cJSON_IsArray(item) && bitem && cJSON_IsArray(bitem)) {
                cJSON *ae = item->child;
                cJSON *be = bitem->child;
                int ai = 0;
                while (ae && be) {
                    if (cJSON_IsNumber(ae) && cJSON_IsNumber(be)) {
                        int av = (int)ae->valuedouble;
                        int bv = (int)be->valuedouble;
                        if (av != bv) {
                            int delta = bv - av;
                            printf("  -> [%d]: %d -> %d  (%s%d)\n",
                                   ai, av, bv, delta >= 0 ? "+" : "", delta);
                        }
                    }
                    ae = ae->next; be = be->next; ai++;
                }
            }
            printf("\n");
        }
        free(astr); free(bstr);
    }

    if (diffs == 0)
        printf("No differences (excluding name/mtime).\n");

    cJSON_Delete(ja);
    cJSON_Delete(jb);
    free(rawA); free(rawB);
    free(pathA); free(pathB);
    return 0;
}

/* =========================================================================
 * ============================  mondo explore  ============================
 * (was explore-aif.c - low-level OP-1 Field .aif file explorer)
 * ========================================================================= */

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

static int cmd_explore(int argc, char *argv[]) {
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

/* =========================================================================
 * ============================  mondo summarize  ==========================
 * (was summarize.c - summarize all OP-1 Field presets in presets/*.json)
 * ========================================================================= */

#define MAX_PATCHES 512
#define MAX_TYPES    64
#define MAX_NAME     64

#define COL_RED "\033[31m"
#define COL_GRN "\033[32m"
#define COL_YEL "\033[33m"
#define COL_CYN "\033[36m"
#define COL_RST "\033[0m"

#ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
#define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
#endif

static void enable_ansi(void) {
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    if (GetConsoleMode(h, &mode))
        SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
}

/* ---- patch storage ---- */

typedef struct {
    char type[MAX_NAME];
    char fx_type[MAX_NAME];
    char lfo_type[MAX_NAME];
    int  fx_active;
    int  lfo_active;
    int  knobs[MAX_PARAMS];
    int  fx_params[MAX_PARAMS];
    int  lfo_params[MAX_PARAMS];
    int  adsr[MAX_PARAMS];
} Patch;

static Patch g_patches[MAX_PATCHES];
static int   g_n = 0;

static cJSON *g_params = NULL;
static cJSON *g_ok     = NULL;

/* ---- field selectors ---- */

#define FIELD_TYPE     0
#define FIELD_FX_TYPE  1
#define FIELD_LFO_TYPE 2

/* ---- file reading ---- */

static char *summarize_read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return NULL; }
    fread(buf, 1, (size_t)sz, f);
    buf[sz] = '\0';
    fclose(f);
    return buf;
}

/* ---- label/verified lookup ---- */

/*
 * Returns number of entries in the label array for group.type,
 * or -1 if the key is absent (type not in op1-params.json).
 */
static int summarize_get_labels(const char *group, const char *type,
                      char out[][MAX_LABEL]) {
    char key[128];
    int n = 0;
    cJSON *arr, *el;
    snprintf(key, sizeof(key), "%s.%s", group, type);
    if (!g_params) return -1;
    arr = cJSON_GetObjectItemCaseSensitive(g_params, key);
    if (!arr) return -1;
    cJSON_ArrayForEach(el, arr) {
        if (n >= MAX_PARAMS) break;
        if (cJSON_IsString(el) && el->valuestring && el->valuestring[0])
            strncpy(out[n], el->valuestring, MAX_LABEL - 1);
        else
            out[n][0] = '\0';
        n++;
    }
    return n;
}

static int is_verified(const char *group, const char *type, int idx) {
    char key[128];
    cJSON *arr, *el;
    snprintf(key, sizeof(key), "%s.%s", group, type);
    if (!g_ok) return 0;
    arr = cJSON_GetObjectItemCaseSensitive(g_ok, key);
    if (!arr) return 0;
    cJSON_ArrayForEach(el, arr)
        if (cJSON_IsNumber(el) && (int)el->valuedouble == idx) return 1;
    return 0;
}

static int get_adsr_labels(char out[][MAX_LABEL]) {
    int n = 0;
    cJSON *arr, *el;
    if (!g_params) return 0;
    arr = cJSON_GetObjectItemCaseSensitive(g_params, "adsr");
    if (!arr) return 0;
    cJSON_ArrayForEach(el, arr) {
        if (n >= MAX_PARAMS) break;
        if (cJSON_IsString(el) && el->valuestring)
            strncpy(out[n], el->valuestring, MAX_LABEL - 1);
        else
            out[n][0] = '\0';
        n++;
    }
    return n;
}

static int count_verified(const char *group, const char *type) {
    char key[128];
    int n = 0;
    cJSON *arr, *el;
    snprintf(key, sizeof(key), "%s.%s", group, type);
    if (!g_ok) return 0;
    arr = cJSON_GetObjectItemCaseSensitive(g_ok, key);
    if (!arr) return 0;
    cJSON_ArrayForEach(el, arr) { if (cJSON_IsNumber(el)) n++; }
    return n;
}

/* ---- collect and sort unique type names ---- */

static int collect_unique(int field, char out[][MAX_NAME], int max_out) {
    int n = 0, i, j;
    for (i = 0; i < g_n; i++) {
        const char *v = field == FIELD_TYPE    ? g_patches[i].type :
                        field == FIELD_FX_TYPE ? g_patches[i].fx_type :
                                                 g_patches[i].lfo_type;
        for (j = 0; j < n; j++)
            if (strcmp(out[j], v) == 0) break;
        if (j == n && n < max_out) {
            strncpy(out[n], v, MAX_NAME - 1);
            out[n][MAX_NAME - 1] = '\0';
            n++;
        }
    }
    /* insertion sort */
    for (i = 1; i < n; i++) {
        char tmp[MAX_NAME];
        strncpy(tmp, out[i], MAX_NAME - 1);
        tmp[MAX_NAME - 1] = '\0';
        j = i - 1;
        while (j >= 0 && strcmp(out[j], tmp) > 0) {
            strncpy(out[j + 1], out[j], MAX_NAME - 1);
            j--;
        }
        strncpy(out[j + 1], tmp, MAX_NAME - 1);
    }
    return n;
}

/* ---- show one type block ---- */

static void show_type_block(const char *header, const char *type,
                            const char *group, const int **arrs, int n,
                            int active_count) {
    char labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int n_labels  = summarize_get_labels(group, type, labels);
    int in_file   = (n_labels >= 0);
    int n_named   = 0, i;

    for (i = 0; i < n_labels; i++)
        if (labels[i][0]) n_named++;

    int n_verified = count_verified(group, type);

    const char *col;
    char tag[64];

    if (!in_file) {
        col = COL_RED;
        strcpy(tag, "  [add to op1-params.json]");
    } else if (n_named == 0) {
        col = COL_YEL;
        strcpy(tag, "  [names TBD]");
    } else if (n_verified >= n_named && n_named > 0) {
        col = COL_GRN;
        snprintf(tag, sizeof(tag), "  [verified %d/%d]", n_verified, n_named);
    } else if (n_verified > 0) {
        col = COL_YEL;
        snprintf(tag, sizeof(tag), "  [%d/%d verified]", n_verified, n_named);
    } else {
        col = COL_YEL;
        strcpy(tag, "  [unverified]");
    }

    printf("%s  %s (%s)%s%s\n", col, header, type, tag, COL_RST);

    /* per-index stats across all patches */
    typedef struct { int min, max, non_zero; } Stat;
    Stat stats[MAX_PARAMS];
    int  has[MAX_PARAMS];
    memset(has, 0, sizeof(has));
    memset(stats, 0, sizeof(stats));

    for (i = 0; i < n; i++) {
        int k;
        for (k = 0; k < MAX_PARAMS; k++) {
            int v = arrs[i][k];
            if (!has[k]) {
                stats[k].min = v;
                stats[k].max = v;
                has[k] = 1;
            } else {
                if (v < stats[k].min) stats[k].min = v;
                if (v > stats[k].max) stats[k].max = v;
            }
            if (v != 0) stats[k].non_zero++;
        }
    }

    for (i = 0; i < MAX_PARAMS; i++) {
        const char *label;
        char lbuf[64];
        char norm_min[16], norm_max[16];

        if (!has[i] || stats[i].non_zero == 0) continue;

        if (i < n_labels && labels[i][0])
            label = labels[i];
        else {
            snprintf(lbuf, sizeof(lbuf), "knob %d  [unknown]", i);
            label = lbuf;
        }

        snprintf(norm_min, sizeof(norm_min), "%.3f", stats[i].min / 32767.0);
        snprintf(norm_max, sizeof(norm_max), "%.3f", stats[i].max / 32767.0);

        printf("   %s%-22s %6d - %6d  (%s - %s)  %d/%d patches\n",
               is_verified(group, type, i) ? " ok" : "   ",
               label, stats[i].min, stats[i].max,
               norm_min, norm_max, stats[i].non_zero, n);
    }

    if (active_count >= 0)
        printf("    (active in %d / %d patches)\n", active_count, n);
}

/* ---- ADSR display ---- */

static void show_adsr_block(const char *stype,
                             const int **arrs, int n,
                             char labels[][MAX_LABEL], int n_labels) {
    int uniform = 1, k, i;
    if (n > 1)
        for (k = 0; k < MAX_PARAMS && uniform; k++)
            for (i = 1; i < n && uniform; i++)
                if (arrs[i][k] != arrs[0][k]) uniform = 0;

    const char *col = uniform ? COL_GRN : COL_YEL;
    printf("%s  ADSR (%s)  [%d patch%s, %s]%s\n",
           col, stype, n, n == 1 ? "" : "es",
           uniform ? "uniform" : "varies", COL_RST);

    for (k = 0; k < MAX_PARAMS; k++) {
        int mn = arrs[0][k], mx = arrs[0][k];
        for (i = 1; i < n; i++) {
            if (arrs[i][k] < mn) mn = arrs[i][k];
            if (arrs[i][k] > mx) mx = arrs[i][k];
        }
        const char *label;
        char lbuf[32];
        if (k < n_labels && labels[k][0]) label = labels[k];
        else { snprintf(lbuf, sizeof(lbuf), "adsr[%d]", k); label = lbuf; }
        printf("     %-22s %6d - %6d  (%.3f - %.3f)\n",
               label, mn, mx, mn / 32767.0, mx / 32767.0);
    }
}

static int cmd_summarize(int argc, char **argv) {
    (void)argc; (void)argv;
    char *raw;
    int i, j;
    static char stypes[MAX_TYPES][MAX_NAME];
    static char ftypes[MAX_TYPES][MAX_NAME];
    static char ltypes[MAX_TYPES][MAX_NAME];
    const int *arrs[MAX_PATCHES];
    int ns, nf, nl;

    enable_ansi();

    if ((raw = summarize_read_file("op1-params.json")) != NULL)    { g_params = cJSON_Parse(raw); free(raw); }
    if ((raw = summarize_read_file("op1-params-ok.json")) != NULL) { g_ok     = cJSON_Parse(raw); free(raw); }

    {
        struct _finddata_t fd;
        intptr_t handle = _findfirst("presets\\*.json", &fd);
        if (handle == -1) {
            printf(COL_YEL "No JSON files found in presets\\ -- run dump-all.bat first.\n" COL_RST);
            return 0;
        }
        do {
            char path[512];
            cJSON *j, *item;
            Patch *p;

            snprintf(path, sizeof(path), "presets\\%s", fd.name);
            if ((raw = summarize_read_file(path)) == NULL) continue;
            j = cJSON_Parse(raw);
            free(raw);
            if (!j) { fprintf(stderr, "Warning: failed to parse %s\n", path); continue; }
            if (g_n >= MAX_PATCHES) { cJSON_Delete(j); continue; }

            p = &g_patches[g_n];
            memset(p, 0, sizeof(*p));

            item = cJSON_GetObjectItemCaseSensitive(j, "type");
            if (item && cJSON_IsString(item)) strncpy(p->type,     item->valuestring, MAX_NAME - 1);
            item = cJSON_GetObjectItemCaseSensitive(j, "fx_type");
            if (item && cJSON_IsString(item)) strncpy(p->fx_type,  item->valuestring, MAX_NAME - 1);
            item = cJSON_GetObjectItemCaseSensitive(j, "lfo_type");
            if (item && cJSON_IsString(item)) strncpy(p->lfo_type, item->valuestring, MAX_NAME - 1);

            item = cJSON_GetObjectItemCaseSensitive(j, "fx_active");
            p->fx_active  = (item && cJSON_IsTrue(item)) ? 1 : 0;
            item = cJSON_GetObjectItemCaseSensitive(j, "lfo_active");
            p->lfo_active = (item && cJSON_IsTrue(item)) ? 1 : 0;

            item = cJSON_GetObjectItemCaseSensitive(j, "knobs");
            if (item && cJSON_IsArray(item)) {
                cJSON *el; int k = 0;
                cJSON_ArrayForEach(el, item)
                    if (k < MAX_PARAMS) p->knobs[k++] = cJSON_IsNumber(el) ? (int)el->valuedouble : 0;
            }
            item = cJSON_GetObjectItemCaseSensitive(j, "fx_params");
            if (item && cJSON_IsArray(item)) {
                cJSON *el; int k = 0;
                cJSON_ArrayForEach(el, item)
                    if (k < MAX_PARAMS) p->fx_params[k++] = cJSON_IsNumber(el) ? (int)el->valuedouble : 0;
            }
            item = cJSON_GetObjectItemCaseSensitive(j, "lfo_params");
            if (item && cJSON_IsArray(item)) {
                cJSON *el; int k = 0;
                cJSON_ArrayForEach(el, item)
                    if (k < MAX_PARAMS) p->lfo_params[k++] = cJSON_IsNumber(el) ? (int)el->valuedouble : 0;
            }
            item = cJSON_GetObjectItemCaseSensitive(j, "adsr");
            if (item && cJSON_IsArray(item)) {
                cJSON *el; int k = 0;
                cJSON_ArrayForEach(el, item)
                    if (k < MAX_PARAMS) p->adsr[k++] = cJSON_IsNumber(el) ? (int)el->valuedouble : 0;
            }

            cJSON_Delete(j);
            g_n++;
        } while (_findnext(handle, &fd) == 0);
        _findclose(handle);
    }

    printf("\n" COL_CYN "Loaded %d patch(es) from presets\\" COL_RST "\n\n", g_n);

    ns = collect_unique(FIELD_TYPE,     stypes, MAX_TYPES);
    nf = collect_unique(FIELD_FX_TYPE,  ftypes, MAX_TYPES);
    nl = collect_unique(FIELD_LFO_TYPE, ltypes, MAX_TYPES);

    /* Synth engines */
    printf(COL_CYN "=== Synth Engines ===" COL_RST "\n");
    for (i = 0; i < ns; i++) {
        int cnt = 0;
        for (j = 0; j < g_n; j++)
            if (strcmp(g_patches[j].type, stypes[i]) == 0) arrs[cnt++] = g_patches[j].knobs;
        show_type_block("Synth", stypes[i], "synth", arrs, cnt, -1);
        printf("\n");
    }

    /* FX */
    printf(COL_CYN "=== FX ===" COL_RST "\n");
    for (i = 0; i < nf; i++) {
        int cnt = 0, active = 0;
        for (j = 0; j < g_n; j++)
            if (strcmp(g_patches[j].fx_type, ftypes[i]) == 0) {
                arrs[cnt++] = g_patches[j].fx_params;
                if (g_patches[j].fx_active) active++;
            }
        show_type_block("FX", ftypes[i], "fx", arrs, cnt, active);
        printf("\n");
    }

    /* LFO */
    printf(COL_CYN "=== LFO ===" COL_RST "\n");
    for (i = 0; i < nl; i++) {
        int cnt = 0, active = 0;
        for (j = 0; j < g_n; j++)
            if (strcmp(g_patches[j].lfo_type, ltypes[i]) == 0) {
                arrs[cnt++] = g_patches[j].lfo_params;
                if (g_patches[j].lfo_active) active++;
            }
        show_type_block("LFO", ltypes[i], "lfo", arrs, cnt, active);
        printf("\n");
    }

    /* ADSR */
    {
        char adsr_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
        int n_adsr_labels = get_adsr_labels(adsr_labels);
        printf(COL_CYN "=== ADSR (per synth engine) ===" COL_RST "\n");
        for (i = 0; i < ns; i++) {
            int cnt = 0;
            for (j = 0; j < g_n; j++)
                if (strcmp(g_patches[j].type, stypes[i]) == 0)
                    arrs[cnt++] = g_patches[j].adsr;
            if (cnt > 0) {
                show_adsr_block(stypes[i], arrs, cnt, adsr_labels, n_adsr_labels);
                printf("\n");
            }
        }
    }

    /* Missing from op1-params.json */
    {
        int any = 0;
        char lb[MAX_PARAMS][MAX_LABEL];
        for (i = 0; i < ns; i++) if (summarize_get_labels("synth", stypes[i], lb) < 0) {
            if (!any++) printf(COL_RED "=== Missing from op1-params.json -- add these ===" COL_RST "\n");
            printf(COL_RED "  \"synth.%s\": []" COL_RST "\n", stypes[i]);
        }
        for (i = 0; i < nf; i++) if (summarize_get_labels("fx", ftypes[i], lb) < 0) {
            if (!any++) printf(COL_RED "=== Missing from op1-params.json -- add these ===" COL_RST "\n");
            printf(COL_RED "  \"fx.%s\": []" COL_RST "\n", ftypes[i]);
        }
        for (i = 0; i < nl; i++) if (summarize_get_labels("lfo", ltypes[i], lb) < 0) {
            if (!any++) printf(COL_RED "=== Missing from op1-params.json -- add these ===" COL_RST "\n");
            printf(COL_RED "  \"lfo.%s\": []" COL_RST "\n", ltypes[i]);
        }
        if (any) printf("\n");
    }

    printf("%d patches  /  %d synth type(s)  /  %d fx type(s)  /  %d lfo type(s)\n",
           g_n, ns, nf, nl);

    cJSON_Delete(g_params);
    cJSON_Delete(g_ok);
    return 0;
}

/* =========================================================================
 * ============================  mondo rename  =============================
 * (was rename-patch.c - replace the "name" field in a JSON patch with the
 *  patch file's own filename)
 * ========================================================================= */

/* Extract the basename without extension from a file path. */
static void rename_basename_no_ext(const char *path, char *out, size_t outsz) {
    const char *sep = strrchr(path, '/');
#ifdef _WIN32
    const char *bs = strrchr(path, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    const char *base = sep ? sep + 1 : path;

    size_t len = strlen(base);
    const char *dot = strrchr(base, '.');
    if (dot && dot > base) len = (size_t)(dot - base);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, base, len);
    out[len] = '\0';
}

/*
 * Replace the value of "name":"..." in src with new_name.
 * Writes result into out (size outsz). Returns new length, or -1 on error.
 */
static int replace_name(const char *src, size_t srclen,
                         char *out, size_t outsz,
                         const char *new_name) {
    const char *key = strstr(src, "\"name\":");
    if (!key) return -1;

    const char *v = key + 7;  /* past "name": */
    while (*v == ' ') v++;
    if (*v != '"') return -1;
    v++;  /* past opening quote */

    const char *end = v;
    while (*end && *end != '"') end++;
    if (*end != '"') return -1;

    size_t prefix = (size_t)(v - src);
    size_t nlen   = strlen(new_name);
    size_t suffix_start = (size_t)(end - src);
    size_t suffix = srclen - suffix_start;

    if (prefix + nlen + suffix + 1 >= outsz) return -1;

    memcpy(out, src, prefix);
    memcpy(out + prefix, new_name, nlen);
    memcpy(out + prefix + nlen, src + suffix_start, suffix);
    out[prefix + nlen + suffix] = '\0';
    return (int)(prefix + nlen + suffix);
}

static int process(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);

    char *src = malloc((size_t)fsize + 1);
    if (!src) { fprintf(stderr, "out of memory\n"); fclose(f); return 1; }
    fread(src, 1, (size_t)fsize, f);
    fclose(f);
    src[fsize] = '\0';

    /* strip trailing whitespace */
    long len = fsize;
    while (len > 0 && (src[len-1] == '\n' || src[len-1] == '\r' || src[len-1] == ' '))
        len--;
    src[len] = '\0';

    char new_name[256];
    rename_basename_no_ext(path, new_name, sizeof(new_name));

    char *out = malloc((size_t)len + strlen(new_name) + 2);
    if (!out) { fprintf(stderr, "out of memory\n"); free(src); return 1; }

    int outlen = replace_name(src, (size_t)len, out, (size_t)len + strlen(new_name) + 2, new_name);
    if (outlen < 0) {
        fprintf(stderr, "%s: could not find \"name\" field\n", path);
        free(src); free(out); return 1;
    }

    f = fopen(path, "wb");
    if (!f) { perror(path); free(src); free(out); return 1; }
    fwrite(out, 1, (size_t)outlen, f);
    fputc('\n', f);
    fclose(f);

    printf("%s  ->  name: \"%s\"\n", path, new_name);
    free(src);
    free(out);
    return 0;
}

#ifdef _WIN32
static void rename_walk_dir(const char *dir, WalkStats *stats) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            rename_walk_dir(child, stats);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 5 && _stricmp(fd.cFileName + len - 5, ".json") == 0) {
                if (process(child) == 0)
                    stats->processed++;
                else
                    stats->failed++;
            }
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}
#endif

static int cmd_rename(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <patch.json [patch2.json ...] | directory>\n", argv[0]);
        return 1;
    }

#ifdef _WIN32
    if (argc == 2) {
        DWORD attrs = GetFileAttributesA(argv[1]);
        if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            WalkStats stats = {0, 0};
            rename_walk_dir(argv[1], &stats);
            printf("\n=== Done: %d processed, %d failed ===\n",
                   stats.processed, stats.failed);
            return stats.failed ? 1 : 0;
        }
    }
#endif

    int ret = 0;
    for (int i = 1; i < argc; i++)
        if (process(argv[i]) != 0) ret = 1;
    return ret;
}

/* =========================================================================
 * ============================  mondo sort  ================================
 * (was sort-synths.c - organize OP-1 preset files by synth engine type)
 * ========================================================================= */

typedef struct { int moved; int skipped; int failed; } SortStats;

/* ---- helpers ---- */

static void get_parent_dir(const char *path, char *out, size_t outsz) {
    size_t len = strlen(path);
    while (len > 1 && (path[len-1] == '/' || path[len-1] == '\\')) len--;

    size_t last_sep = 0;
    int found = 0;
    for (size_t i = 0; i < len; i++) {
        if (path[i] == '/' || path[i] == '\\') { last_sep = i; found = 1; }
    }

    if (found) {
        size_t plen = last_sep == 0 ? 1 : last_sep;
        if (plen >= outsz) plen = outsz - 1;
        memcpy(out, path, plen);
        out[plen] = '\0';
    } else {
        out[0] = '.'; out[1] = '\0';
    }
}

static void sort_basename_no_ext(const char *path, char *out, size_t outsz) {
    const char *sep = strrchr(path, '/');
#ifdef _WIN32
    const char *bs = strrchr(path, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    const char *base = sep ? sep + 1 : path;
    size_t len = strlen(base);
    const char *dot = strrchr(base, '.');
    if (dot && dot > base) len = (size_t)(dot - base);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, base, len);
    out[len] = '\0';
}

static void sort_make_dirs(const char *path) {
    char tmp[MAX_PATH];
    strncpy(tmp, path, sizeof(tmp) - 1);
    tmp[sizeof(tmp) - 1] = '\0';
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '\\' || *p == '/') {
            char c = *p; *p = '\0';
            CreateDirectoryA(tmp, NULL);
            *p = c;
        }
    }
    CreateDirectoryA(tmp, NULL);
}

/* Extract the value of the "type" key from a JSON string.
   Tolerates whitespace around the colon and after it, so both the compact
   ("type":"x") and pretty-printed ("type" : "x") forms work. The "type"
   token has quotes on both sides, so it won't match "fx_type"/"lfo_type". */
static int get_synth_type(const char *json, char *out, size_t outsz) {
    const char *p = strstr(json, "\"type\"");
    if (!p) return 0;
    p += 6;                                                  /* past "type" */
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != ':') return 0;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != '"') return 0;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return i > 0;
}

/* ---- move a single file ---- */

/* Returns 0=moved, 1=failed, 2=skipped(exists). */
static int move_one(const char *src, const char *dst) {
    if (GetFileAttributesA(src) == INVALID_FILE_ATTRIBUTES)
        return 2;  /* source doesn't exist - nothing to move */

    if (GetFileAttributesA(dst) != INVALID_FILE_ATTRIBUTES) {
        printf("  skip (exists) : %s\n", dst);
        return 2;
    }

    if (!MoveFileA(src, dst)) {
        fprintf(stderr, "  FAIL          : %s -> %s  (err %lu)\n",
                src, dst, GetLastError());
        return 1;
    }
    return 0;
}

/* Find the 4-byte "op-1" APPL signature in a binary buffer. strstr is unsafe
   here because AIFF chunks (COMM, audio) contain NUL bytes; scan manually.
   Returns a pointer just past the signature (start of the JSON), or NULL. */
static const char *find_op1_json(const char *buf, long sz) {
    for (long i = 0; i + 4 <= sz; i++)
        if (buf[i] == 'o' && buf[i+1] == 'p' && buf[i+2] == '-' && buf[i+3] == '1')
            return buf + i + 4;
    return NULL;
}

/* ---- process one .aif preset ---- */

static void sort_process_file(const char *aif_path, const char *synth_base, SortStats *st) {
    /* read the .aif and pull "type" from its embedded op-1 JSON */
    FILE *f = fopen(aif_path, "rb");
    if (!f) { perror(aif_path); st->failed++; return; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f); rewind(f);
    char *buf = malloc((size_t)sz + 1);
    if (!buf) { fprintf(stderr, "out of memory\n"); fclose(f); st->failed++; return; }
    fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[sz] = '\0';

    char synth_type[64];
    const char *json = find_op1_json(buf, sz);
    if (!json || !get_synth_type(json, synth_type, sizeof(synth_type))) {
        fprintf(stderr, "skip (no op-1 metadata): %s\n", aif_path);
        free(buf); st->skipped++; return;
    }
    free(buf);

    /* build destination directory: synth_base\<type>\ */
    char dest_dir[MAX_PATH];
    snprintf(dest_dir, sizeof(dest_dir), "%s\\%s", synth_base, synth_type);
    sort_make_dirs(dest_dir);

    /* keep the original filename and extension (.aif / .aiff) */
    char base[256];
    sort_basename_no_ext(aif_path, base, sizeof(base));
    const char *dot = strrchr(aif_path, '.');
    const char *sep = strrchr(aif_path, '\\');
    const char *ext = (dot && (!sep || dot > sep)) ? dot : ".aif";

    char dst[MAX_PATH];
    snprintf(dst, sizeof(dst), "%s\\%s%s", dest_dir, base, ext);
    printf("%s%s  ->  %s\\\n", base, ext, dest_dir);

    int r = move_one(aif_path, dst);
    if (r == 1) st->failed++;
    else if (r == 0) st->moved++;
    else st->skipped++;
}

/* ---- recursive directory walker ---- */

static void sort_walk_dir(const char *dir, const char *synth_base, SortStats *st) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        /* skip the synth/ output directory */
        if (_stricmp(fd.cFileName, "synth") == 0) continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            sort_walk_dir(child, synth_base, st);
        } else {
            size_t len = strlen(fd.cFileName);
            if ((len > 4 && _stricmp(fd.cFileName + len - 4, ".aif") == 0) ||
                (len > 5 && _stricmp(fd.cFileName + len - 5, ".aiff") == 0))
                sort_process_file(child, synth_base, st);
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}

/* ---- main ---- */

static int cmd_sort(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <patch.aif | directory>\n", argv[0]);
        return 1;
    }

    const char *input = argv[1];

    /* compute parent dir and synth base */
    char parent[MAX_PATH], synth_base[MAX_PATH];
    get_parent_dir(input, parent, sizeof(parent));
    snprintf(synth_base, sizeof(synth_base), "%s\\synth", parent);

    DWORD attrs = GetFileAttributesA(input);
    if (attrs == INVALID_FILE_ATTRIBUTES) {
        fprintf(stderr, "not found: %s\n", input);
        return 1;
    }

    SortStats st = {0, 0, 0};

    if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
        sort_walk_dir(input, synth_base, &st);
        printf("\n=== Done: %d moved, %d skipped, %d failed ===\n",
               st.moved, st.skipped, st.failed);
    } else {
        sort_process_file(input, synth_base, &st);
    }

    return st.failed ? 1 : 0;
}

/* =========================================================================
 * ============================  mondo tag  =================================
 * (was tag-patch.c - generate musical descriptor tags from an OP-1 Field
 *  JSON patch)
 * ========================================================================= */

/* ---- JSON extractors (copied from op1dump.c) ---- */

static const char *tag_json_find_value(const char *json, const char *key) {
    char search[128];
    snprintf(search, sizeof(search), "\"%s\":", key);
    const char *p = strstr(json, search);
    if (!p) return NULL;
    return p + strlen(search);
}

static int tag_json_get_string(const char *json, const char *key,
                           char *out, size_t outsz) {
    const char *p = tag_json_find_value(json, key);
    if (!p || *p != '"') return 0;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return 1;
}

static int tag_json_get_int(const char *json, const char *key, int *out) {
    const char *p = tag_json_find_value(json, key);
    if (!p) return 0;
    return sscanf(p, "%d", out) == 1;
}

static int tag_json_get_bool(const char *json, const char *key, int *out) {
    const char *p = tag_json_find_value(json, key);
    if (!p) return 0;
    if (strncmp(p, "true",  4) == 0) { *out = 1; return 1; }
    if (strncmp(p, "false", 5) == 0) { *out = 0; return 1; }
    return 0;
}

static int tag_json_get_int_array(const char *json, const char *key,
                              int *arr, int maxlen) {
    const char *p = tag_json_find_value(json, key);
    if (!p || *p != '[') return 0;
    p++;
    int count = 0;
    while (count < maxlen) {
        while (*p == ' ' || *p == '\n' || *p == '\r') p++;
        if (*p == ']' || *p == '\0') break;
        if (sscanf(p, "%d", &arr[count]) != 1) break;
        count++;
        while (*p && *p != ',' && *p != ']') p++;
        if (*p == ',') p++;
    }
    return count;
}

/* ---- tag set ---- */

#define MAX_TAGS      48
#define MAX_TAG_LEN   32

typedef struct {
    char tags[MAX_TAGS][MAX_TAG_LEN];
    int  count;
} TagSet;

static void add_tag(TagSet *ts, const char *tag) {
    for (int i = 0; i < ts->count; i++)
        if (strcmp(ts->tags[i], tag) == 0) return;  /* deduplicate */
    if (ts->count >= MAX_TAGS) return;
    strncpy(ts->tags[ts->count], tag, MAX_TAG_LEN - 1);
    ts->tags[ts->count][MAX_TAG_LEN - 1] = '\0';
    ts->count++;
}

static int has_tag(const TagSet *ts, const char *tag) {
    for (int i = 0; i < ts->count; i++)
        if (strcmp(ts->tags[i], tag) == 0) return 1;
    return 0;
}

/* ---- normalizers ---- */

/* Unipolar: [0, 32767] -> [0.0, 1.0] */
static float norm(int v) {
    float f = (float)v / 32767.0f;
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* Bipolar: [-32767, 32767] -> [0.0, 1.0] */
static float norm_bi(int v) {
    float f = (float)(v + 32767) / 65534.0f;
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* Normalize within a known [lo, hi] range */
static float norm_range(int v, int lo, int hi) {
    if (hi == lo) return 0.0f;
    float f = (float)(v - lo) / (float)(hi - lo);
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* ---- envelope tagger ---- */

static void tag_envelope(TagSet *ts, const int adsr[8]) {
    float attack     = norm(adsr[0]);
    float sustain    = norm(adsr[2]);
    float release    = norm(adsr[3]);
    float portamento = norm(adsr[5]);

    /* Attack */
    if (attack < 0.02f)       { add_tag(ts, "percussive"); add_tag(ts, "immediate"); }
    else if (attack < 0.15f)    add_tag(ts, "snappy");
    else if (attack >= 0.50f && attack < 0.75f) add_tag(ts, "slow attack");
    else if (attack >= 0.75f)  { add_tag(ts, "slow attack"); add_tag(ts, "swelling"); }

    /* Sustain */
    if (sustain > 0.65f && attack < 0.15f) add_tag(ts, "pad");
    if (sustain > 0.65f)  add_tag(ts, "sustained");
    else if (sustain < 0.20f) add_tag(ts, "decaying");

    /* Release */
    if (release > 0.55f)      add_tag(ts, "lingering");
    else if (release < 0.10f) add_tag(ts, "tight");

    /* Portamento */
    if (portamento > 0.30f) { add_tag(ts, "legato"); add_tag(ts, "gliding"); }
    else if (portamento > 0.10f) add_tag(ts, "slight glide");
}

/* ---- engine taggers ---- */

static void tag_cluster(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Number, k[1]=Wave Env, k[2]=Spread, k[3]=Unitor */
    float wave_env = norm(k[1]);
    float spread   = norm_range(k[2], 512, 24064);

    if (wave_env > 0.65f) { add_tag(ts, "morphing"); add_tag(ts, "evolving"); }
    if (spread > 0.55f)   { add_tag(ts, "wide"); add_tag(ts, "chorus-like"); }
    else if (spread < 0.20f) { add_tag(ts, "focused"); add_tag(ts, "tight voices"); }
}

static void tag_dimension(TagSet *ts, const int k[8]) {
    /* k[0]=Waveform, k[1]=Stereo, k[2]=Filter Cutoff, k[3]=Resonance */
    float cutoff    = norm(k[2]);
    float resonance = norm(k[3]);
    float stereo    = norm(k[1]);

    if (cutoff > 0.65f)      { add_tag(ts, "bright"); add_tag(ts, "open"); }
    else if (cutoff < 0.30f) { add_tag(ts, "dark"); add_tag(ts, "filtered"); }

    if (resonance > 0.80f)      { add_tag(ts, "resonant"); add_tag(ts, "nasal"); add_tag(ts, "cutting"); }
    else if (resonance > 0.60f) { add_tag(ts, "resonant"); add_tag(ts, "nasal"); }

    if (stereo > 0.60f) add_tag(ts, "wide stereo");
}

static void tag_digital(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Shaper, k[1]=Octave, k[2]=Detune+RingMod, k[3]=Digitalness */
    float digitalness = norm(k[3]);
    float ringmod     = norm(k[2]);

    if (digitalness > 0.65f) { add_tag(ts, "harsh"); add_tag(ts, "lo-fi digital"); }
    if (ringmod > 0.50f)     { add_tag(ts, "ring modulated"); add_tag(ts, "metallic"); }
}

static void tag_fm(TagSet *ts, const int k[8]) {
    /* k[0]=FM Amount, k[1]=Frequency, k[2]=Topology, k[3]=Detune */
    float fm_amt = norm(k[0]);
    float detune = norm(k[3]);

    if (fm_amt > 0.70f)      { add_tag(ts, "metallic"); add_tag(ts, "inharmonic"); add_tag(ts, "complex harmonics"); }
    else if (fm_amt > 0.30f)   add_tag(ts, "warm FM");
    else                       add_tag(ts, "subtle FM");

    if (detune > 0.40f) { add_tag(ts, "detuned"); add_tag(ts, "beating"); }
}

static void tag_pulse(TagSet *ts, const int k[8]) {
    /* k[0]=Filter, k[1]=Amplitude, k[2]=Pulse Two, k[3]=Modulation */
    float filter = norm(k[0]);
    float mod    = norm(k[3]);

    if (filter < 0.30f)      { add_tag(ts, "dark"); add_tag(ts, "filtered pulse"); }
    else if (filter > 0.70f) { add_tag(ts, "buzzy"); add_tag(ts, "bright pulse"); }

    if (mod > 0.50f) add_tag(ts, "animated");
}

static void tag_string(TagSet *ts, const int k[8]) {
    /* k[0]=Tension, k[1]=Decay, k[2]=Detune, k[3]=Impulse Type */
    float tension = norm(k[0]);
    float detune  = norm(k[2]);

    if (tension < 0.20f)      { add_tag(ts, "slack"); add_tag(ts, "loose"); }
    else if (tension > 0.70f) { add_tag(ts, "bright string"); add_tag(ts, "taut"); }

    if (detune > 0.40f) add_tag(ts, "detuned");
}

static void tag_voltage(TagSet *ts, const int k[8]) {
    /* k[0]=Ampere Mod, k[1]=Ground Noise, k[2]=Phase Filter, k[3]=Voltage Detune */
    float noise  = norm(k[1]);
    float detune = norm(k[3]);

    if (noise > 0.30f)   { add_tag(ts, "noisy"); add_tag(ts, "gritty"); }
    if (detune > 0.50f)  { add_tag(ts, "unstable"); add_tag(ts, "drifting"); }
}

static void tag_dna(TagSet *ts, const int k[8]) {
    /* k[0]=Filter (bipolar), k[1]=Wave Number, k[2]=Wave Modifier, k[3]=Noise */
    float filter = norm_bi(k[0]);
    float noise  = norm(k[3]);

    if (filter < 0.30f)      add_tag(ts, "dark");
    else if (filter > 0.70f) add_tag(ts, "bright");

    if (noise > 0.20f) { add_tag(ts, "noisy"); add_tag(ts, "organic"); }
}

static void tag_drwave(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Type And Length, k[1]=Filter, k[2]=Phase, k[3]=Chorus */
    float filter = norm(k[1]);
    float chorus = norm(k[3]);

    if (filter < 0.30f) { add_tag(ts, "dark"); add_tag(ts, "filtered"); }
    if (chorus > 0.40f)   add_tag(ts, "chorused");
}

static void tag_dsynth(TagSet *ts, const int k[8]) {
    /* k[2]=Envelope Crossfader drives character */
    float crossfade = norm(k[0]);
    if (crossfade > 0.65f) add_tag(ts, "bright");
    else if (crossfade < 0.25f) add_tag(ts, "dark");
}

static void tag_phase(TagSet *ts, const int k[8]) {
    /* k[0]=Phase Shift, k[1]=Distortion, k[2]=Phase Filter, k[3]=Phase Tilt */
    float distortion = norm(k[1]);
    float tilt       = norm(k[3]);

    if (distortion > 0.50f) { add_tag(ts, "distorted"); add_tag(ts, "gritty"); }
    if (tilt > 0.60f)       { add_tag(ts, "tilted"); add_tag(ts, "filtered"); }
}

static void tag_amp(TagSet *ts, const int k[8]) {
    /* k[2]=Tone, k[3]=Drive */
    float drive = norm(k[3]);
    if (drive > 0.60f) add_tag(ts, "driven");
    else               add_tag(ts, "clean");
}

static void tag_engine(TagSet *ts, const char *type, const int k[8]) {
    /* Always add the engine name as a base tag */
    add_tag(ts, type);

    if      (strcmp(type, "cluster")   == 0) tag_cluster(ts, k);
    else if (strcmp(type, "dimension") == 0) tag_dimension(ts, k);
    else if (strcmp(type, "digital")   == 0) tag_digital(ts, k);
    else if (strcmp(type, "fm")        == 0) tag_fm(ts, k);
    else if (strcmp(type, "pulse")     == 0) tag_pulse(ts, k);
    else if (strcmp(type, "string")    == 0) tag_string(ts, k);
    else if (strcmp(type, "voltage")   == 0) tag_voltage(ts, k);
    else if (strcmp(type, "dna")       == 0) tag_dna(ts, k);
    else if (strcmp(type, "drwave")    == 0) tag_drwave(ts, k);
    else if (strcmp(type, "dsynth")    == 0) tag_dsynth(ts, k);
    else if (strcmp(type, "phase")     == 0) tag_phase(ts, k);
    else if (strcmp(type, "amp")       == 0) tag_amp(ts, k);
    /* sampler, vocoder, dbox: engine tag only */
}

/* ---- FX tagger ---- */

static void tag_fx(TagSet *ts, const char *type, const int fx[8], int active) {
    if (!active) return;

    if (strcmp(type, "mother") == 0) {
        float mix      = norm(fx[3]);
        float distance = norm(fx[0]);
        if (mix > 0.50f)      { add_tag(ts, "reverb-heavy"); add_tag(ts, "lush"); add_tag(ts, "spacious"); }
        else if (mix > 0.20f)   add_tag(ts, "roomy");
        else                    add_tag(ts, "slight reverb");
        if (distance > 0.60f)   add_tag(ts, "large room");
    } else if (strcmp(type, "delay") == 0) {
        float level = norm(fx[3]);
        add_tag(ts, "echo"); add_tag(ts, "delay");
        if (level > 0.50f) add_tag(ts, "delay-heavy");
    } else if (strcmp(type, "spring")   == 0) { add_tag(ts, "spring reverb"); add_tag(ts, "vintage"); }
    else if (strcmp(type, "cwo")        == 0) { add_tag(ts, "chorus"); add_tag(ts, "shimmer"); }
    else if (strcmp(type, "nitro")      == 0) { add_tag(ts, "filtered"); add_tag(ts, "lo-fi"); }
    else if (strcmp(type, "phone")      == 0) { add_tag(ts, "lo-fi"); add_tag(ts, "telephone"); }
    else if (strcmp(type, "terminal")   == 0) { add_tag(ts, "bitcrushed"); add_tag(ts, "digital dirt"); }
    else if (strcmp(type, "punch")      == 0) { add_tag(ts, "driven"); add_tag(ts, "punchy"); }
    else if (strcmp(type, "grid")       == 0) { add_tag(ts, "rhythmic echo"); add_tag(ts, "stutter"); }
}

/* ---- LFO tagger ---- */

static void tag_lfo(TagSet *ts, const char *type, const int lfo[8], int active) {
    if (!active) return;

    if (strcmp(type, "tremolo") == 0) {
        /* lfo[0]=Speed, lfo[1]=Pitch Amount, lfo[2]=Volume Level, lfo[7]=LFO Shape */
        float speed  = norm(lfo[0]);
        float pitch  = norm_bi(lfo[1]);  /* can be negative */
        float volume = norm(lfo[2]);

        if (speed < 0.20f)      add_tag(ts, "slow tremolo");
        else if (speed > 0.60f) add_tag(ts, "fast tremolo");
        else                    add_tag(ts, "tremolo");

        if (pitch > 0.15f)   add_tag(ts, "vibrato");
        if (volume > 0.15f)  add_tag(ts, "tremolo");
    } else if (strcmp(type, "element") == 0) {
        /* lfo[1]=Amount */
        float amount = norm_bi(lfo[1]);
        if (amount > 0.20f) { add_tag(ts, "animated"); add_tag(ts, "envelope-driven"); }
    } else if (strcmp(type, "random")   == 0) { add_tag(ts, "random modulation"); add_tag(ts, "unpredictable"); }
    else if (strcmp(type, "value")      == 0)   add_tag(ts, "stepped modulation");
    else if (strcmp(type, "velocity")   == 0)   add_tag(ts, "velocity sensitive");
    else if (strcmp(type, "midi")       == 0)   add_tag(ts, "midi modulated");
}

/* ---- octave tagger ---- */

static void tag_octave(TagSet *ts, int octave) {
    if (octave <= -2)     { add_tag(ts, "sub"); add_tag(ts, "low register"); }
    else if (octave == -1)  add_tag(ts, "low register");
    else if (octave == 1)   add_tag(ts, "upper register");
    else if (octave >= 2)  { add_tag(ts, "high register"); add_tag(ts, "bright"); }
}

/* ---- composite tagger ---- */

static void tag_composite(TagSet *ts) {
    int is_pad        = has_tag(ts, "pad");
    int is_percussive = has_tag(ts, "percussive");
    int is_sustained  = has_tag(ts, "sustained");
    int is_spacious   = has_tag(ts, "spacious");
    int is_lush       = has_tag(ts, "lush");
    int is_swelling   = has_tag(ts, "swelling");
    int is_lingering  = has_tag(ts, "lingering");
    int is_tight      = has_tag(ts, "tight");
    int is_legato     = has_tag(ts, "legato");
    int is_fm         = has_tag(ts, "fm");
    int is_metallic   = has_tag(ts, "metallic");

    if (is_pad && (is_spacious || is_lush))          add_tag(ts, "ambient");
    if (is_percussive && is_tight)                    add_tag(ts, "stab");
    if (is_swelling && is_lingering)                  add_tag(ts, "cinematic");
    if (is_sustained && is_legato && !is_pad)         add_tag(ts, "lead");
    if (is_fm && is_metallic && is_percussive)        add_tag(ts, "bell");
}

/* ---- file helpers ---- */

static void tag_basename_no_ext(const char *path, char *out, size_t outsz) {
    const char *sep = strrchr(path, '/');
#ifdef _WIN32
    const char *bs = strrchr(path, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    const char *base = sep ? sep + 1 : path;
    size_t len = strlen(base);
    const char *dot = strrchr(base, '.');
    if (dot && dot > base) len = (size_t)(dot - base);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, base, len);
    out[len] = '\0';
}

static void make_tags_path(const char *json_path, char *out, size_t outsz) {
    size_t len = strlen(json_path);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, json_path, len);
    out[len] = '\0';
    char *dot = strrchr(out, '.');
    char *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bs = strrchr(out, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    if (dot && (!sep || dot > sep)) strcpy(dot, ".tags");
    else if (len + 5 < outsz)      strcpy(out + len, ".tags");
}

/* ---- process one file ---- */

static int tag_process_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f); rewind(f);
    char *json = (char *)malloc((size_t)sz + 1);
    if (!json) { fprintf(stderr, "out of memory\n"); fclose(f); return 1; }
    fread(json, 1, (size_t)sz, f);
    fclose(f);
    json[sz] = '\0';

    /* parse fields */
    char synth_type[64] = {0};
    char fx_type[64]    = {0};
    char lfo_type[64]   = {0};
    int  octave         = 0;
    int  fx_active      = 0;
    int  lfo_active     = 0;
    int  knobs[8]       = {0};
    int  adsr[8]        = {0};
    int  fx_params[8]   = {0};
    int  lfo_params[8]  = {0};

    tag_json_get_string(json, "type",      synth_type, sizeof(synth_type));
    tag_json_get_string(json, "fx_type",   fx_type,    sizeof(fx_type));
    tag_json_get_string(json, "lfo_type",  lfo_type,   sizeof(lfo_type));
    tag_json_get_int   (json, "octave",    &octave);
    tag_json_get_bool  (json, "fx_active", &fx_active);
    tag_json_get_bool  (json, "lfo_active",&lfo_active);
    tag_json_get_int_array(json, "knobs",      knobs,      8);
    tag_json_get_int_array(json, "adsr",       adsr,       8);
    tag_json_get_int_array(json, "fx_params",  fx_params,  8);
    tag_json_get_int_array(json, "lfo_params", lfo_params, 8);

    if (!synth_type[0]) {
        fprintf(stderr, "%s: no \"type\" field\n", path);
        free(json); return 1;
    }

    /* build tags */
    TagSet ts = {{{{0}}}, 0};
    tag_engine  (&ts, synth_type, knobs);
    tag_envelope(&ts, adsr);
    tag_fx      (&ts, fx_type,  fx_params,  fx_active);
    tag_lfo     (&ts, lfo_type, lfo_params, lfo_active);
    tag_octave  (&ts, octave);
    tag_composite(&ts);

    /* format tag string */
    char tag_line[1024] = {0};
    size_t pos = 0;
    for (int i = 0; i < ts.count; i++) {
        if (i > 0) { tag_line[pos++] = ','; tag_line[pos++] = ' '; }
        size_t tlen = strlen(ts.tags[i]);
        if (pos + tlen + 3 >= sizeof(tag_line)) break;
        memcpy(tag_line + pos, ts.tags[i], tlen);
        pos += tlen;
    }
    tag_line[pos] = '\0';

    /* print to stdout */
    char base[256];
    tag_basename_no_ext(path, base, sizeof(base));
    printf("%s: %s\n", base, tag_line);

    /* write .tags sidecar */
    char tags_path[MAX_PATH];
    make_tags_path(path, tags_path, sizeof(tags_path));
    FILE *tf = fopen(tags_path, "w");
    if (tf) {
        fprintf(tf, "%s\n", tag_line);
        fclose(tf);
    }

    free(json);
    return 0;
}

/* ---- directory walker ---- */

#ifdef _WIN32
static void tag_walk_dir(const char *dir, WalkStats *stats) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;
        if (_stricmp(fd.cFileName, "synth") == 0) continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            tag_walk_dir(child, stats);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 5 && _stricmp(fd.cFileName + len - 5, ".json") == 0) {
                if (tag_process_file(child) == 0) stats->processed++;
                else                              stats->failed++;
            }
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}
#endif

static int cmd_tag(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <patch.json [patch2.json ...] | directory>\n", argv[0]);
        return 1;
    }

#ifdef _WIN32
    if (argc == 2) {
        DWORD attrs = GetFileAttributesA(argv[1]);
        if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            WalkStats stats = {0, 0};
            clock_t t0 = clock();
            tag_walk_dir(argv[1], &stats);
            double elapsed = (double)(clock() - t0) / CLOCKS_PER_SEC;
            printf("\n=== Done: %d tagged, %d failed  (%.2f sec) ===\n",
                   stats.processed, stats.failed, elapsed);
            return stats.failed ? 1 : 0;
        }
    }
#endif

    int ret = 0;
    for (int i = 1; i < argc; i++)
        if (tag_process_file(argv[i]) != 0) ret = 1;
    return ret;
}

/* =========================================================================
 * ============================  mondo wrap  ================================
 * (was wrap-sampler.c - wrap a raw audio file into an OP-1 Field "sampler"
 *  patch)
 * ========================================================================= */

#define DEFAULT_BASE_FREQ  261.625550   /* Middle C - OP-1 sampler default root */
#define APPL_DATA_SIZE     1028         /* 4-byte "op-1" sig + 1024-byte JSON area */
#define SAMPLER_WARN_SECS  6.0          /* hardware sampler patches observed at ~6 s */

typedef struct { int wrapped; int skipped; int failed; } WrapStats;

/* ---- byte writers (AIFF structure is big-endian) ---- */
static void wrap_w16(uint8_t *p, uint16_t v) { p[0] = (v >> 8) & 0xFF; p[1] = v & 0xFF; }
static void wrap_w32(uint8_t *p, uint32_t v) {
    p[0] = (v >> 24) & 0xFF; p[1] = (v >> 16) & 0xFF;
    p[2] = (v >> 8) & 0xFF;  p[3] = v & 0xFF;
}
static uint32_t put_chunk(uint8_t *buf, uint32_t pos, const char *id, uint32_t sz) {
    memcpy(buf + pos, id, 4); wrap_w32(buf + pos + 4, sz); return pos + 8;
}
static void wrap_write_80bit_extended(uint8_t *p, uint32_t hz) {
    int exp = 0; uint32_t tmp = hz;
    while (tmp > 1) { tmp >>= 1; exp++; }
    uint16_t biased = (uint16_t)(exp + 16383);
    uint64_t mant = (uint64_t)hz << (63 - exp);
    p[0] = (biased >> 8) & 0xFF; p[1] = biased & 0xFF;
    p[2] = (uint8_t)(mant >> 56); p[3] = (uint8_t)(mant >> 48);
    p[4] = (uint8_t)(mant >> 40); p[5] = (uint8_t)(mant >> 32);
    p[6] = (uint8_t)(mant >> 24); p[7] = (uint8_t)(mant >> 16);
    p[8] = (uint8_t)(mant >> 8);  p[9] = (uint8_t)(mant);
}

/* ---- byte readers ---- */
static uint16_t r16le(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static uint32_t r32le(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t r16be(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }
static uint32_t r32be(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}
/* AIFF 80-bit IEEE extended -> integer Hz (no float / math.h needed) */
static uint32_t read_80bit_extended(const uint8_t *p) {
    int ex = ((p[0] & 0x7F) << 8) | p[1];
    uint64_t mant = ((uint64_t)p[2] << 56) | ((uint64_t)p[3] << 48) |
                    ((uint64_t)p[4] << 40) | ((uint64_t)p[5] << 32) |
                    ((uint64_t)p[6] << 24) | ((uint64_t)p[7] << 16) |
                    ((uint64_t)p[8] << 8)  |  (uint64_t)p[9];
    if (ex == 0 && mant == 0) return 0;
    int shift = (16383 + 63) - ex;          /* value = mant * 2^(ex-16383-63) */
    if (shift < 0 || shift > 63) return 0;
    return (uint32_t)(mant >> shift);
}

/* ---- read whole file ---- */
static uint8_t *wrap_slurp(const char *path, long *out_sz) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END); long sz = ftell(f); rewind(f);
    if (sz <= 0) { fclose(f); return NULL; }
    uint8_t *buf = (uint8_t *)malloc((size_t)sz);
    if (!buf) { fclose(f); return NULL; }
    if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) { free(buf); fclose(f); return NULL; }
    fclose(f);
    *out_sz = sz;
    return buf;
}

/* clamp a 32-bit sample value to int16 */
static int16_t clamp16(int32_t v) {
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    return (int16_t)v;
}

/* ---- decode source audio -> mono int16 ---- */
/* Returns malloc'd mono int16 PCM (caller frees); sets *frames and *rate. */
static int16_t *decode_audio(const char *path, uint32_t *frames, uint32_t *rate, uint16_t *out_ch) {
    long fsize = 0;
    uint8_t *buf = wrap_slurp(path, &fsize);
    if (!buf) { fprintf(stderr, "  cannot read: %s\n", path); return NULL; }

    int16_t *out = NULL;

    if (fsize >= 12 && memcmp(buf, "RIFF", 4) == 0 && memcmp(buf + 8, "WAVE", 4) == 0) {
        /* ---- WAV (RIFF/WAVE), little-endian ---- */
        uint16_t fmt = 0, ch = 0, bits = 0; uint32_t rt = 0;
        const uint8_t *data = NULL; uint32_t data_sz = 0;
        long pos = 12;
        while (pos + 8 <= fsize) {
            const uint8_t *id = buf + pos;
            uint32_t sz = r32le(buf + pos + 4);
            long dp = pos + 8;
            if (dp + (long)sz > fsize) sz = (uint32_t)(fsize - dp);
            if (memcmp(id, "fmt ", 4) == 0 && sz >= 16) {
                fmt  = r16le(buf + dp);
                ch   = r16le(buf + dp + 2);
                rt   = r32le(buf + dp + 4);
                bits = r16le(buf + dp + 14);
            } else if (memcmp(id, "data", 4) == 0) {
                data = buf + dp; data_sz = sz;
            }
            pos = dp + sz + (sz & 1);          /* chunks pad to even */
        }
        if (fmt != 1 || !ch || !rt || !data || (bits != 16 && bits != 24)) {
            fprintf(stderr, "  unsupported WAV (fmt=%u ch=%u bits=%u): %s\n", fmt, ch, bits, path);
            free(buf); return NULL;
        }
        uint32_t bytes_per = bits / 8;
        uint16_t oc = (ch >= 2) ? 2 : 1;            /* preserve mono / stereo */
        uint32_t nf = data_sz / (ch * bytes_per);
        out = (int16_t *)malloc((size_t)nf * oc * sizeof(int16_t));
        if (!out) { free(buf); return NULL; }
        for (uint32_t i = 0; i < nf; i++) {
            for (uint16_t c = 0; c < oc; c++) {
                const uint8_t *s = data + (size_t)(i * ch + c) * bytes_per;
                int32_t v;
                if (bits == 16) v = (int16_t)r16le(s);
                else /* 24 */ { v = (int32_t)((s[0]) | (s[1] << 8) | (s[2] << 16));
                                if (v & 0x800000) v |= ~0xFFFFFF; v >>= 8; }
                out[(size_t)i * oc + c] = clamp16(v);
            }
        }
        *frames = nf; *rate = rt; *out_ch = oc;

    } else if (fsize >= 12 && memcmp(buf, "FORM", 4) == 0 &&
               (memcmp(buf + 8, "AIFF", 4) == 0 || memcmp(buf + 8, "AIFC", 4) == 0)) {
        /* ---- AIFF / AIFF-C, big-endian structure ---- */
        int is_aifc = memcmp(buf + 8, "AIFC", 4) == 0;
        uint16_t ch = 0, bits = 0; uint32_t nf = 0, rt = 0;
        int little_endian = 0;                 /* 'sowt' samples are LE */
        const uint8_t *ssnd = NULL; uint32_t ssnd_sz = 0;
        long pos = 12;
        while (pos + 8 <= fsize) {
            const uint8_t *id = buf + pos;
            uint32_t sz = r32be(buf + pos + 4);
            long dp = pos + 8;
            if (dp + (long)sz > fsize) sz = (uint32_t)(fsize - dp);
            if (memcmp(id, "COMM", 4) == 0 && sz >= 18) {
                ch   = r16be(buf + dp);
                nf   = r32be(buf + dp + 2);
                bits = r16be(buf + dp + 6);
                rt   = read_80bit_extended(buf + dp + 8);
                if (is_aifc && sz >= 22 && memcmp(buf + dp + 18, "sowt", 4) == 0)
                    little_endian = 1;
            } else if (memcmp(id, "SSND", 4) == 0 && sz >= 8) {
                uint32_t offset = r32be(buf + dp);
                ssnd = buf + dp + 8 + offset; ssnd_sz = sz - 8 - offset;
            }
            pos = dp + sz + (sz & 1);
        }
        if (!ch || !rt || !ssnd || bits != 16) {
            fprintf(stderr, "  unsupported AIFF (ch=%u bits=%u): %s\n", ch, bits, path);
            free(buf); return NULL;
        }
        uint16_t oc = (ch >= 2) ? 2 : 1;            /* preserve mono / stereo */
        uint32_t avail = ssnd_sz / (ch * 2u);
        if (!nf || nf > avail) nf = avail;
        out = (int16_t *)malloc((size_t)nf * oc * sizeof(int16_t));
        if (!out) { free(buf); return NULL; }
        for (uint32_t i = 0; i < nf; i++) {
            for (uint16_t c = 0; c < oc; c++) {
                const uint8_t *s = ssnd + (size_t)(i * ch + c) * 2;
                out[(size_t)i * oc + c] = (int16_t)(little_endian ? r16le(s) : r16be(s));
            }
        }
        *frames = nf; *rate = rt; *out_ch = oc;

    } else {
        fprintf(stderr, "  not a WAV or AIFF file: %s\n", path);
        free(buf); return NULL;
    }

    free(buf);
    return out;
}

/* ---- build the sampler patch JSON ---- */
/* Keys in strict alphabetical order (firmware requirement). */
static int build_sampler_json(char *out, size_t outsz, const char *name, uint16_t channels) {
    return snprintf(out, outsz,
        "{ \"adsr\" : [ 64, 10746, 32767, 10000, 4000, 64, 4000, 4000 ], "
        "\"base_freq\" : %.6f, "
        "\"fx_active\" : false, "
        "\"fx_params\" : [ 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000 ], "
        "\"fx_type\" : \"delay\", "
        "\"knobs\" : [ 0, 0, 32767, 32766, 8192, 16384, 0, 8192 ], "
        "\"lfo_active\" : false, "
        "\"lfo_params\" : [ 16000, 0, 0, 16000, 0, 0, 0, 0 ], "
        "\"lfo_type\" : \"tremolo\", "
        "\"name\" : \"%s\", "
        "\"octave\" : 0, "
        "%s"                                        /* "stereo" : true,  (only when stereo) */
        "\"synth_version\" : 2, "
        "\"type\" : \"sampler\" }",
        DEFAULT_BASE_FREQ, name, channels == 2 ? "\"stereo\" : true, " : "");
}

/* ---- write the OP-1 sampler .aif (AIFF-C 'sowt', mono, 16-bit) ---- */
static int write_patch(const char *out_path, const char *name,
                       const int16_t *pcm, uint32_t frames, uint32_t rate, uint16_t channels) {
    char json[APPL_DATA_SIZE];
    int json_len = build_sampler_json(json, sizeof(json), name, channels);
    if (json_len <= 0 || json_len > APPL_DATA_SIZE - 4 - 1) {
        fprintf(stderr, "  JSON build error\n"); return 1;
    }

    static const char *COMPR = "Signed integer (little-endian) linear PCM";
    uint8_t pascal_len = (uint8_t)strlen(COMPR);
    uint32_t comm_size = 2 + 4 + 2 + 10 + 4 + (1 + pascal_len);
    uint32_t audio_bytes = frames * channels * (BIT_DEPTH / 8);
    uint32_t ssnd_size = 4 + 4 + audio_bytes;
    uint32_t chunks = (8 + 4) + (8 + comm_size) + (8 + APPL_DATA_SIZE) + (8 + ssnd_size);
    uint32_t form_body = 4 + chunks;
    uint32_t total = 8 + form_body;

    uint8_t *buf = (uint8_t *)calloc(1, total);
    if (!buf) { fprintf(stderr, "  out of memory\n"); return 1; }

    uint32_t pos = 0;
    memcpy(buf + pos, "FORM", 4); pos += 4;
    wrap_w32(buf + pos, form_body);    pos += 4;
    memcpy(buf + pos, "AIFC", 4); pos += 4;

    pos = put_chunk(buf, pos, "FVER", 4);
    wrap_w32(buf + pos, 0xA2805140); pos += 4;

    pos = put_chunk(buf, pos, "COMM", comm_size);
    wrap_w16(buf + pos, channels);   pos += 2;            /* 1 = mono, 2 = stereo */
    wrap_w32(buf + pos, frames);     pos += 4;
    wrap_w16(buf + pos, BIT_DEPTH);  pos += 2;
    wrap_write_80bit_extended(buf + pos, rate); pos += 10;
    memcpy(buf + pos, "sowt", 4); pos += 4;
    buf[pos++] = pascal_len;
    memcpy(buf + pos, COMPR, pascal_len); pos += pascal_len;

    pos = put_chunk(buf, pos, "APPL", APPL_DATA_SIZE);
    memcpy(buf + pos, "op-1", 4);            pos += 4;
    memcpy(buf + pos, json, (size_t)json_len); pos += (uint32_t)json_len;
    buf[pos++] = '\n';
    uint32_t pad = APPL_DATA_SIZE - 4 - (uint32_t)json_len - 1;
    memset(buf + pos, ' ', pad); pos += pad;

    pos = put_chunk(buf, pos, "SSND", ssnd_size);
    wrap_w32(buf + pos, 0); pos += 4;             /* offset */
    wrap_w32(buf + pos, 0); pos += 4;             /* blockSize */
    memcpy(buf + pos, pcm, audio_bytes);     /* 'sowt' = little-endian (native) */
    pos += audio_bytes;

    FILE *f = fopen(out_path, "wb");
    if (!f) { perror(out_path); free(buf); return 1; }
    int ok = (fwrite(buf, 1, total, f) == total);
    fclose(f); free(buf);
    if (!ok) { fprintf(stderr, "  write error: %s\n", out_path); return 1; }
    return 0;
}

/* ---- path helpers ---- */
static void wrap_stem_of(const char *path, char *out, size_t outsz) {
    const char *sep = strrchr(path, '/');
#ifdef _WIN32
    const char *bs = strrchr(path, '\\'); if (!sep || (bs && bs > sep)) sep = bs;
#endif
    const char *base = sep ? sep + 1 : path;
    const char *dot = strrchr(base, '.');
    size_t len = (dot && dot > base) ? (size_t)(dot - base) : strlen(base);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, base, len); out[len] = '\0';
}
static void dir_of(const char *path, char *out, size_t outsz) {
    size_t len = strlen(path);
    while (len > 1 && (path[len-1] == '/' || path[len-1] == '\\')) len--;
    size_t last = 0; int found = 0;
    for (size_t i = 0; i < len; i++)
        if (path[i] == '/' || path[i] == '\\') { last = i; found = 1; }
    if (found) { size_t p = last ? last : 1; if (p >= outsz) p = outsz - 1;
        memcpy(out, path, p); out[p] = '\0'; }
    else { out[0] = '.'; out[1] = '\0'; }
}

/* ---- process one source file ---- */
static void wrap_process_file(const char *src, const char *explicit_out, WrapStats *st) {
    uint32_t frames = 0, rate = 0; uint16_t ch = 0;
    int16_t *pcm = decode_audio(src, &frames, &rate, &ch);
    if (!pcm) { st->failed++; return; }

    char stem[256]; wrap_stem_of(src, stem, sizeof(stem));

    char out_path[MAX_PATH];
    if (explicit_out) {
        strncpy(out_path, explicit_out, sizeof(out_path) - 1);
        out_path[sizeof(out_path) - 1] = '\0';
    } else {
        char dir[MAX_PATH]; dir_of(src, dir, sizeof(dir));
        char wrapped[MAX_PATH];
        snprintf(wrapped, sizeof(wrapped), "%s\\wrapped", dir);
#ifdef _WIN32
        CreateDirectoryA(wrapped, NULL);
#endif
        snprintf(out_path, sizeof(out_path), "%s\\%s.aif", wrapped, stem);
    }

    double secs = rate ? (double)frames / (double)rate : 0.0;
    if (write_patch(out_path, stem, pcm, frames, rate, ch) == 0) {
        printf("wrapped: %s  ->  %s  (%.2fs, %u Hz %s)\n", src, out_path, secs, rate, ch == 2 ? "stereo" : "mono");
        if (secs > SAMPLER_WARN_SECS)
            printf("  note: %.2fs is longer than the ~%.0fs seen in hardware sampler patches; "
                   "the device may trim it.\n", secs, SAMPLER_WARN_SECS);
        st->wrapped++;
    } else {
        st->failed++;
    }
    free(pcm);
}

/* ---- recursive directory walk ---- */
#ifdef _WIN32
static int has_audio_ext(const char *name) {
    size_t n = strlen(name);
    return (n > 4 && (_stricmp(name + n - 4, ".aif") == 0 || _stricmp(name + n - 4, ".wav") == 0))
        || (n > 5 && _stricmp(name + n - 5, ".aiff") == 0);
}
static void wrap_walk_dir(const char *dir, WrapStats *st) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof(pattern), "%s\\*", dir);
    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0) continue;
        if (_stricmp(fd.cFileName, "wrapped") == 0) continue;   /* skip our output */
        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) wrap_walk_dir(child, st);
        else if (has_audio_ext(fd.cFileName)) wrap_process_file(child, NULL, st);
    } while (FindNextFileA(h, &fd));
    FindClose(h);
}
#endif

static int cmd_wrap(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "Usage: %s <input.aif|.wav> [output.aif]\n", argv[0]);
        fprintf(stderr, "       %s <directory>   (recurses; writes into wrapped/)\n", argv[0]);
        return 1;
    }
    const char *input = argv[1];
    WrapStats st = {0, 0, 0};

#ifdef _WIN32
    DWORD attrs = GetFileAttributesA(input);
    if (attrs == INVALID_FILE_ATTRIBUTES) { fprintf(stderr, "not found: %s\n", input); return 1; }
    if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
        if (argc == 3) { fprintf(stderr, "output path not allowed with a directory\n"); return 1; }
        wrap_walk_dir(input, &st);
        printf("\n=== Done: %d wrapped, %d skipped, %d failed ===\n",
               st.wrapped, st.skipped, st.failed);
        return st.failed ? 1 : 0;
    }
#endif
    wrap_process_file(input, argc == 3 ? argv[2] : NULL, &st);
    return st.failed ? 1 : 0;
}

/* =========================================================================
 * ============================  mondo samples  =============================
 * (was dump-samples.c - generate patch.html's SAMPLES table from preset
 *  JSON files)
 * ========================================================================= */

typedef struct { char *key; char *json; } Entry;
static Entry *entries = NULL;
static int n_entries = 0, cap_entries = 0;

static char *xstrdup(const char *s) {
    size_t n = strlen(s) + 1;
    char *p = malloc(n);
    if (p) memcpy(p, s, n);
    return p;
}

static char *samples_slurp(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END); long sz = ftell(f); rewind(f);
    if (sz < 0) { fclose(f); return NULL; }
    char *buf = malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t rd = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[rd] = '\0';
    return buf;
}

/* Minify JSON: drop whitespace that is outside string literals. */
static void minify(const char *in, char *out) {
    int instr = 0, esc = 0;
    while (*in) {
        char c = *in++;
        if (instr) {
            *out++ = c;
            if (esc) esc = 0;
            else if (c == '\\') esc = 1;
            else if (c == '"') instr = 0;
        } else if (c == '"') {
            instr = 1; *out++ = c;
        } else if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            /* skip */
        } else {
            *out++ = c;
        }
    }
    *out = '\0';
}

/* Read a string value from minified JSON: "key":"value". The quoted key has
   quotes on both sides, so "type" won't match inside "fx_type"/"lfo_type". */
static int json_str(const char *json, const char *key, char *out, size_t outsz) {
    char pat[64];
    snprintf(pat, sizeof pat, "\"%s\":\"", key);
    const char *p = strstr(json, pat);
    if (!p) return 0;
    p += strlen(pat);
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) {
        if (*p == '\\' && p[1]) { out[i++] = *p++; if (i + 1 < outsz) out[i++] = *p++; }
        else out[i++] = *p++;
    }
    out[i] = '\0';
    return 1;
}

static int is_preset(const char *raw) {
    return strstr(raw, "synth_version") != NULL || strstr(raw, "drum_version") != NULL;
}

/* A name with no letters (e.g. "20100104_0830", an OP-1 date/time default) is
   not descriptive; the filename is preferred in that case. */
static int has_alpha(const char *s) {
    for (; *s; s++)
        if ((*s >= 'a' && *s <= 'z') || (*s >= 'A' && *s <= 'Z')) return 1;
    return 0;
}

static void samples_stem_of(const char *path, char *out, size_t outsz) {
    const char *sep = strrchr(path, '/');
#ifdef _WIN32
    const char *bs = strrchr(path, '\\'); if (!sep || (bs && bs > sep)) sep = bs;
#endif
    const char *base = sep ? sep + 1 : path;
    const char *dot = strrchr(base, '.');
    size_t len = (dot && dot > base) ? (size_t)(dot - base) : strlen(base);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, base, len); out[len] = '\0';
}

static void add_entry(const char *path) {
    char *raw = samples_slurp(path);
    if (!raw) { fprintf(stderr, "  cannot read: %s\n", path); return; }
    if (!is_preset(raw)) { free(raw); return; }

    char *min = malloc(strlen(raw) + 1);
    if (!min) { free(raw); return; }
    minify(raw, min);
    free(raw);

    char type[64] = {0}, name[256] = {0};
    if (!json_str(min, "type", type, sizeof type) || !type[0]) strcpy(type, "patch");
    /* Prefer the JSON name, but fall back to the filename when the name is
       missing or non-descriptive (no letters, e.g. a date/time default). */
    if (!json_str(min, "name", name, sizeof name) || !has_alpha(name))
        samples_stem_of(path, name, sizeof name);

    char key[400];
    snprintf(key, sizeof key, "%s - %s", type, name);   /* "<type> - <name>" (ASCII) */

    if (n_entries == cap_entries) {
        cap_entries = cap_entries ? cap_entries * 2 : 64;
        entries = realloc(entries, (size_t)cap_entries * sizeof(Entry));
        if (!entries) { fprintf(stderr, "out of memory\n"); exit(1); }
    }
    entries[n_entries].key  = xstrdup(key);
    entries[n_entries].json = min;          /* keep the minified JSON as the value */
    n_entries++;
    printf("added: %s\n", key);
}

#ifdef _WIN32
static void walk(const char *dir) {
    char pattern[MAX_PATH];
    snprintf(pattern, sizeof pattern, "%s\\*", dir);
    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        if (!strcmp(fd.cFileName, ".") || !strcmp(fd.cFileName, "..")) continue;
        char child[MAX_PATH];
        snprintf(child, sizeof child, "%s\\%s", dir, fd.cFileName);
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            walk(child);
        } else {
            size_t n = strlen(fd.cFileName);
            if (n > 5 && _stricmp(fd.cFileName + n - 5, ".json") == 0) add_entry(child);
        }
    } while (FindNextFileA(h, &fd));
    FindClose(h);
}
#endif

static int cmp_entry(const void *a, const void *b) {
    return strcmp(((const Entry *)a)->key, ((const Entry *)b)->key);
}

/* Write a JS single-quoted string, escaping backslash and single quote. */
static void put_squote(FILE *f, const char *s) {
    fputc('\'', f);
    for (; *s; s++) {
        if (*s == '\\' || *s == '\'') fputc('\\', f);
        fputc(*s, f);
    }
    fputc('\'', f);
}

static int cmd_samples(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "Usage: %s <preset.json | directory> [output.js]\n", argv[0]);
        return 1;
    }
    const char *input  = argv[1];
    const char *output = argc == 3 ? argv[2] : "samples.js";

#ifdef _WIN32
    DWORD attrs = GetFileAttributesA(input);
    if (attrs == INVALID_FILE_ATTRIBUTES) { fprintf(stderr, "not found: %s\n", input); return 1; }
    if (attrs & FILE_ATTRIBUTE_DIRECTORY) walk(input);
    else add_entry(input);
#else
    add_entry(input);
#endif

    if (n_entries == 0) { fprintf(stderr, "no preset JSON files found\n"); return 1; }

    qsort(entries, n_entries, sizeof(Entry), cmp_entry);

    FILE *f = fopen(output, "wb");
    if (!f) { perror(output); return 1; }
    fputs("const SAMPLES = {\n", f);
    for (int i = 0; i < n_entries; i++) {
        fputs("  ", f);
        put_squote(f, entries[i].key);
        fputs(": ", f);
        fputs(entries[i].json, f);
        fputs(",\n", f);
    }
    fputs("};\n", f);
    fclose(f);

    printf("\nWrote %s (%d presets)\n", output, n_entries);
    return 0;
}

/* =========================================================================
 * ============================  dispatcher  ================================
 * ========================================================================= */

static void print_usage(const char *prog) {
    fprintf(stderr,
        "Usage: %s <subcommand> [args...]\n\n"
        "Subcommands:\n"
        "  dump      <file.aif | directory>\n"
        "  build     [zero|max] <patch.json> [output.aif] | <directory> | explore [-dest <synth|envelope|fx|mix>] [-param <N>]\n"
        "  test      <file.aif> [file2.aif ...]\n"
        "  diff      <file_a> <file_b>\n"
        "  explore   <file.aif> [--read-bytes [N]] [--parse-chunks] [--dump-chunk <ID>] [--show-json] [--decode-fver] [--decode-comm] [--analyze-ssnd]\n"
        "  summarize\n"
        "  rename    <patch.json [patch2.json ...] | directory>\n"
        "  sort      <patch.aif | directory>\n"
        "  tag       <patch.json [patch2.json ...] | directory>\n"
        "  wrap      <input.aif|.wav> [output.aif] | <directory>\n"
        "  samples   <preset.json | directory> [output.js]\n",
        prog);
}

int main(int argc, char *argv[]) {
    if (argc < 2) { print_usage(argv[0]); return 1; }

    const char *sub = argv[1];
    char progname[64];
    snprintf(progname, sizeof(progname), "mondo %s", sub);
    char *saved = argv[1];
    argv[1] = progname;  /* so each cmd_* keeps working argv[0]-style usage strings */

    int ret;
    if      (!strcmp(sub, "dump"))      ret = cmd_dump(argc - 1, argv + 1);
    else if (!strcmp(sub, "build"))     ret = cmd_build(argc - 1, argv + 1);
    else if (!strcmp(sub, "test"))      ret = cmd_test(argc - 1, argv + 1);
    else if (!strcmp(sub, "diff"))      ret = cmd_diff(argc - 1, argv + 1);
    else if (!strcmp(sub, "explore"))   ret = cmd_explore(argc - 1, argv + 1);
    else if (!strcmp(sub, "summarize")) ret = cmd_summarize(argc - 1, argv + 1);
    else if (!strcmp(sub, "rename"))    ret = cmd_rename(argc - 1, argv + 1);
    else if (!strcmp(sub, "sort"))      ret = cmd_sort(argc - 1, argv + 1);
    else if (!strcmp(sub, "tag"))       ret = cmd_tag(argc - 1, argv + 1);
    else if (!strcmp(sub, "wrap"))      ret = cmd_wrap(argc - 1, argv + 1);
    else if (!strcmp(sub, "samples"))   ret = cmd_samples(argc - 1, argv + 1);
    else { argv[1] = saved; print_usage(argv[0]); return 1; }

    argv[1] = saved;
    return ret;
}
