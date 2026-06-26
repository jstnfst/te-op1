/*
 * wrap-sampler.c — wrap a raw audio file into an OP-1 Field "sampler" patch
 *
 * Many audio files are just sound (a plain AIFF or WAV) with no OP-1 patch
 * metadata, so op1dump reports "no 'op-1' APPL chunk found" and they won't
 * load as patches. This tool reads such a file, converts it to the OP-1
 * sampler audio format, and writes a real .aif patch with an "op-1" APPL
 * chunk containing a default sampler JSON — the same AIFF-C 'sowt' container
 * json2aif produces.
 *
 * Reads:  AIFF / AIFF-C (16-bit, big-endian or 'sowt' little-endian) and
 *         WAV (PCM 16- or 24-bit, little-endian), mono or stereo.
 * Writes: AIFF-C 'sowt', 16-bit, source sample rate AND channel count
 *         (no resampling, no downmix) + op-1 APPL sampler JSON. Mono stays
 *         mono, stereo stays stereo ("stereo":true); 24-bit is reduced to
 *         16-bit (the OP-1 sampler format).
 *
 * Build: cl wrap-sampler.c /Fe:wrap-sampler.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: wrap-sampler <input.aif|.wav> [output.aif]
 *        wrap-sampler <directory>          (recurses; writes into wrapped/)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#ifdef _WIN32
#include <windows.h>
#endif

#define BIT_DEPTH          16
#define DEFAULT_BASE_FREQ  261.625550   /* Middle C — OP-1 sampler default root */
#define APPL_DATA_SIZE     1028         /* 4-byte "op-1" sig + 1024-byte JSON area */
#define SAMPLER_WARN_SECS  6.0          /* hardware sampler patches observed at ~6 s */

typedef struct { int wrapped; int skipped; int failed; } Stats;

/* ---- byte writers (AIFF structure is big-endian) ------------------------- */
static void w16(uint8_t *p, uint16_t v) { p[0] = (v >> 8) & 0xFF; p[1] = v & 0xFF; }
static void w32(uint8_t *p, uint32_t v) {
    p[0] = (v >> 24) & 0xFF; p[1] = (v >> 16) & 0xFF;
    p[2] = (v >> 8) & 0xFF;  p[3] = v & 0xFF;
}
static uint32_t put_chunk(uint8_t *buf, uint32_t pos, const char *id, uint32_t sz) {
    memcpy(buf + pos, id, 4); w32(buf + pos + 4, sz); return pos + 8;
}
static void write_80bit_extended(uint8_t *p, uint32_t hz) {
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

/* ---- byte readers -------------------------------------------------------- */
static uint16_t r16le(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static uint32_t r32le(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t r16be(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }
static uint32_t r32be(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}
/* AIFF 80-bit IEEE extended → integer Hz (no float / math.h needed) */
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

/* ---- read whole file ----------------------------------------------------- */
static uint8_t *slurp(const char *path, long *out_sz) {
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

/* ---- decode source audio → mono int16 ------------------------------------ */
/* Returns malloc'd mono int16 PCM (caller frees); sets *frames and *rate. */
static int16_t *decode_audio(const char *path, uint32_t *frames, uint32_t *rate, uint16_t *out_ch) {
    long fsize = 0;
    uint8_t *buf = slurp(path, &fsize);
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

/* ---- build the sampler patch JSON ---------------------------------------- */
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

/* ---- write the OP-1 sampler .aif (AIFF-C 'sowt', mono, 16-bit) ------------ */
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
    w32(buf + pos, form_body);    pos += 4;
    memcpy(buf + pos, "AIFC", 4); pos += 4;

    pos = put_chunk(buf, pos, "FVER", 4);
    w32(buf + pos, 0xA2805140); pos += 4;

    pos = put_chunk(buf, pos, "COMM", comm_size);
    w16(buf + pos, channels);   pos += 2;            /* 1 = mono, 2 = stereo */
    w32(buf + pos, frames);     pos += 4;
    w16(buf + pos, BIT_DEPTH);  pos += 2;
    write_80bit_extended(buf + pos, rate); pos += 10;
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
    w32(buf + pos, 0); pos += 4;             /* offset */
    w32(buf + pos, 0); pos += 4;             /* blockSize */
    memcpy(buf + pos, pcm, audio_bytes);     /* 'sowt' = little-endian (native) */
    pos += audio_bytes;

    FILE *f = fopen(out_path, "wb");
    if (!f) { perror(out_path); free(buf); return 1; }
    int ok = (fwrite(buf, 1, total, f) == total);
    fclose(f); free(buf);
    if (!ok) { fprintf(stderr, "  write error: %s\n", out_path); return 1; }
    return 0;
}

/* ---- path helpers -------------------------------------------------------- */
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

/* ---- process one source file --------------------------------------------- */
static void process_file(const char *src, const char *explicit_out, Stats *st) {
    uint32_t frames = 0, rate = 0; uint16_t ch = 0;
    int16_t *pcm = decode_audio(src, &frames, &rate, &ch);
    if (!pcm) { st->failed++; return; }

    char stem[256]; stem_of(src, stem, sizeof(stem));

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

/* ---- recursive directory walk -------------------------------------------- */
#ifdef _WIN32
static int has_audio_ext(const char *name) {
    size_t n = strlen(name);
    return (n > 4 && (_stricmp(name + n - 4, ".aif") == 0 || _stricmp(name + n - 4, ".wav") == 0))
        || (n > 5 && _stricmp(name + n - 5, ".aiff") == 0);
}
static void walk_dir(const char *dir, Stats *st) {
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
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) walk_dir(child, st);
        else if (has_audio_ext(fd.cFileName)) process_file(child, NULL, st);
    } while (FindNextFileA(h, &fd));
    FindClose(h);
}
#endif

int main(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "Usage: %s <input.aif|.wav> [output.aif]\n", argv[0]);
        fprintf(stderr, "       %s <directory>   (recurses; writes into wrapped/)\n", argv[0]);
        return 1;
    }
    const char *input = argv[1];
    Stats st = {0, 0, 0};

#ifdef _WIN32
    DWORD attrs = GetFileAttributesA(input);
    if (attrs == INVALID_FILE_ATTRIBUTES) { fprintf(stderr, "not found: %s\n", input); return 1; }
    if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
        if (argc == 3) { fprintf(stderr, "output path not allowed with a directory\n"); return 1; }
        walk_dir(input, &st);
        printf("\n=== Done: %d wrapped, %d skipped, %d failed ===\n",
               st.wrapped, st.skipped, st.failed);
        return st.failed ? 1 : 0;
    }
#endif
    process_file(input, argc == 3 ? argv[2] : NULL, &st);
    return st.failed ? 1 : 0;
}
