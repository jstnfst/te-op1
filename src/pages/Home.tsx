import { Link } from "react-router-dom"

export default function Home() {
  return (
    <>
      <p className="eyebrow">OP-1 Field</p>
      <h1 className="hero-title">A reference and community library for OP-1 Field presets.</h1>
      <p className="lead">
        Explore how the OP-1 Field preset format works &mdash; the knob layout, value mappings,
        and live patch viewer stay open to everyone. Sign in with Google, Microsoft, Yahoo, or
        GitHub to browse the community library and publish your own.
      </p>

      <h2>Explore</h2>
      <div className="grid">
        <Link className="card" to="/browse">
          <div className="card-eyebrow">Community</div>
          <div className="card-title">Browse patches</div>
          <div className="card-desc">Search and filter uploaded presets by engine and derived tags.</div>
        </Link>
        <Link className="card" to="/upload">
          <div className="card-eyebrow">Contribute</div>
          <div className="card-title">Upload a preset</div>
          <div className="card-desc">Share your patch as JSON. It's validated, tagged, and added to the library.</div>
        </Link>
        <a className="card" href="/patch.html">
          <div className="card-eyebrow">Tool</div>
          <div className="card-title">Patch viewer</div>
          <div className="card-desc">Load a preset and explore it live: draggable ADSR, knobs, FX, and LFO.</div>
        </a>
        <a className="card" href="/params.html">
          <div className="card-eyebrow">Reference</div>
          <div className="card-title">Knob layout</div>
          <div className="card-desc">Named knob mappings for every synth, FX, and LFO engine.</div>
        </a>
        <a className="card" href="/display.html">
          <div className="card-eyebrow">Reference</div>
          <div className="card-title">Value mappings</div>
          <div className="card-desc">Raw-to-display value scales and sample points per parameter.</div>
        </a>
      </div>
    </>
  )
}
