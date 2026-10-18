/* Coverage numbers shared by the Lab home, Layout, and Mappings pages, so
   their stats lines and scale legends always agree and move together when
   the data changes. Derived from layout-params.js, mapping-data.js and
   knob-model.js - load those first.

     engines     entries in the layout table
     namedSlots  array slots with a parameter name
     fixedSlots  slots holding firmware-managed constants (the "4–7" runs)
     slots       namedSlots + fixedSlots
     scaleTypes  scale types in use, fixed included
     byType      slots per scale type: named slots by their knob-model
                 scale, plus fixed */
(function () {
  const L = window.OP1_LAYOUT || {};
  const M = window.OP1_MAPPINGS || [];
  const S = window.OP1_SCALES || {};
  const K = window.OP1_KNOB;

  const byType = {};
  let namedSlots = 0, fixedSlots = 0;
  Object.entries(L).forEach(([key, names]) => {
    for (let i = 0; i < 8; i++) {
      if (!names[i]) continue;
      namedSlots++;
      const e = K && K.entry(key, i);
      if (e && S[e.scale]) byType[e.scale] = (byType[e.scale] || 0) + 1;
    }
  });
  M.forEach(([, idx, , type]) => {
    if (type !== 'fixed' || typeof idx !== 'string') return;
    const [a, b] = idx.split(/[–-]/).map(Number);
    fixedSlots += b - a + 1;
  });
  if (fixedSlots) byType.fixed = fixedSlots;

  window.OP1_STATS = {
    engines: Object.keys(L).length,
    namedSlots: namedSlots,
    fixedSlots: fixedSlots,
    slots: namedSlots + fixedSlots,
    scaleTypes: Object.keys(byType).length,
    byType: byType,
  };
})();
