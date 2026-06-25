/*
 * tag-patch.c — generate musical descriptor tags from an OP-1 Field JSON patch
 *
 * Reads each .json patch, interprets parameter values across synth engine,
 * envelope, FX, and LFO domains, and outputs a comma-separated tag list.
 * Also writes a .tags sidecar file alongside each .json for easy grepping.
 *
 * Build: cl tag-patch.c /Fe:tag-patch.exe /W3 /D_CRT_SECURE_NO_WARNINGS
 * Usage: tag-patch <patch.json> [patch2.json ...]
 *        tag-patch <directory>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#include <windows.h>
#endif

/* =========================================================================
 * JSON EXTRACTORS (copied from op1dump.c)
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

/* =========================================================================
 * TAG SET
 * ========================================================================= */

#define MAX_TAGS      48
#define MAX_TAG_LEN   32

typedef struct {
    char tags[MAX_TAGS][MAX_TAG_LEN];
    int  count;
} TagSet;

static void add_tag(TagSet *ts, const char *tag) {
    for (int i = 0; i < ts->count; i++)
        if (strcmp(ts->tags[i], tag) == 0) return;  /* deduplicate */
    if (ts->count >= MAX_TAGS) return;
    strncpy(ts->tags[ts->count], tag, MAX_TAG_LEN - 1);
    ts->tags[ts->count][MAX_TAG_LEN - 1] = '\0';
    ts->count++;
}

static int has_tag(const TagSet *ts, const char *tag) {
    for (int i = 0; i < ts->count; i++)
        if (strcmp(ts->tags[i], tag) == 0) return 1;
    return 0;
}

/* =========================================================================
 * NORMALIZERS
 * ========================================================================= */

/* Unipolar: [0, 32767] -> [0.0, 1.0] */
static float norm(int v) {
    float f = (float)v / 32767.0f;
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* Bipolar: [-32767, 32767] -> [0.0, 1.0] */
static float norm_bi(int v) {
    float f = (float)(v + 32767) / 65534.0f;
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* Normalize within a known [lo, hi] range */
static float norm_range(int v, int lo, int hi) {
    if (hi == lo) return 0.0f;
    float f = (float)(v - lo) / (float)(hi - lo);
    return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
}

/* =========================================================================
 * ENVELOPE TAGGER
 * ========================================================================= */

static void tag_envelope(TagSet *ts, const int adsr[8]) {
    float attack     = norm(adsr[0]);
    float sustain    = norm(adsr[2]);
    float release    = norm(adsr[3]);
    float portamento = norm(adsr[5]);

    /* Attack */
    if (attack < 0.02f)       { add_tag(ts, "percussive"); add_tag(ts, "immediate"); }
    else if (attack < 0.15f)    add_tag(ts, "snappy");
    else if (attack >= 0.50f && attack < 0.75f) add_tag(ts, "slow attack");
    else if (attack >= 0.75f)  { add_tag(ts, "slow attack"); add_tag(ts, "swelling"); }

    /* Sustain */
    if (sustain > 0.65f && attack < 0.15f) add_tag(ts, "pad");
    if (sustain > 0.65f)  add_tag(ts, "sustained");
    else if (sustain < 0.20f) add_tag(ts, "decaying");

    /* Release */
    if (release > 0.55f)      add_tag(ts, "lingering");
    else if (release < 0.10f) add_tag(ts, "tight");

    /* Portamento */
    if (portamento > 0.30f) { add_tag(ts, "legato"); add_tag(ts, "gliding"); }
    else if (portamento > 0.10f) add_tag(ts, "slight glide");
}

/* =========================================================================
 * ENGINE TAGGERS
 * ========================================================================= */

static void tag_cluster(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Number, k[1]=Wave Env, k[2]=Spread, k[3]=Unitor */
    float wave_env = norm(k[1]);
    float spread   = norm_range(k[2], 512, 24064);

    if (wave_env > 0.65f) { add_tag(ts, "morphing"); add_tag(ts, "evolving"); }
    if (spread > 0.55f)   { add_tag(ts, "wide"); add_tag(ts, "chorus-like"); }
    else if (spread < 0.20f) { add_tag(ts, "focused"); add_tag(ts, "tight voices"); }
}

static void tag_dimension(TagSet *ts, const int k[8]) {
    /* k[0]=Waveform, k[1]=Stereo, k[2]=Filter Cutoff, k[3]=Resonance */
    float cutoff    = norm(k[2]);
    float resonance = norm(k[3]);
    float stereo    = norm(k[1]);

    if (cutoff > 0.65f)      { add_tag(ts, "bright"); add_tag(ts, "open"); }
    else if (cutoff < 0.30f) { add_tag(ts, "dark"); add_tag(ts, "filtered"); }

    if (resonance > 0.80f)      { add_tag(ts, "resonant"); add_tag(ts, "nasal"); add_tag(ts, "cutting"); }
    else if (resonance > 0.60f) { add_tag(ts, "resonant"); add_tag(ts, "nasal"); }

    if (stereo > 0.60f) add_tag(ts, "wide stereo");
}

static void tag_digital(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Shaper, k[1]=Octave, k[2]=Detune+RingMod, k[3]=Digitalness */
    float digitalness = norm(k[3]);
    float ringmod     = norm(k[2]);

    if (digitalness > 0.65f) { add_tag(ts, "harsh"); add_tag(ts, "lo-fi digital"); }
    if (ringmod > 0.50f)     { add_tag(ts, "ring modulated"); add_tag(ts, "metallic"); }
}

static void tag_fm(TagSet *ts, const int k[8]) {
    /* k[0]=FM Amount, k[1]=Frequency, k[2]=Topology, k[3]=Detune */
    float fm_amt = norm(k[0]);
    float detune = norm(k[3]);

    if (fm_amt > 0.70f)      { add_tag(ts, "metallic"); add_tag(ts, "inharmonic"); add_tag(ts, "complex harmonics"); }
    else if (fm_amt > 0.30f)   add_tag(ts, "warm FM");
    else                       add_tag(ts, "subtle FM");

    if (detune > 0.40f) { add_tag(ts, "detuned"); add_tag(ts, "beating"); }
}

static void tag_pulse(TagSet *ts, const int k[8]) {
    /* k[0]=Filter, k[1]=Amplitude, k[2]=Pulse Two, k[3]=Modulation */
    float filter = norm(k[0]);
    float mod    = norm(k[3]);

    if (filter < 0.30f)      { add_tag(ts, "dark"); add_tag(ts, "filtered pulse"); }
    else if (filter > 0.70f) { add_tag(ts, "buzzy"); add_tag(ts, "bright pulse"); }

    if (mod > 0.50f) add_tag(ts, "animated");
}

static void tag_string(TagSet *ts, const int k[8]) {
    /* k[0]=Tension, k[1]=Decay, k[2]=Detune, k[3]=Impulse Type */
    float tension = norm(k[0]);
    float detune  = norm(k[2]);

    if (tension < 0.20f)      { add_tag(ts, "slack"); add_tag(ts, "loose"); }
    else if (tension > 0.70f) { add_tag(ts, "bright string"); add_tag(ts, "taut"); }

    if (detune > 0.40f) add_tag(ts, "detuned");
}

static void tag_voltage(TagSet *ts, const int k[8]) {
    /* k[0]=Ampere Mod, k[1]=Ground Noise, k[2]=Phase Filter, k[3]=Voltage Detune */
    float noise  = norm(k[1]);
    float detune = norm(k[3]);

    if (noise > 0.30f)   { add_tag(ts, "noisy"); add_tag(ts, "gritty"); }
    if (detune > 0.50f)  { add_tag(ts, "unstable"); add_tag(ts, "drifting"); }
}

static void tag_dna(TagSet *ts, const int k[8]) {
    /* k[0]=Filter (bipolar), k[1]=Wave Number, k[2]=Wave Modifier, k[3]=Noise */
    float filter = norm_bi(k[0]);
    float noise  = norm(k[3]);

    if (filter < 0.30f)      add_tag(ts, "dark");
    else if (filter > 0.70f) add_tag(ts, "bright");

    if (noise > 0.20f) { add_tag(ts, "noisy"); add_tag(ts, "organic"); }
}

static void tag_drwave(TagSet *ts, const int k[8]) {
    /* k[0]=Wave Type And Length, k[1]=Filter, k[2]=Phase, k[3]=Chorus */
    float filter = norm(k[1]);
    float chorus = norm(k[3]);

    if (filter < 0.30f) { add_tag(ts, "dark"); add_tag(ts, "filtered"); }
    if (chorus > 0.40f)   add_tag(ts, "chorused");
}

static void tag_dsynth(TagSet *ts, const int k[8]) {
    /* k[2]=Envelope Crossfader drives character */
    float crossfade = norm(k[0]);
    if (crossfade > 0.65f) add_tag(ts, "bright");
    else if (crossfade < 0.25f) add_tag(ts, "dark");
}

static void tag_phase(TagSet *ts, const int k[8]) {
    /* k[0]=Phase Shift, k[1]=Distortion, k[2]=Phase Filter, k[3]=Phase Tilt */
    float distortion = norm(k[1]);
    float tilt       = norm(k[3]);

    if (distortion > 0.50f) { add_tag(ts, "distorted"); add_tag(ts, "gritty"); }
    if (tilt > 0.60f)       { add_tag(ts, "tilted"); add_tag(ts, "filtered"); }
}

static void tag_amp(TagSet *ts, const int k[8]) {
    /* k[2]=Tone, k[3]=Drive */
    float drive = norm(k[3]);
    if (drive > 0.60f) add_tag(ts, "driven");
    else               add_tag(ts, "clean");
}

static void tag_engine(TagSet *ts, const char *type, const int k[8]) {
    /* Always add the engine name as a base tag */
    add_tag(ts, type);

    if      (strcmp(type, "cluster")   == 0) tag_cluster(ts, k);
    else if (strcmp(type, "dimension") == 0) tag_dimension(ts, k);
    else if (strcmp(type, "digital")   == 0) tag_digital(ts, k);
    else if (strcmp(type, "fm")        == 0) tag_fm(ts, k);
    else if (strcmp(type, "pulse")     == 0) tag_pulse(ts, k);
    else if (strcmp(type, "string")    == 0) tag_string(ts, k);
    else if (strcmp(type, "voltage")   == 0) tag_voltage(ts, k);
    else if (strcmp(type, "dna")       == 0) tag_dna(ts, k);
    else if (strcmp(type, "drwave")    == 0) tag_drwave(ts, k);
    else if (strcmp(type, "dsynth")    == 0) tag_dsynth(ts, k);
    else if (strcmp(type, "phase")     == 0) tag_phase(ts, k);
    else if (strcmp(type, "amp")       == 0) tag_amp(ts, k);
    /* sampler, vocoder, dbox: engine tag only */
}

/* =========================================================================
 * FX TAGGER
 * ========================================================================= */

static void tag_fx(TagSet *ts, const char *type, const int fx[8], int active) {
    if (!active) return;

    if (strcmp(type, "mother") == 0) {
        float mix      = norm(fx[3]);
        float distance = norm(fx[0]);
        if (mix > 0.50f)      { add_tag(ts, "reverb-heavy"); add_tag(ts, "lush"); add_tag(ts, "spacious"); }
        else if (mix > 0.20f)   add_tag(ts, "roomy");
        else                    add_tag(ts, "slight reverb");
        if (distance > 0.60f)   add_tag(ts, "large room");
    } else if (strcmp(type, "delay") == 0) {
        float level = norm(fx[3]);
        add_tag(ts, "echo"); add_tag(ts, "delay");
        if (level > 0.50f) add_tag(ts, "delay-heavy");
    } else if (strcmp(type, "spring")   == 0) { add_tag(ts, "spring reverb"); add_tag(ts, "vintage"); }
    else if (strcmp(type, "cwo")        == 0) { add_tag(ts, "chorus"); add_tag(ts, "shimmer"); }
    else if (strcmp(type, "nitro")      == 0) { add_tag(ts, "filtered"); add_tag(ts, "lo-fi"); }
    else if (strcmp(type, "phone")      == 0) { add_tag(ts, "lo-fi"); add_tag(ts, "telephone"); }
    else if (strcmp(type, "terminal")   == 0) { add_tag(ts, "bitcrushed"); add_tag(ts, "digital dirt"); }
    else if (strcmp(type, "punch")      == 0) { add_tag(ts, "driven"); add_tag(ts, "punchy"); }
    else if (strcmp(type, "grid")       == 0) { add_tag(ts, "rhythmic echo"); add_tag(ts, "stutter"); }
}

/* =========================================================================
 * LFO TAGGER
 * ========================================================================= */

static void tag_lfo(TagSet *ts, const char *type, const int lfo[8], int active) {
    if (!active) return;

    if (strcmp(type, "tremolo") == 0) {
        /* lfo[0]=Speed, lfo[1]=Pitch Amount, lfo[2]=Volume Level, lfo[7]=LFO Shape */
        float speed  = norm(lfo[0]);
        float pitch  = norm_bi(lfo[1]);  /* can be negative */
        float volume = norm(lfo[2]);

        if (speed < 0.20f)      add_tag(ts, "slow tremolo");
        else if (speed > 0.60f) add_tag(ts, "fast tremolo");
        else                    add_tag(ts, "tremolo");

        if (pitch > 0.15f)   add_tag(ts, "vibrato");
        if (volume > 0.15f)  add_tag(ts, "tremolo");
    } else if (strcmp(type, "element") == 0) {
        /* lfo[1]=Amount */
        float amount = norm_bi(lfo[1]);
        if (amount > 0.20f) { add_tag(ts, "animated"); add_tag(ts, "envelope-driven"); }
    } else if (strcmp(type, "random")   == 0) { add_tag(ts, "random modulation"); add_tag(ts, "unpredictable"); }
    else if (strcmp(type, "value")      == 0)   add_tag(ts, "stepped modulation");
    else if (strcmp(type, "velocity")   == 0)   add_tag(ts, "velocity sensitive");
    else if (strcmp(type, "midi")       == 0)   add_tag(ts, "midi modulated");
}

/* =========================================================================
 * OCTAVE TAGGER
 * ========================================================================= */

static void tag_octave(TagSet *ts, int octave) {
    if (octave <= -2)     { add_tag(ts, "sub"); add_tag(ts, "low register"); }
    else if (octave == -1)  add_tag(ts, "low register");
    else if (octave == 1)   add_tag(ts, "upper register");
    else if (octave >= 2)  { add_tag(ts, "high register"); add_tag(ts, "bright"); }
}

/* =========================================================================
 * COMPOSITE TAGGER
 * ========================================================================= */

static void tag_composite(TagSet *ts) {
    int is_pad        = has_tag(ts, "pad");
    int is_percussive = has_tag(ts, "percussive");
    int is_sustained  = has_tag(ts, "sustained");
    int is_spacious   = has_tag(ts, "spacious");
    int is_lush       = has_tag(ts, "lush");
    int is_swelling   = has_tag(ts, "swelling");
    int is_lingering  = has_tag(ts, "lingering");
    int is_tight      = has_tag(ts, "tight");
    int is_legato     = has_tag(ts, "legato");
    int is_fm         = has_tag(ts, "fm");
    int is_metallic   = has_tag(ts, "metallic");

    if (is_pad && (is_spacious || is_lush))          add_tag(ts, "ambient");
    if (is_percussive && is_tight)                    add_tag(ts, "stab");
    if (is_swelling && is_lingering)                  add_tag(ts, "cinematic");
    if (is_sustained && is_legato && !is_pad)         add_tag(ts, "lead");
    if (is_fm && is_metallic && is_percussive)        add_tag(ts, "bell");
}

/* =========================================================================
 * FILE HELPERS
 * ========================================================================= */

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

static void make_tags_path(const char *json_path, char *out, size_t outsz) {
    size_t len = strlen(json_path);
    if (len >= outsz) len = outsz - 1;
    memcpy(out, json_path, len);
    out[len] = '\0';
    char *dot = strrchr(out, '.');
    char *sep = strrchr(out, '/');
#ifdef _WIN32
    char *bs = strrchr(out, '\\');
    if (!sep || (bs && bs > sep)) sep = bs;
#endif
    if (dot && (!sep || dot > sep)) strcpy(dot, ".tags");
    else if (len + 5 < outsz)      strcpy(out + len, ".tags");
}

/* =========================================================================
 * PROCESS ONE FILE
 * ========================================================================= */

static int process_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f); rewind(f);
    char *json = (char *)malloc((size_t)sz + 1);
    if (!json) { fprintf(stderr, "out of memory\n"); fclose(f); return 1; }
    fread(json, 1, (size_t)sz, f);
    fclose(f);
    json[sz] = '\0';

    /* parse fields */
    char synth_type[64] = {0};
    char fx_type[64]    = {0};
    char lfo_type[64]   = {0};
    int  octave         = 0;
    int  fx_active      = 0;
    int  lfo_active     = 0;
    int  knobs[8]       = {0};
    int  adsr[8]        = {0};
    int  fx_params[8]   = {0};
    int  lfo_params[8]  = {0};

    json_get_string(json, "type",      synth_type, sizeof(synth_type));
    json_get_string(json, "fx_type",   fx_type,    sizeof(fx_type));
    json_get_string(json, "lfo_type",  lfo_type,   sizeof(lfo_type));
    json_get_int   (json, "octave",    &octave);
    json_get_bool  (json, "fx_active", &fx_active);
    json_get_bool  (json, "lfo_active",&lfo_active);
    json_get_int_array(json, "knobs",      knobs,      8);
    json_get_int_array(json, "adsr",       adsr,       8);
    json_get_int_array(json, "fx_params",  fx_params,  8);
    json_get_int_array(json, "lfo_params", lfo_params, 8);

    if (!synth_type[0]) {
        fprintf(stderr, "%s: no \"type\" field\n", path);
        free(json); return 1;
    }

    /* build tags */
    TagSet ts = {{{{0}}}, 0};
    tag_engine  (&ts, synth_type, knobs);
    tag_envelope(&ts, adsr);
    tag_fx      (&ts, fx_type,  fx_params,  fx_active);
    tag_lfo     (&ts, lfo_type, lfo_params, lfo_active);
    tag_octave  (&ts, octave);
    tag_composite(&ts);

    /* format tag string */
    char tag_line[1024] = {0};
    size_t pos = 0;
    for (int i = 0; i < ts.count; i++) {
        if (i > 0) { tag_line[pos++] = ','; tag_line[pos++] = ' '; }
        size_t tlen = strlen(ts.tags[i]);
        if (pos + tlen + 3 >= sizeof(tag_line)) break;
        memcpy(tag_line + pos, ts.tags[i], tlen);
        pos += tlen;
    }
    tag_line[pos] = '\0';

    /* print to stdout */
    char base[256];
    basename_no_ext(path, base, sizeof(base));
    printf("%s: %s\n", base, tag_line);

    /* write .tags sidecar */
    char tags_path[MAX_PATH];
    make_tags_path(path, tags_path, sizeof(tags_path));
    FILE *tf = fopen(tags_path, "w");
    if (tf) {
        fprintf(tf, "%s\n", tag_line);
        fclose(tf);
    }

    free(json);
    return 0;
}

/* =========================================================================
 * DIRECTORY WALKER
 * ========================================================================= */

typedef struct { int processed; int failed; } WalkStats;

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
        if (_stricmp(fd.cFileName, "synth") == 0) continue;

        char child[MAX_PATH];
        snprintf(child, sizeof(child), "%s\\%s", dir, fd.cFileName);

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            walk_dir(child, stats);
        } else {
            size_t len = strlen(fd.cFileName);
            if (len > 5 && _stricmp(fd.cFileName + len - 5, ".json") == 0) {
                if (process_file(child) == 0) stats->processed++;
                else                          stats->failed++;
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
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <patch.json [patch2.json ...] | directory>\n", argv[0]);
        return 1;
    }

#ifdef _WIN32
    if (argc == 2) {
        DWORD attrs = GetFileAttributesA(argv[1]);
        if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            WalkStats stats = {0, 0};
            clock_t t0 = clock();
            walk_dir(argv[1], &stats);
            double elapsed = (double)(clock() - t0) / CLOCKS_PER_SEC;
            printf("\n=== Done: %d tagged, %d failed  (%.2f sec) ===\n",
                   stats.processed, stats.failed, elapsed);
            return stats.failed ? 1 : 0;
        }
    }
#endif

    int ret = 0;
    for (int i = 1; i < argc; i++)
        if (process_file(argv[i]) != 0) ret = 1;
    return ret;
}
