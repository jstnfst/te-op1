/*
 * diff-patches.c — diff two OP-1 Field patch JSON files
 *
 * Build: cl diff-patches.c cJSON.c /Fe:diff-patches.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: diff-patches.exe <file_a> <file_b>
 *   Files may be .json or .aif (looks for .json sidecar if .aif given)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"

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

static char *read_file(const char *path) {
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

int main(int argc, char *argv[]) {
    char *pathA, *pathB, *rawA, *rawB;
    cJSON *ja, *jb, *item;
    int diffs = 0;

    if (argc != 3) {
        fprintf(stderr, "Usage: %s <file_a> <file_b>\n", argv[0]);
        return 1;
    }

    pathA = resolve_json_path(argv[1]);
    pathB = resolve_json_path(argv[2]);

    rawA = read_file(pathA);
    rawB = read_file(pathB);
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
