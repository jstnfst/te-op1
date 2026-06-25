/*
 * sort-synths.c — organize OP-1 patch files by synth engine type
 *
 * Reads each .json patch, extracts the "type" field, and moves both
 * the .json and its .aif sidecar into:
 *
 *   <parent-of-input>/synth/<type>/<filename>.{json,aif}
 *
 * The synth/ directory is a sibling of the input directory.
 * Skips any directory named "synth" during recursive walks.
 * Never overwrites an existing destination file.
 *
 * Build: cl sort-synths.c /Fe:sort-synths.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: sort-synths <patch.json>
 *        sort-synths <directory>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#endif

typedef struct { int moved; int skipped; int failed; } Stats;

/* ---- helpers ------------------------------------------------------------- */

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

static void basename_no_ext(const char *path, char *out, size_t outsz) {
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

static void make_dirs(const char *path) {
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

/* Extract the value of "type":"..." from a JSON string. */
static int get_synth_type(const char *json, char *out, size_t outsz) {
    const char *p = strstr(json, "\"type\":");
    if (!p) return 0;
    p += 7;
    while (*p == ' ') p++;
    if (*p != '"') return 0;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < outsz) out[i++] = *p++;
    out[i] = '\0';
    return i > 0;
}

/* ---- move a single file -------------------------------------------------- */

/* Returns 0=moved, 1=failed, 2=skipped(exists). */
static int move_one(const char *src, const char *dst) {
    if (GetFileAttributesA(src) == INVALID_FILE_ATTRIBUTES)
        return 2;  /* source doesn't exist — nothing to move */

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

/* ---- process one .json file ---------------------------------------------- */

static void process_file(const char *json_path, const char *synth_base, Stats *st) {
    /* read JSON */
    FILE *f = fopen(json_path, "rb");
    if (!f) { perror(json_path); st->failed++; return; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f); rewind(f);
    char *buf = malloc((size_t)sz + 1);
    if (!buf) { fprintf(stderr, "out of memory\n"); fclose(f); st->failed++; return; }
    fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[sz] = '\0';

    char synth_type[64];
    if (!get_synth_type(buf, synth_type, sizeof(synth_type))) {
        fprintf(stderr, "no \"type\" field: %s\n", json_path);
        free(buf); st->failed++; return;
    }
    free(buf);

    /* build destination directory: synth_base\<type>\ */
    char dest_dir[MAX_PATH];
    snprintf(dest_dir, sizeof(dest_dir), "%s\\%s", synth_base, synth_type);
    make_dirs(dest_dir);

    /* derive basename (no ext) */
    char base[256];
    basename_no_ext(json_path, base, sizeof(base));

    /* build source paths for .json and .aif */
    const char *dot = strrchr(json_path, '.');
    const char *sep = strrchr(json_path, '\\');
    char aif_src[MAX_PATH];
    if (dot && (!sep || dot > sep)) {
        size_t prefix = (size_t)(dot - json_path);
        memcpy(aif_src, json_path, prefix);
        strcpy(aif_src + prefix, ".aif");
    } else {
        snprintf(aif_src, sizeof(aif_src), "%s.aif", json_path);
    }

    /* destination paths */
    char json_dst[MAX_PATH], aif_dst[MAX_PATH];
    snprintf(json_dst, sizeof(json_dst), "%s\\%s.json", dest_dir, base);
    snprintf(aif_dst,  sizeof(aif_dst),  "%s\\%s.aif",  dest_dir, base);

    printf("%s  ->  %s\\\n", base, dest_dir);

    int r_json = move_one(json_path, json_dst);
    int r_aif  = move_one(aif_src,   aif_dst);

    if (r_json == 1 || r_aif == 1) st->failed++;
    else if (r_json == 0 || r_aif == 0) st->moved++;
    else st->skipped++;
}

/* ---- recursive directory walker ------------------------------------------ */

static void walk_dir(const char *dir, const char *synth_base, Stats *st) {
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
            walk_dir(child, synth_base, st);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 5 && _stricmp(fd.cFileName + len - 5, ".json") == 0)
                process_file(child, synth_base, st);
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}

/* ---- main ---------------------------------------------------------------- */

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <patch.json | directory>\n", argv[0]);
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

    Stats st = {0, 0, 0};

    if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
        walk_dir(input, synth_base, &st);
        printf("\n=== Done: %d moved, %d skipped, %d failed ===\n",
               st.moved, st.skipped, st.failed);
    } else {
        process_file(input, synth_base, &st);
    }

    return st.failed ? 1 : 0;
}
