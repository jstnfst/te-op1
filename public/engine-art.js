/* Engine glyphs: a small line drawing per synth engine, drawn in
   currentColor with the accent strokes in the orange class `.ac`. Shared by
   the patch editor's identity block and the Library's patch cards.
     window.OP1_ENGINE_ART(type) -> '<svg class="engine-svg" ...>' */
(function () {
  function poly(fn, x0, x1, mid, amp, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push((x0 + (x1 - x0) * t).toFixed(1) + ',' + (mid - amp * fn(t)).toFixed(1)); }
    return pts.join(' ');
  }
  const sine = c => t => Math.sin(t * Math.PI * 2 * c);
  function engineArt(type) {
    const W = 120, H = 72;
    let inner = '';
    switch (type) {
      case 'fm':
        inner = `<circle cx="34" cy="36" r="13" fill="none"/><circle cx="86" cy="36" r="13" fill="none" class="ac"/>
          <line x1="47" y1="36" x2="73" y2="36" class="ac"/><path d="M68 31 l6 5 -6 5" fill="none" class="ac"/>
          <polyline points="${poly(sine(2),18,50,36,7,40)}" fill="none"/>
          <polyline points="${poly(sine(5),72,104,36,7,40)}" fill="none" class="ac"/>`; break;
      case 'string':
        inner = `<line x1="16" y1="14" x2="16" y2="58"/><line x1="104" y1="14" x2="104" y2="58"/>
          <path d="M16 36 Q60 12 104 36" fill="none" class="ac"/><path d="M16 36 Q60 60 104 36" fill="none" opacity=".5"/>`; break;
      case 'pulse':
        inner = `<polyline points="14,52 14,20 44,20 44,52 74,52 74,20 104,20 104,52" fill="none" class="ac"/>`; break;
      case 'sampler':
        inner = `<polyline points="${poly(t=>Math.sin(t*Math.PI*9)*(0.4+0.6*Math.sin(t*Math.PI)),16,104,36,22,90)}" fill="none"/>
          <path d="M30 14 v44 M30 14 h6 M30 58 h6" class="ac" fill="none"/>
          <path d="M90 14 v44 M90 14 h-6 M90 58 h-6" class="ac" fill="none"/>`; break;
      case 'digital':
        inner = `<polyline points="14,50 30,50 30,30 46,30 46,42 62,42 62,22 78,22 78,40 94,40 94,28 106,28" fill="none" class="ac"/>`; break;
      case 'dimension':
        inner = `<rect x="30" y="22" width="40" height="40" fill="none"/><rect x="50" y="12" width="40" height="40" fill="none" class="ac"/>
          <line x1="30" y1="22" x2="50" y2="12"/><line x1="70" y1="22" x2="90" y2="12"/>
          <line x1="30" y1="62" x2="50" y2="52"/><line x1="70" y1="62" x2="90" y2="52"/>`; break;
      case 'dna':
        inner = `<polyline points="${poly(sine(1.5),16,104,36,16,60)}" fill="none"/>
          <polyline points="${poly(t=>-Math.sin(t*Math.PI*2*1.5),16,104,36,16,60)}" fill="none" class="ac"/>
          <line x1="34" y1="26" x2="34" y2="46"/><line x1="60" y1="26" x2="60" y2="46"/><line x1="86" y1="26" x2="86" y2="46"/>`; break;
      case 'drwave':
        inner = `<polyline points="${poly(sine(1),14,104,28,9,40)}" fill="none" opacity=".4"/>
          <polyline points="${poly(sine(2),14,104,40,9,40)}" fill="none" opacity=".7"/>
          <polyline points="${poly(sine(3),14,104,52,9,40)}" fill="none" class="ac"/>`; break;
      case 'dsynth': case 'dbox':
        inner = `<polyline points="${poly(sine(2),14,104,36,16,60)}" fill="none"/>
          <polyline points="${poly(t=>Math.sign(Math.sin(t*Math.PI*2*2)),14,104,36,14,120)}" fill="none" class="ac"/>`;
        if (type === 'dbox') inner = `<g class="ac">${[0,1,2,3].map(r=>[0,1,2,3,4,5].map(c=>`<circle cx="${22+c*16}" cy="${18+r*14}" r="3" fill="none"/>`).join('')).join('')}</g>`;
        break;
      case 'phase':
        inner = `<polyline points="${poly(sine(2),14,104,36,14,80)}" fill="none"/>
          <polyline points="${poly(t=>Math.sin((t+0.18)*Math.PI*2*2),14,104,36,14,80)}" fill="none" class="ac"/>`; break;
      case 'cluster':
        inner = `<g class="ac">` + [0,1,2,3,4,5].map(i=>`<line x1="20" y1="${14+i*8}" x2="${30+i*13}" y2="${14+i*8}"/>`).join('') + `</g>
          <line x1="20" y1="10" x2="20" y2="62"/>`; break;
      case 'vocoder':
        inner = `<g class="ac">` + [12,28,40,22,52,34,18,44,26].map((h,i)=>`<rect x="${16+i*11}" y="${56-h}" width="7" height="${h}" fill="none"/>`).join('') + `</g>`; break;
      case 'voltage':
        inner = `<polyline points="14,52 38,18 38,52 62,18 62,52 86,18 86,52 104,30" fill="none" class="ac"/>
          <line x1="14" y1="58" x2="104" y2="58" opacity=".4"/>`; break;
      case 'amp':
        inner = `<polygon points="22,28 22,44 38,44 54,56 54,16 38,28" fill="none" class="ac"/>
          <path d="M64 26 q8 10 0 20 M74 20 q14 16 0 32 M84 14 q20 22 0 44" fill="none"/>`; break;
      default:
        inner = `<polyline points="${poly(sine(2),14,104,36,16,80)}" fill="none" class="ac"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="engine-svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none">${inner}</svg>`;
  }
  window.OP1_ENGINE_ART = engineArt;
})();
