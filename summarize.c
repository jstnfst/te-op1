/*
 * summarize.c — summarize all OP-1 Field presets in presets/*.json
 *
 * Build: cl summarize.c cJSON.c /Fe:summarize.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: summarize.exe   (run from project root)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <io.h>        /* _findfirst, _findnext */
#include <windows.h>
#include "cJSON.h"

/* ---- constants ---- */

#define MAX_PATCHES 512
#define MAX_TYPES    64
#define MAX_PARAMS    8
#define MAX_NAME     64
#define MAX_LABEL    48

/* ---- ANSI colors ---- */

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

static char *read_file(const char *path) {
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
static int get_labels(const char *group, const char *type,
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
    int n_labels  = get_labels(group, type, labels);
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

/* ---- main ---- */

int main(void) {
    char *raw;
    int i, j;
    static char stypes[MAX_TYPES][MAX_NAME];
    static char ftypes[MAX_TYPES][MAX_NAME];
    static char ltypes[MAX_TYPES][MAX_NAME];
    const int *arrs[MAX_PATCHES];
    int ns, nf, nl;

    enable_ansi();

    if ((raw = read_file("op1-params.json")) != NULL)    { g_params = cJSON_Parse(raw); free(raw); }
    if ((raw = read_file("op1-params-ok.json")) != NULL) { g_ok     = cJSON_Parse(raw); free(raw); }

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
            if ((raw = read_file(path)) == NULL) continue;
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
        for (i = 0; i < ns; i++) if (get_labels("synth", stypes[i], lb) < 0) {
            if (!any++) printf(COL_RED "=== Missing from op1-params.json -- add these ===" COL_RST "\n");
            printf(COL_RED "  \"synth.%s\": []" COL_RST "\n", stypes[i]);
        }
        for (i = 0; i < nf; i++) if (get_labels("fx", ftypes[i], lb) < 0) {
            if (!any++) printf(COL_RED "=== Missing from op1-params.json -- add these ===" COL_RST "\n");
            printf(COL_RED "  \"fx.%s\": []" COL_RST "\n", ftypes[i]);
        }
        for (i = 0; i < nl; i++) if (get_labels("lfo", ltypes[i], lb) < 0) {
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
