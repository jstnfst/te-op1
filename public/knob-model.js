/* ====================================================================
   OP-1 Field - knob model (single source)
   How far each knob travels in raw units, and how a raw value reads on
   screen. Read by the patch editor / inspector (patch.html) and the Lab
   home (src/pages/Lab.tsx), so a knob behaves the same everywhere.
   Needs /mapping-data.js (scale type + named options per slot) first.
   ==================================================================== */
(function () {
  // Raw travel of a full knob turn, where it isn't the default (0..32767,
  // or -32767..32767 for centered). From mondo.c's min/max tables.
  const RANGES = {
    'synth.cluster': {0:[3072,17408],2:[512,24064],3:[3,1638]},
    'synth.digital': {1:[2048,26624],2:[-32768,32767]},
    'synth.dna': {0:[-29491,32767],1:[4608,12800]},
    'synth.drwave': {0:[0,24575],1:[0,16379],2:[0,16377]},
    'synth.fm': {2:[1024,17408]},
    'synth.phase': {1:[0,29491]},
    'synth.pulse': {0:[0,23168],1:[0,16384],2:[0,16384],3:[-16384,16384]},
    'synth.sampler': {0:[0,32766],4:[8192,24576]},
    'synth.string': {0:[64,8256],1:[512,24064],2:[0,16384],3:[8256,16448]},
    'fx.delay': {0:[1024,11264],1:[3276,32767],2:[0,16384]},
    'fx.grid': {0:[1344,16704],1:[1344,16704]},
    'fx.nitro': {0:[64,16448],1:[-32768,32767],2:[0,20643],3:[64,16448]},
    'fx.phone': {0:[204,20480],1:[3072,17408],2:[1536,16896]},
    'fx.punch': {0:[1344,12480],2:[1536,25088]},
    'fx.spring': {0:[1344,16448],1:[7744,16448],2:[0,16384]},
    'lfo.element': {0:[1024,7168],1:[-32767,32767],2:[1024,7168],3:[1024,15360]},
    'lfo.midi': {0:[1024,15360],1:[1024,15360],2:[1024,15360],3:[1024,15360],4:[1024,7168],5:[1024,7168],6:[1024,7168],7:[1024,7168]},
    'lfo.random': {0:[0,32767],2:[1024,7168],7:[0,27594]},
    'lfo.tremolo': {0:[0,32440],1:[-32767,32767],2:[-32767,32767],7:[0,32767]},
    'lfo.value': {0:[0,16384],1:[-32767,32767],2:[1024,11264],3:[1024,15360],4:[0,28086]},
    'lfo.velocity': {2:[1024,7168],3:[1024,15360]},
    'adsr': {0:[64,16320],1:[64,16320],3:[64,16320],5:[64,16448]},
    'dbox.dyna_env': {0:[-32768,32767],1:[0,8192],2:[-32768,32767],3:[0,32767]},
    'synth.dbox': {0:[0,24832]},
  };

  // Knobs that read a number across their travel: [at min, at max, unit, curve, step].
  // The value is min + t^curve * (max - min) for knob position t (curve 1 = linear);
  // with a step it reads rounded to that step (1 = whole numbers), as the screen does.
  const LINEAR = {
    'synth.digital': {1:[0,6,'',1,1]},                       // OCTAVE
    'synth.dimension': {2:[0,18000,'Hz',3,10]},              // FILTER CUTOFF FREQ: cubic
    'synth.drwave': {0:[0,99,'',1,1],1:[0,98,'',1,1],2:[0,98,'',1,1],3:[0,99,'',1,1]},
    'synth.fm': {0:[0,99,'',1,1],1:[0,99,'',1,1],3:[0,99,'',1,1]},
    'synth.vocoder': {1:[-4,4,'',1,1],2:[0,7,'',1,1]},       // FORMANT, BANDS
    'fx.delay': {1:[0,99,'',1,1],2:[0,99,'',1,1]},           // SPEED, FEEDBACK
    'fx.grid': {0:[0,99,'',1,1],1:[0,99,'',1,1],2:[0,99,'',1,1]},
    'fx.punch': {2:[1,24,'',1,1]},                           // ROUNDS
    'fx.terminal': {0:[100,20000,'Hz'],1:[2,16,'',1,0.1],2:[1,6,'',1,0.1]}, // RATE, BITS, MODEL
    'lfo.random': {1:[0,99,'',1,1]},                         // AMOUNT
  };

  // LFO SPEED dial: what the screen shows at each detent of a full turn (33
  // detents); the reading holds until the next mark.
  const SPEED_DIAL = { detents: 33, marks: [[0,'8'],[3,'7'],[5,'6'],[7,'5'],[9,'4'],[11,'3'],[13,'2'],[15,'1'],
    [17,'1/2'],[21,'3/8'],[25,'1/4'],[29,'1/8'],[33,'0']] };
  // Selectors whose options are zones: each option holds from its raw value
  // up to the next one (the rest pick the nearest option).
  const ZONES = { 'synth.vocoder': {0:1}, 'fx.delay': {0:1}, 'lfo.random': {7:1}, 'lfo.tremolo': {7:1} };

  const DIALS = { 'lfo.random': {0:SPEED_DIAL}, 'lfo.tremolo': {0:SPEED_DIAL}, 'lfo.value': {0:SPEED_DIAL} };

  // engine|idx -> { name, scale, samples } from the mappings table
  const LOOKUP = {};
  (window.OP1_MAPPINGS || []).forEach(function (r) {
    LOOKUP[r[0] + '|' + r[1]] = { name: r[2], scale: r[3], samples: r[4] };
  });

  function entry(eng, idx) { return LOOKUP[eng + '|' + idx] || null; }

  function range(eng, idx) {
    const r = RANGES[eng] && RANGES[eng][idx];
    if (r) return r;
    const e = entry(eng, idx);
    if (e && e.scale === 'centered') return [-32767, 32767];
    return [0, 32767];
  }

  function linear(eng, idx) { return (LINEAR[eng] && LINEAR[eng][idx]) || null; }
  function dial(eng, idx) { return (DIALS[eng] && DIALS[eng][idx]) || null; }

  function fmtUnit(v, unit, step) {
    if (step) {
      const dp = step < 1 ? String(step).split('.')[1].length : 0;
      return (Math.round(v / step) * step).toFixed(dp) + (unit ? ' ' + unit : '');
    }
    if (unit === 'Hz' && v >= 1000) return (Math.round(v / 100) / 10) + ' kHz';
    return Math.round(v) + ' ' + unit;
  }

  function nearest(samples, v) {
    if (!samples || !samples.length) return null;
    let best = samples[0];
    for (const s of samples) if (Math.abs(s[0] - v) < Math.abs(best[0] - v)) best = s;
    return best[1];
  }

  // Centered knobs read ±100% at the ends of their travel (0 = center), even
  // where the travel is narrower than the 16-bit field (pulse MODULATION: ±16384).
  function halfSpan(eng, idx) {
    const mm = range(eng, idx);
    return Math.max(Math.abs(mm[0]), Math.abs(mm[1])) || 32767;
  }

  // What the OP-1 screen shows for a raw value. Percent runs linearly across
  // the knob's travel (0–100%), centered runs -100%..+100% with 0 at center,
  // and selectors name the nearest option. Other scales (discrete, hz, tempo, ...) only have known
  // points, so anything between them reads as '' and raw is the truth.
  function display(eng, idx, raw) {
    const e = entry(eng, idx);
    const mm = range(eng, idx), min = mm[0], max = mm[1];
    if (eng === 'adsr' && idx === 7) return Math.floor(raw / 32767 * 100); // VOLUME 1–100
    const dl = dial(eng, idx);
    if (dl) {
      const d = Math.round(Math.max(0, Math.min(1, (raw - min) / (max - min || 1))) * dl.detents);
      let lbl = dl.marks[0][1];
      for (const m of dl.marks) if (m[0] <= d) lbl = m[1];
      return lbl;
    }
    const lin = linear(eng, idx);
    if (lin) { const t = Math.max(0, Math.min(1, (raw - min) / (max - min || 1))); return fmtUnit(lin[0] + Math.pow(t, lin[3] || 1) * (lin[1] - lin[0]), lin[2], lin[4]); }
    if (!e || e.scale === 'percent') {
      const p = Math.round((raw - min) / (max - min || 1) * 100);
      return Math.max(0, Math.min(100, p)) + '%';
    }
    if (e.scale === 'selector') {
      if (ZONES[eng] && ZONES[eng][idx]) { let o = e.samples[0]; for (const s of e.samples) if (s[0] <= raw) o = s; return o[1]; }
      return nearest(e.samples, raw);
    }
    if (e.scale === 'centered') { const p = Math.round(raw / halfSpan(eng, idx) * 100); return (p > 0 ? '+' : '') + p + '%'; }
    const exact = e.samples.find(function (s) { return s[0] === raw; });
    return exact ? exact[1] : '';
  }

  // Knob position 0..1 for a raw value (centered knobs sit at 12 o'clock for 0).
  function frac(eng, idx, raw) {
    const mm = range(eng, idx), e = entry(eng, idx);
    const f = e && e.scale === 'centered' ? raw / halfSpan(eng, idx) / 2 + 0.5 : (raw - mm[0]) / (mm[1] - mm[0] || 1);
    return Math.max(0, Math.min(1, f));
  }

  // Knobs whose display is computed for every raw value (the rest only have
  // known points: selector options, discrete steps, ...).
  function isContinuous(eng, idx) {
    const e = entry(eng, idx);
    return !e || e.scale === 'percent' || e.scale === 'centered' || !!linear(eng, idx) || !!dial(eng, idx) || (eng === 'adsr' && idx === 7);
  }

  // A knob turns continuously unless it picks from named options.
  function isSelector(eng, idx) {
    const e = entry(eng, idx);
    return !!(e && e.scale === 'selector' && e.samples.length > 1);
  }

  window.OP1_KNOB = { RANGES: RANGES, LOOKUP: LOOKUP, entry: entry, range: range, nearest: nearest,
    display: display, frac: frac, isSelector: isSelector, isContinuous: isContinuous };
})();
