/*
 * dump-samples.c - generate patch.html's SAMPLES table from preset JSON files.
 *
 * Writes a file (default samples.js) containing one JavaScript variable:
 *
 *   const SAMPLES = {
 *     'cluster - cluster pad': {"adsr":[...],...,"type":"cluster"},
 *     ...
 *   };
 *
 * Each property key is "<type> - <name>" (read from the preset JSON), and the
 * value is that preset's JSON, minified, matching the hand-built SAMPLES
 * object in patch.html. Output is ASCII only.
 *
 * A file or directory may be given. Directories are walked recursively for
 * preset .json files, identified by a "synth_version" or "drum_version" key.
 *
 * Build: cl dump-samples.c /Fe:dump-samples.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: dump-samples <preset.json | directory> [output.js]
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#endif

typedef struct { char *key; char *json; } Entry;
static Entry *entries = NULL;
static int n_entries = 0, cap_entries = 0;

static char *xstrdup(const char *s) {
    size_t n = strlen(s) + 1;
    char *p = malloc(n);
    if (p) memcpy(p, s, n);
    return p;
}

static char *slurp(const char *path) {
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

static void stem_of(const char *path, char *out, size_t outsz) {
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
    char *raw = slurp(path);
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
        stem_of(path, name, sizeof name);

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

int main(int argc, char *argv[]) {
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
