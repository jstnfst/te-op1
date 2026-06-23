/*
 * op1dump.c — dump OP-1 Field synth metadata from an AIFF file
 *
 * Reads knob/param labels from op1-params.json in the current directory.
 * To add a new synth type, edit op1-params.json — no recompile needed.
 *
 * Build: cl op1dump.c /Fe:op1dump.exe /D_CRT_SECURE_NO_WARNINGS
 * Usage: op1dump <file.aif>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
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
 * MAIN
 * ========================================================================= */

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <file.aif>\n", argv[0]);
        return 1;
    }

    load_params_file();

    /* --- read file --- */
    FILE *f = fopen(argv[1], "rb");
    if (!f) { perror(argv[1]); return 1; }
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);

    uint8_t *buf = malloc(fsize);
    if (!buf) { fprintf(stderr, "out of memory\n"); return 1; }
    if (fread(buf, 1, fsize, f) != (size_t)fsize) {
        fprintf(stderr, "read error\n"); return 1;
    }
    fclose(f);

    /* --- validate AIFF-C --- */
    if (fsize < 12 ||
        memcmp(buf,    "FORM", 4) != 0 ||
        (memcmp(buf+8, "AIFF", 4) != 0 &&
         memcmp(buf+8, "AIFC", 4) != 0)) {
        fprintf(stderr, "Not a valid AIFF/AIFF-C file\n");
        free(buf); return 1;
    }

    char form_type[5] = {0};
    memcpy(form_type, buf + 8, 4);
    printf("File      : %s\n", argv[1]);
    printf("Container : FORM/%s  (%ld bytes)\n\n", form_type, fsize);

    /* --- walk IFF chunks --- */
    const char *json_str = NULL;
    char json_buf[2048] = {0};

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

        if (strcmp(id, "SSND") == 0)
            printf("Sample    : %u bytes of audio data\n", size);

        pos = data + size + (size & 1);
    }

    if (!json_str) {
        fprintf(stderr, "No 'op-1' APPL chunk found\n");
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
        static const char *adsr_labels[] = {
            "Attack", "Decay", "Sustain", "Release",
            "Attack2", "Decay2", "Sustain2", "Release2"
        };
        printf("  Envelope:\n");
        for (int i = 0; i < nadsr; i++)
            printf("    %-16s : %6d  (%.3f)\n",
                   adsr_labels[i], adsr[i], op1_norm(adsr[i]));
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
    const char *input = argv[1];
    size_t inlen = strlen(input);
    char *json_path = malloc(inlen + 6);
    if (!json_path) { fprintf(stderr, "out of memory\n"); free(buf); return 1; }
    memcpy(json_path, input, inlen);
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
    free(g_params_json);
    free(buf);
    return 0;
}
