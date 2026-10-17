/* ====================================================================
   OP-1 Field - value mappings table (single source)
   Scale types and, per engine slot, how the raw 16-bit value maps to the
   displayed one. Read by the Mappings page (display.html) and the Lab home
   (src/pages/Lab.tsx), so both always show the same data.
   ==================================================================== */
// ── SCALE TYPE DEFINITIONS ──────────────────────────────
window.OP1_SCALES = {
  percent:   { label: '%',             desc: 'Linear 0–100% across a full knob turn',           color: '#5B8DEF' },
  centered:  { label: 'centered %',    desc: 'Bipolar, centered at 0; can be negative raw',    color: '#A78BFA' },
  discrete:  { label: 'discrete',      desc: 'Stepped integer display (0–N or 1–N)',            color: '#34D399' },
  selector:  { label: 'selector',      desc: 'Named discrete options (context-dependent)',      color: '#F59E0B' },
  hz:        { label: 'hz',            desc: 'Frequency in Hz',                                 color: '#F97316' },
  tempo:     { label: 'tempo dial',    desc: 'LFO speed dial: 8 down to 1, then 1/2 to 0',       color: '#EC4899' },
  decimal:   { label: 'decimal',       desc: 'Continuous decimal scale between two bounds',    color: '#06B6D4' },
  fixed:     { label: 'fixed',         desc: 'Firmware-managed constant; not knob-editable',   color: '#4A4E57' },
};

// ── PARAMETER DATA ──────────────────────────────────────
// Each entry: [engine, idx, name, scaleType, samples[], info]
// samples: [[raw, display], ...]  - display can be number or string.
// Percent and centered knobs carry no samples: they read linearly across the
// knob's travel (public/knob-model.js computes it), so only knobs without a
// general formula (selector options, discrete, hz, tempo, ...) list points.
window.OP1_MAPPINGS = [
  ['synth.amp', 0, 'VOLUME',     'percent', [], ''],
  ['synth.amp', 1, 'COMPRESSOR', 'percent', [], ''],
  ['synth.amp', 2, 'TONE',       'percent', [], ''],
  ['synth.amp', 3, 'DRIVE',      'percent', [], ''],

  ['synth.cluster', 0, 'WAVE NUMBER', 'percent', [], ''],
  ['synth.cluster', 1, 'WAVE ENV',    'percent', [], ''],
  ['synth.cluster', 2, 'SPREAD',      'percent', [], ''],
  ['synth.cluster', 3, 'UNITOR',      'percent', [], ''],

  ['synth.dbox', 0, 'ENVELOPE CROSSFADER', 'percent', [], 'same params as dsynth; different lfo PARAMETER encoding'],
  ['synth.dbox', 1, 'WAVEFORM 1',          'percent', [], ''],
  ['synth.dbox', 2, 'ENVELOPE 1',          'percent', [], ''],
  ['synth.dbox', 3, 'CROSS MODULATION',    'percent', [], ''],
  ['synth.dbox', 4, 'FREQUENCY',           'percent', [], ''],
  ['synth.dbox', 5, 'WAVEFORM 2',          'percent', [], ''],
  ['synth.dbox', 6, 'ENVELOPE 2',          'percent', [], ''],
  ['synth.dbox', 7, 'CUTOFF',              'percent', [], ''],

  ['dbox.dyna_env', 0, 'ATTACK',  'centered', [], ''],
  ['dbox.dyna_env', 1, 'GAIN',    'percent',  [], ''],
  ['dbox.dyna_env', 2, 'RELEASE', 'centered', [], ''],
  ['dbox.dyna_env', 3, 'SMOOTH',  'percent',  [], ''],

  ['synth.digital', 0, 'WAVE SHAPER',    'percent',  [], ''],
  ['synth.digital', 1, 'OCTAVE',         'discrete', [], '0–6 across a full turn'],
  ['synth.digital', 2, 'DETUNE+RINGMOD', 'percent',  [], ''],
  ['synth.digital', 3, 'DIGITALNESS',    'percent',  [], ''],

  ['synth.dimension', 0, 'WAVEFORM',           'percent', [], ''],
  ['synth.dimension', 1, 'STEREO',             'percent', [], ''],
  ['synth.dimension', 2, 'FILTER CUTOFF FREQ', 'hz',     [], 'Cubic: 0 to 18000 Hz across a full turn'],
  ['synth.dimension', 3, 'RESONANCE',          'percent', [], ''],

  ['synth.dna', 0, 'FILTER',        'percent',  [], ''],
  ['synth.dna', 1, 'WAVE NUMBER',   'percent',  [], ''],
  ['synth.dna', 2, 'WAVE MODIFIER', 'percent',  [], ''],
  ['synth.dna', 3, 'NOISE',         'percent',  [], ''],

  ['synth.drwave', 0, 'WAVE TYPE AND LENGTH', 'discrete', [], '0–99 across a full turn'],
  ['synth.drwave', 1, 'FILTER',               'discrete', [], '0–98 across a full turn'],
  ['synth.drwave', 2, 'PHASE',                'discrete', [], '0–98 across a full turn'],
  ['synth.drwave', 3, 'CHORUS',               'discrete', [], '0–99 across a full turn'],

  ['synth.dsynth', 0, 'ENVELOPE CROSSFADER', 'percent', [], ''],
  ['synth.dsynth', 1, 'WAVEFORM 1',          'percent', [], ''],
  ['synth.dsynth', 2, 'ENVELOPE 1',          'percent', [], ''],
  ['synth.dsynth', 3, 'CROSS MODULATION',    'percent', [], ''],
  ['synth.dsynth', 4, 'FREQUENCY',           'percent', [], ''],
  ['synth.dsynth', 5, 'WAVEFORM 2',          'percent', [], ''],
  ['synth.dsynth', 6, 'ENVELOPE 2',          'percent', [], ''],
  ['synth.dsynth', 7, 'CUTOFF',              'percent', [], ''],

  ['synth.fm', 0, 'FM AMOUNT', 'discrete', [],                     '0–99 across a full turn'],
  ['synth.fm', 1, 'FREQUENCY', 'discrete', [],                     '0–99 across a full turn'],
  ['synth.fm', 2, 'TOPOLOGY',  'selector', [[1024,0],[3072,1],[5120,2],[7168,3],[9216,4],[11264,5],[13312,6],[15360,7],[17408,8]], '9 options'],
  ['synth.fm', 3, 'DETUNE',    'discrete', [],                     '0–99 across a full turn'],
  ['synth.fm', '4–7', '—',     'fixed',    [], 'firmware-managed constants: 15000 / 0 / 100 / 1500'],

  ['synth.phase', 0, 'PHASE SHIFT',       'percent', [], ''],
  ['synth.phase', 1, 'DISTORTION AMOUNT', 'percent', [], ''],
  ['synth.phase', 2, 'PHASE FILTER',      'percent', [], ''],
  ['synth.phase', 3, 'PHASE TILT',        'percent', [], ''],

  ['synth.pulse', 0, 'FILTER',     'percent',  [],  ''],
  ['synth.pulse', 1, 'AMPLITUDE',  'percent',  [],   ''],
  ['synth.pulse', 2, 'PULSE TWO',  'percent',  [],  ''],
  ['synth.pulse', 3, 'MODULATION', 'centered', [], ''],

  ['synth.sampler', 0, 'START',     'percent',  [], ''],
  ['synth.sampler', 1, 'LOOP IN',   'percent',  [], ''],
  ['synth.sampler', 2, 'LOOP OUT',  'percent',  [], ''],
  ['synth.sampler', 3, 'END',       'percent',  [], ''],
  ['synth.sampler', 4, 'DIRECTION', 'selector', [[12000, 'forward'],[24576, 'reverse']], 'forward/reverse; range 8192–24576'],
  ['synth.sampler', 5, 'FINE TUNE', 'percent',  [], ''],
  ['synth.sampler', 6, 'LOOP FADE', 'percent',  [], ''],
  ['synth.sampler', 7, 'GAIN',      'percent',  [], ''],

  ['synth.string', 0, 'TENSION',      'percent', [], ''],
  ['synth.string', 1, 'DECAY',        'percent', [], 'silence below 512'],
  ['synth.string', 2, 'DETUNE',       'percent', [], ''],
  ['synth.string', 3, 'IMPULSE TYPE', 'percent', [], ''],

  ['synth.vocoder', 0, 'WAVEFORM', 'selector', [[0,'S'],[4608,1],[9216,2],[13824,3],[18432,4],[23040,5],[27648,6],[32767,'N']], 'S, 1–6, N'],
  ['synth.vocoder', 1, 'FORMANT',  'discrete', [], '−4 to +4 across a full turn'],
  ['synth.vocoder', 2, 'BANDS',    'discrete', [], '0–7 across a full turn'],
  ['synth.vocoder', 3, 'MIX',      'percent',  [], ''],

  ['synth.voltage', 0, 'AMPERE MODULATION', 'percent', [], ''],
  ['synth.voltage', 1, 'GROUND NOISE',      'percent', [], ''],
  ['synth.voltage', 2, 'PHASE FILTER',      'percent', [], ''],
  ['synth.voltage', 3, 'VOLTAGE DETUNE',    'percent', [], ''],

  ['fx.cwo', 0, 'FREQUENCY', 'percent', [], ''],
  ['fx.cwo', 1, 'DELAY',     'percent', [], ''],
  ['fx.cwo', 2, 'FEEDBACK',  'percent', [], ''],
  ['fx.cwo', 3, 'SIDEBAND',  'percent', [], ''],

  ['fx.delay', 0, 'RANGE',    'selector', [[1024,'1000 ms'],[2944,'500 ms'],[4544,'250 ms'],[6144,'125 ms'],[8704,'62.5 ms'],[11264,'31.25 ms']], '6 steps, halving from 1000 ms'],
  ['fx.delay', 1, 'SPEED',    'discrete', [], '0–99 across a full turn'],
  ['fx.delay', 2, 'FEEDBACK', 'discrete', [], '0–99 across a full turn'],
  ['fx.delay', 3, 'LEVEL',    'percent',  [], ''],

  ['fx.grid', 0, 'X SIZE',     'discrete', [], '0–99 across a full turn'],
  ['fx.grid', 1, 'Y SIZE',     'discrete', [], '0–99 across a full turn'],
  ['fx.grid', 2, 'Z FEEDBACK', 'discrete', [], '0–99 across a full turn'],
  ['fx.grid', 3, 'MIX',        'percent',  [], ''],
  ['fx.grid', '4–7', '—',      'fixed',    [], 'firmware-managed constant: always 8000'],

  ['fx.mother', 0, 'DISTANCE', 'percent', [], ''],
  ['fx.mother', 1, 'GATE',     'percent', [], ''],
  ['fx.mother', 2, 'COLOR',    'percent', [], ''],
  ['fx.mother', 3, 'MIX',      'percent', [], ''],

  ['fx.nitro', 0, 'FREQUENCY LOWS',  'percent',  [], ''],
  ['fx.nitro', 1, 'FILTER FOLLOW',   'centered', [], ''],
  ['fx.nitro', 2, 'FEEDBACK',        'percent',  [], ''],
  ['fx.nitro', 3, 'FREQUENCY HIGHS', 'percent',  [], ''],

  ['fx.phone', 0, 'TONE',     'percent', [], ''],
  ['fx.phone', 1, 'GSM',      'percent', [], ''],
  ['fx.phone', 2, 'BAUD',     'percent', [], ''],
  ['fx.phone', 3, 'TELEMATIC','percent', [], ''],
  ['fx.phone', '4–7', '—',    'fixed',   [], 'firmware-managed constant: always 8000'],

  ['fx.punch', 0, 'FREQUENCY', 'percent',  [], ''],
  ['fx.punch', 1, 'PUNCH',     'percent',  [], ''],
  ['fx.punch', 2, 'ROUNDS',    'discrete', [], '1–24 across a full turn'],
  ['fx.punch', 3, 'POWER',     'percent',  [], ''],
  ['fx.punch', '4–7', '—',     'fixed',    [], 'firmware-managed constant: always 8000'],

  ['fx.spring', 0, 'TONE',    'percent', [], ''],
  ['fx.spring', 1, 'TURNS',   'percent', [], ''],
  ['fx.spring', 2, 'DAMPING', 'percent', [], ''],
  ['fx.spring', 3, 'MIX',     'percent', [], ''],
  ['fx.spring', '4–7', '—',   'fixed',   [], 'firmware-managed constant: always 8000'],

  ['fx.terminal', 0, 'RATE',      'hz',      [], ''],
  ['fx.terminal', 1, 'BITS',      'decimal', [], '2.0–16.0 across a full turn'],
  ['fx.terminal', 2, 'MODEL',     'decimal', [], '1.0–6.0 across a full turn'],
  ['fx.terminal', 3, 'MIX',       'percent', [], ''],

  ['lfo.element', 0, 'SOURCE',      'selector', [[1024,'gravity'],[2144,'microphone'],[4160,'envelope'],[7168,'sum']], 'gravity/microphone/envelope/sum'],
  ['lfo.element', 1, 'AMOUNT',      'centered', [], ''],
  ['lfo.element', 2, 'DESTINATION', 'selector', [[1024,'synth'],[2144,'envelope'],[4160,'fx'],[7168,'mix']], 'synth/envelope/fx/mix'],
  ['lfo.element', 3, 'PARAMETER',   'selector', [[1024,'min'],[15360,'max']], '4-param: 1024/4864/8704/15360; 8-param: 1024/2944/…/15360; dbox: 1024/2464/4384/6304/8224/10624/12544/14464'],

  ['lfo.midi', 0, 'PARAMETER 1',   'selector', [[1024,1],[5824,2],[10144,3],[15360,4]], '1–4 target knob; midi uses different selector raws than the other LFOs'],
  ['lfo.midi', 1, 'PARAMETER 2',   'selector', [[1024,1],[5824,2],[10144,3],[15360,4]], ''],
  ['lfo.midi', 2, 'PARAMETER 3',   'selector', [[1024,1],[5824,2],[10144,3],[15360,4]], ''],
  ['lfo.midi', 3, 'PARAMETER 4',   'selector', [[1024,1],[5824,2],[10144,3],[15360,4]], ''],
  ['lfo.midi', 4, 'DESTINATION 1', 'selector', [[1024,'synth'],[2144,'envelope'],[4384,'fx'],[7168,'sound output']], 'synth/envelope/fx/sound output'],
  ['lfo.midi', 5, 'DESTINATION 2', 'selector', [[1024,'synth'],[2144,'envelope'],[4384,'fx'],[7168,'sound output']], ''],
  ['lfo.midi', 6, 'DESTINATION 3', 'selector', [[1024,'synth'],[2144,'envelope'],[4384,'fx'],[7168,'sound output']], ''],
  ['lfo.midi', 7, 'DESTINATION 4', 'selector', [[1024,'synth'],[2144,'envelope'],[4384,'fx'],[7168,'sound output']], ''],

  ['lfo.random', 0, 'SPEED',       'tempo',    [], '8 → 1, then 1/2 → 0 on the dial'],
  ['lfo.random', 1, 'AMOUNT',      'discrete', [], '0–99 across a full turn'],
  ['lfo.random', 2, 'DESTINATION', 'selector', [[1024,'synth'],[2144,'envelope'],[4160,'fx'],[7168,'mix']], 'synth/envelope/fx/mix; same encoding as lfo.element'],
  ['lfo.random', 3, 'ENVELOPE',    'percent',  [], ''],
  ['lfo.random', 7, 'PARAMETER',   'selector', [[0,1],[6898,2],[13797,3],[20695,4],[27594,'ALL']], 'knobs of the DESTINATION in order; ALL comes last when DESTINATION = fx'],

  ['lfo.tremolo', 0, 'SPEED',          'tempo',    [], '8 → 1, then 1/2 → 0 on the dial'],
  ['lfo.tremolo', 1, 'PITCH AMOUNT',   'centered', [], ''],
  ['lfo.tremolo', 2, 'VOLUME LEVEL',   'centered', [], ''],
  ['lfo.tremolo', 3, 'PITCH ENVELOPE', 'percent',  [], ''],
  ['lfo.tremolo', 7, 'LFO SHAPE',      'selector', [[0,'sine'],[7161,'triangle'],[14322,'exponential'],[21483,'square'],[32767,'halfwidth']], 'sine/triangle/exponential/square/halfwidth; indices 4–6 unused'],

  ['lfo.value', 0, 'SPEED',       'tempo',    [], '8 → 1, then 1/2 → 0 on the dial'],
  ['lfo.value', 1, 'AMOUNT',      'centered', [], ''],
  ['lfo.value', 2, 'DESTINATION', 'selector', [[1024,'synth'],[2080,'synth free'],[4192,'envelope'],[6304,'envelope free'],[8416,'fx'],[10528,'fx free']], 'synth/synth free/envelope/envelope free/fx/fx free'],
  ['lfo.value', 3, 'PARAMETER',   'selector', [[1024,'min'],[15360,'max']], '4-param: 1024/4864/8704/15360; 8-param: 1024/2944/…/15360; dbox: 1024/2464/…/14464'],
  ['lfo.value', 4, 'LFO SHAPE',   'selector', [[0,'sine'],[9362,'square'],[18724,'sawtooth'],[28086,'reverse sawtooth']], 'sine/square/sawtooth/reverse sawtooth'],

  ['lfo.velocity', 0, 'AMP',           'percent',  [], ''],
  ['lfo.velocity', 1, 'VOLUME AMOUNT', 'centered', [], ''],
  ['lfo.velocity', 2, 'DESTINATION',   'selector', [[1024,'synth'],[2144,'envelope'],[4160,'fx'],[7168,'mix']], 'synth/envelope/fx/mix; same encoding as lfo.element'],
  ['lfo.velocity', 3, 'PARAMETER',     'selector', [[15360,'telematic']], 'context-dep; "telematic" when dest=fx/phone'],

  ['adsr', 0, 'ATTACK',     'percent',  [], ''],
  ['adsr', 1, 'DECAY',      'percent',  [], ''],
  ['adsr', 2, 'SUSTAIN',    'percent',  [], ''],
  ['adsr', 3, 'RELEASE',    'percent',  [], ''],
  ['adsr', 4, 'PLAY MODE',  'selector', [[2048,'poly'],[6140,'mono'],[9209,'legato'],[14336,'unison']], 'poly/mono/legato/unison'],
  ['adsr', 5, 'PORTAMENTO', 'percent',  [], ''],
  ['adsr', 6, 'BEND RANGE', 'selector', [[2048,'1 st'],[5117,'2 st'],[9209,'4 st'],[13301,'7 st'],[18432,'oct']], '1/2/4/7 st, octave'],
  ['adsr', 7, 'VOLUME',     'discrete', [[3276,10],[32767,100]], '1–100; raw = floor(N × 32767/100)'],
];
