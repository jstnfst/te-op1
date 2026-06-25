/*
 * op1dump.c — dump OP-1 Field synth metadata from an AIFF file
 *
 * Reads knob/param labels from op1-params.json in the current directory.
 * To add a new synth type, edit op1-params.json — no recompile needed.
 *
 * Build: cl op1dump.c /Fe:op1dump.exe /D_CRT_SECURE_NO_WARNINGS
 * Usage: op1dump <file.aif>
 *        op1dump <directory>   (recursively dumps all .aif files)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#ifdef _WIN32
#include <windows.h>
#endif
#include "op1_aif.h"

#define PARAMS_FILE  "op1-params.json"
#define MAX_PARAMS   8
#define MAX_LABEL    48   /* max chars per param name */

/* =========================================================================
 * MINIMAL JSON EXTRACTORS
 * ========================================================================= */

static const char *json_find_value(const char *json, const char *key) {
    char search[128];
    snprintf(search, sizeof(search), "\"%s\":", key);
    const char *p = strstr(json, search);
    if (!p) return NULL;
    return p + strlen(search);
}

static int json_get_string(const char *json, const char *key,
                           char *out, size_t outsz) {
    const char *p = json_find_value(json, key);
    if (!p || *p != '"') return 0;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return 1;
}

static int json_get_int(const char *json, const char *key, int *out) {
    const char *p = json_find_value(json, key);
    if (!p) return 0;
    return sscanf(p, "%d", out) == 1;
}

static int json_get_double(const char *json, const char *key, double *out) {
    const char *p = json_find_value(json, key);
    if (!p) return 0;
    return sscanf(p, "%lf", out) == 1;
}

static int json_get_bool(const char *json, const char *key, int *out) {
    const char *p = json_find_value(json, key);
    if (!p) return 0;
    if (strncmp(p, "true",  4) == 0) { *out = 1; return 1; }
    if (strncmp(p, "false", 5) == 0) { *out = 0; return 1; }
    return 0;
}

static int json_get_int_array(const char *json, const char *key,
                              int *arr, int maxlen) {
    const char *p = json_find_value(json, key);
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

/* =========================================================================
 * PARAM FILE  (op1-params.json)
 *
 * Format: flat JSON object with keys like "synth.cluster", "fx.mother", etc.
 * Values are string arrays with one entry per knob/param slot.
 * Empty arrays or missing keys mean the type is not yet mapped.
 * ========================================================================= */

static char *g_params_json = NULL;  /* loaded once, kept for lifetime */

static void load_params_file(void) {
    FILE *f = fopen(PARAMS_FILE, "rb");
    if (!f) return;  /* not found — all types will show as unmapped */
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
static int get_labels(const char *group, const char *type,
                      char out[][MAX_LABEL]) {
    if (!g_params_json) return 0;
    char key[128];
    snprintf(key, sizeof(key), "%s.%s", group, type);
    const char *p = json_find_value(g_params_json, key);
    if (!p) return 0;
    return json_get_string_array(p, out, MAX_PARAMS);
}

/* =========================================================================
 * DISPLAY HELPERS
 * ========================================================================= */

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

/* =========================================================================
 * WAV SIDECAR WRITER
 * ========================================================================= */

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

/* =========================================================================
 * FILE PROCESSOR
 * ========================================================================= */

typedef struct { int processed; int failed; } WalkStats;

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
    const uint8_t  *ssnd_audio       = NULL;
    uint32_t        ssnd_audio_bytes = 0;

    uint32_t pos = 12;
    while (pos + 8 <= (uint32_t)fsize) {
        char id[5] = {0};
        memcpy(id, buf + pos, 4);
        uint32_t size = u32be(buf + pos + 4);
        uint32_t data = pos + 8;

        if (strcmp(id, "COMM") == 0 && size >= 26) {
            uint16_t ch  = u16be(buf + data);
            uint32_t fr  = u32be(buf + data + 2);
            uint16_t bd  = u16be(buf + data + 6);
            uint32_t hz  = read_80bit_ext(buf + data + 8);
            char comp[5] = {0};
            memcpy(comp, buf + data + 18, 4);
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

    json_get_string(json_str, "type",     synth_type, sizeof(synth_type));
    json_get_string(json_str, "fx_type",  fx_type,    sizeof(fx_type));
    json_get_string(json_str, "lfo_type", lfo_type,   sizeof(lfo_type));

    printf("\n=== OP-1 Field Synth Metadata ===\n\n");

    char sval[64];
    if (json_get_string(json_str, "name",          sval, sizeof(sval))) printf("  Name          : %s\n", sval);
    printf(                                                               "  Type          : %s\n", synth_type);
    if (json_get_int   (json_str, "synth_version", &ival))               printf("  Synth version : %d\n", ival);
    else if (json_get_int(json_str, "drum_version", &ival))              printf("  Drum version  : %d\n", ival);
    if (json_get_int   (json_str, "octave",        &ival))               printf("  Octave        : %d\n", ival);
    if (json_get_double(json_str, "mtime",         &dval))               printf("  mtime         : %.0f\n", dval);

    /* synth knobs */
    int knobs[MAX_PARAMS] = {0};
    int nknobs = json_get_int_array(json_str, "knobs", knobs, MAX_PARAMS);
    char knob_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nklabels = get_labels("synth", synth_type, knob_labels);
    printf("\n");
    if (nknobs > 0)
        print_params("Synth knobs", synth_type, knobs, nknobs, knob_labels, nklabels);

    /* envelope */
    int adsr[MAX_PARAMS] = {0};
    int nadsr = json_get_int_array(json_str, "adsr", adsr, MAX_PARAMS);
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
    json_get_bool(json_str, "fx_active", &fx_active);
    int fx[MAX_PARAMS] = {0};
    int nfx = json_get_int_array(json_str, "fx_params", fx, MAX_PARAMS);
    char fx_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nflabels = get_labels("fx", fx_type, fx_labels);
    printf("\n");
    printf("  FX (%s)  active: %s\n", fx_type, fx_active ? "yes" : "no");
    if (nfx > 0)
        print_params("FX params", fx_type, fx, nfx, fx_labels, nflabels);

    /* lfo */
    int lfo_active = 0;
    json_get_bool(json_str, "lfo_active", &lfo_active);
    int lfo[MAX_PARAMS] = {0};
    int nlfo = json_get_int_array(json_str, "lfo_params", lfo, MAX_PARAMS);
    char lfo_labels[MAX_PARAMS][MAX_LABEL] = {{0}};
    int  nllabels = get_labels("lfo", lfo_type, lfo_labels);
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
            if (write_wav(wav_path, ssnd_audio, ssnd_audio_bytes,
                          comm_channels, comm_rate, comm_bitdepth) == 0)
                printf("Wrote %s\n", wav_path);
            free(wav_path);
        }
    }

    free(buf);
    return 0;
}

/* =========================================================================
 * DIRECTORY WALKER
 * ========================================================================= */

#ifdef _WIN32
static void walk_dir(const char *dir, WalkStats *stats) {
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
            walk_dir(child, stats);
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

/* =========================================================================
 * MAIN
 * ========================================================================= */

int main(int argc, char *argv[]) {
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
        walk_dir(argv[1], &stats);
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
