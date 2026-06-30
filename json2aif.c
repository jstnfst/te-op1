/*
 * json2aif.c - create an OP-1 Field AIFF-C patch file from a JSON file
 *
 * Usage:
 *   json2aif <patch.json> [output.aif]           - pass-through
 *   json2aif zero <patch.json> [output.aif]      - zero knobs/fx_params/lfo_params
 *   json2aif max  <patch.json> [output.aif]      - set all three arrays to 32767
 *   json2aif explore [-dest <synth|envelope|fx|mix>] [-param <N>]
 *                                                - generate all 810x2 boundary patches
 *
 * Build: cl json2aif.c /Fe:json2aif.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <time.h>
#include <windows.h>   /* CreateDirectoryA */

/* ---- tunables ------------------------------------------------------------ */

#define SAMPLE_RATE          22050
#define NUM_CHANNELS         1
#define BIT_DEPTH            16
#define NUM_FRAMES           28896  /* matches OP-1 Field hardware export frame count */
#define APPL_DATA_SIZE_SYNTH 1028   /* oracle standard: 4-byte sig + 1024-byte JSON area */
#define APPL_DATA_SIZE_DBOX  4100   /* dbox/drum only: 4-byte sig + 4096-byte JSON area */
#define APPL_JSON_MAX        (APPL_DATA_SIZE_DBOX - 4)  /* max buffer for JSON building */

#define SAMPLER_FADE_MIN          0
#define SAMPLER_FADE_MAX          644245094  /* oracle sampler-max-0003 */
#define SAMPLER_BASE_FREQ_MIN     7902.132000f  /* oracle min-0000, fadetune-min */
#define SAMPLER_BASE_FREQ_MAX     24.499715f    /* oracle fadetune-max, max-0002 */

/* ---- binary write helpers ------------------------------------------------ */

static void w16(uint8_t *p, uint16_t v) {
    p[0] = (v >> 8) & 0xFF; p[1] = v & 0xFF;
}
static void w32(uint8_t *p, uint32_t v) {
    p[0] = (v >> 24) & 0xFF; p[1] = (v >> 16) & 0xFF;
    p[2] = (v >>  8) & 0xFF; p[3] =  v         & 0xFF;
}

static void write_80bit_extended(uint8_t *p, uint32_t hz) {
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

/* ---- output path helpers ------------------------------------------------- */

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

/* ---- JSON helpers -------------------------------------------------------- */

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

/* ---- chunk header -------------------------------------------------------- */

static uint32_t write_chunk_header(uint8_t *buf, uint32_t pos,
                                   const char *id, uint32_t size) {
    memcpy(buf + pos, id, 4); w32(buf + pos + 4, size);
    return pos + 8;
}

/* ---- sine wave generator ------------------------------------------------- */

static void gen_sine_wave(float freq_hz, uint32_t sample_rate,
                          uint32_t num_frames, int16_t *buf) {
    uint32_t i;
    for (i = 0; i < num_frames; i++)
        buf[i] = (int16_t)(29491.0f * sinf(2.0f * 3.14159265f * freq_hz * (float)i / (float)sample_rate));
}

/* ---- core AIF writer ----------------------------------------------------- */

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
    w32(buf+pos, form_body);  pos+=4;
    memcpy(buf+pos,"AIFC",4); pos+=4;

    pos = write_chunk_header(buf, pos, "FVER", 4);
    w32(buf+pos, 0xA2805140); pos+=4;

    pos = write_chunk_header(buf, pos, "COMM", comm_size);
    w16(buf+pos, aud_channels); pos+=2;
    w32(buf+pos, audio_frames); pos+=4;
    w16(buf+pos, BIT_DEPTH);    pos+=2;
    write_80bit_extended(buf+pos, aud_rate); pos+=10;
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
    w32(buf+pos,0); pos+=4;
    w32(buf+pos,0); pos+=4;
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

/* ---- WAV sidecar reader -------------------------------------------------- */

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

/* ---- explore helpers ----------------------------------------------------- */

static void make_dirs(const char *path) {
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

/* ---- run_explore --------------------------------------------------------- */

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
                make_dirs(aif_dir);
                make_dirs(json_dir);

                for (fi = 0; FX_TYPES[fi]; fi++) {
                    const char *fx = FX_TYPES[fi];
                    char slug_s[5], slug_f[5], slug_l[5], slug[14];
                    char json_buf[APPL_JSON_MAX];
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

                    if (jlen <= 0 || jlen >= APPL_JSON_MAX) {
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

typedef struct { int processed; int failed; } WalkStats;

/*
 * Process one JSON file → AIF.
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

    char scratch[3][APPL_JSON_MAX + 2];

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

/* =========================================================================
 * MAIN
 * ========================================================================= */

int main(int argc, char *argv[]) {
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
            walk_dir(argv[1], &stats);
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
