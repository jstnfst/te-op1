import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiSend } from "../api"

export default function Upload() {
  const { user, loading } = useAuth()
  const [text, setText] = useState("")
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">Upload a preset</h1>
        <p className="lead">Please <Link to="/login">log in</Link> to upload.</p>
      </>
    )
  }

  const onFile = (f: File) => f.text().then(setText)

  async function publish() {
    setMsg({})
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setMsg({ err: "That isn't valid JSON." }); return }
    try {
      const r = await apiSend<{ id: number; name: string }>("/api/patches", "POST", { json: parsed })
      setMsg({ ok: `Published "${r.name}" (#${r.id}).` })
      setText("")
    } catch (e) {
      setMsg({ err: (e as Error).message })
    }
  }

  return (
    <>
      <p className="eyebrow">Contribute</p>
      <h1 className="hero-title">Upload a preset</h1>
      <p className="lead">
        Paste a preset JSON or drop a <b>.json</b> file. It's validated, tagged, and published to
        the community library. (JSON only &mdash; sampler audio isn't included.)
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "type": "fm", "knobs": [ ... ], ... }'
          spellCheck={false}
        />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={publish} disabled={!text.trim()}>Publish</button>
        <label className="btn">
          Choose .json
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
        </label>
      </div>
      {msg.ok && <p className="ok" style={{ marginTop: 12 }}>{msg.ok}</p>}
      {msg.err && <p className="error" style={{ marginTop: 12 }}>{msg.err}</p>}
    </>
  )
}
