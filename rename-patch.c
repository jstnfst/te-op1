/*
 * rename-patch.c — replace the "name" field in an OP-1 JSON patch
 *                  with the patch file's own filename (no extension).
 *
 * Build: cl rename-patch.c /Fe:rename-patch.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: rename-patch <patch.json> [patch2.json ...]
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#endif

/* Extract the basename without extension from a file path. */
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
    basename_no_ext(path, new_name, sizeof(new_name));

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
typedef struct { int processed; int failed; } WalkStats;

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

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <patch.json [patch2.json ...] | directory>\n", argv[0]);
        return 1;
    }

#ifdef _WIN32
    if (argc == 2) {
        DWORD attrs = GetFileAttributesA(argv[1]);
        if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            WalkStats stats = {0, 0};
            walk_dir(argv[1], &stats);
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
