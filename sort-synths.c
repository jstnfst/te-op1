/*
 * sort-synths.c - organize OP-1 preset files by synth engine type
 *
 * Reads each .aif preset, extracts the "type" field from its embedded op-1
 * metadata, and moves the .aif into:
 *
 *   <parent-of-input>/synth/<type>/<filename>.aif
 *
 * Only the .aif preset is moved; any .json/.wav sidecars are left in place.
 * The synth/ directory is a sibling of the input directory.
 * Skips any directory named "synth" during recursive walks.
 * Never overwrites an existing destination file.
 *
 * Build: cl sort-synths.c /Fe:sort-synths.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: sort-synths <patch.aif>
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

/* ---- move a single file -------------------------------------------------- */

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

/* ---- process one .aif preset --------------------------------------------- */

static void process_file(const char *aif_path, const char *synth_base, Stats *st) {
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
    make_dirs(dest_dir);

    /* keep the original filename and extension (.aif / .aiff) */
    char base[256];
    basename_no_ext(aif_path, base, sizeof(base));
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
            if ((len > 4 && _stricmp(fd.cFileName + len - 4, ".aif") == 0) ||
                (len > 5 && _stricmp(fd.cFileName + len - 5, ".aiff") == 0))
                process_file(child, synth_base, st);
        }
    } while (FindNextFileA(h, &fd));

    FindClose(h);
}

/* ---- main ---------------------------------------------------------------- */

int main(int argc, char *argv[]) {
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
