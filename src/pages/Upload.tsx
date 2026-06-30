import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiSend } from "../api"

type Preset = Record<string, unknown>

export default function Upload() {
  const { user, loading } = useAuth()
  const [preset, setPreset] = useState<Preset | null>(null)
  const [fileName, setFileName] = useState("")
  const [text, setText] = useState("") // advanced: paste JSON
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; err?: string; note?: string }>({})

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">Upload a patch</h1>
        <p className="lead">Please <Link to="/login">log in</Link> to upload.</p>
      </>
    )
  }

  async function readAif(file: File) {
    setMsg({})
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const parsed = JSON.parse(window.OP1Aif.aifToJson(buf)) as Preset
      setPreset(parsed)
      setFileName(file.name)
      if (parsed.type === "sampler") {
        setMsg({ note: "Sampler audio isn’t stored — only the patch settings will be saved." })
      }
    } catch (e) {
      setPreset(null)
      setFileName("")
      setMsg({ err: `Couldn’t read that .aif: ${(e as Error).message}` })
    }
  }

  async function publish(json: unknown) {
    setBusy(true)
    try {
      const r = await apiSend<{ id: number; name: string }>("/api/patches", "POST", { json })
      setMsg({ ok: `Published “${r.name}” (#${r.id}).` })
      setPreset(null)
      setFileName("")
      setText("")
    } catch (e) {
      setMsg({ err: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function publishJson() {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setMsg({ err: "That isn’t valid JSON." }); return }
    publish(parsed)
  }

  return (
    <>
      <h1 className="hero-title">Upload a patch</h1>
      <p className="lead">
        Drop an OP-1 Field <b>.aif</b> file (or choose one). We read the patch settings out of it and
        add them to the community library — sampler audio isn’t included.
      </p>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readAif(f) }}
      >
        <label className="btn primary">
          Choose .aif
          <input
            type="file"
            accept=".aif"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readAif(f) }}
          />
        </label>
        <span className="muted">or drop a .aif here</span>
      </div>

      {preset && (
        <div className="row" style={{ marginTop: 14 }}>
          <span className="muted">
            Ready to publish: <b>{(preset.name as string) || fileName}</b>
            {preset.type ? ` · ${preset.type}` : ""}
          </span>
          <button className="btn primary" disabled={busy} onClick={() => publish(preset)}>
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      )}

      <details className="adv">
        <summary>Advanced · paste JSON</summary>
        <p className="muted" style={{ margin: "10px 0" }}>
          Patches are stored as a small JSON blob. Curious how the
          <code> .aif</code> format was reverse-engineered? See the project on{" "}
          <a href="https://github.com/jstnfst/te-op1">GitHub →</a>
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "type": "fm", "knobs": [ ... ], ... }'
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy || !text.trim()} onClick={publishJson}>Publish JSON</button>
        </div>
      </details>

      {msg.note && <p className="muted" style={{ marginTop: 12 }}>{msg.note}</p>}
      {msg.ok && <p className="ok" style={{ marginTop: 12 }}>{msg.ok}</p>}
      {msg.err && <p className="error" style={{ marginTop: 12 }}>{msg.err}</p>}
    </>
  )
}
