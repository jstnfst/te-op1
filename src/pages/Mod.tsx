import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, apiSend } from "../api"

interface ModUser {
  id: number
  provider: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
  last_login: string
  banned_at: string | null
  patch_count: number
  pack_count: number
  is_admin: boolean
}

interface ModPatch {
  id: number
  name: string
  type: string
  download_count: number
  created_at: string
  user_id: number | null
  author: string | null
}

interface ModPack {
  id: number
  name: string
  created_at: string
  user_id: number
  author: string | null
  item_count: number
  download_count: number
}

interface Overview {
  users: ModUser[]
  patches: ModPatch[]
  packs: ModPack[]
}

/** Second-tap confirmation, same convention as MyPatches: first tap arms the
 * button (danger styling), a second tap within the window commits. */
function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function confirm(key: string): boolean {
    if (armed !== key) {
      if (timer.current) clearTimeout(timer.current)
      setArmed(key)
      timer.current = setTimeout(() => setArmed(null), 2500)
      return false
    }
    if (timer.current) clearTimeout(timer.current)
    setArmed(null)
    return true
  }
  return { armed, confirm }
}

const day = (s: string) => s.slice(0, 10)

export default function Mod() {
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const { armed, confirm } = useConfirm()

  useEffect(() => {
    apiGet<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setErr("")
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  function setBan(u: ModUser, banned: boolean) {
    const key = `user-${u.id}`
    if (banned && !confirm(key)) return
    act(key, async () => {
      await apiSend(`/api/admin/users/${u.id}`, "PATCH", { banned })
      setData((d) => d && {
        ...d,
        users: d.users.map((x) => (x.id === u.id ? { ...x, banned_at: banned ? new Date().toISOString() : null } : x)),
      })
    })
  }

  function takePrivate(kind: "patches" | "packs", id: number) {
    const key = `${kind}-${id}-priv`
    act(key, async () => {
      await apiSend(`/api/${kind}/${id}`, "PATCH", { is_public: false })
      setData((d) => d && { ...d, [kind]: d[kind].filter((x) => x.id !== id) } as Overview)
    })
  }

  function del(kind: "patches" | "packs", id: number) {
    const key = `${kind}-${id}-del`
    if (!confirm(key)) return
    act(key, async () => {
      await apiSend(`/api/${kind}/${id}`, "DELETE")
      setData((d) => d && { ...d, [kind]: d[kind].filter((x) => x.id !== id) } as Overview)
    })
  }

  if (loading) return <p className="muted">Loading…</p>

  return (
    <>
      <h1 className="hero-title">Moderation</h1>
      <p className="lead">
        Ban accounts and take down public content. Make private is reversible by the owner;
        delete is permanent. Banning blocks sign-in and ends the account's current session.
      </p>
      {err && <p className="error">{err}</p>}
      {!data ? null : (
        <>
          <section className="mod-section">
            <h2>Accounts</h2>
            <p className="muted mod-count">{data.users.length} {data.users.length === 1 ? "account" : "accounts"}</p>
            <div className="list">
              {data.users.map((u) => {
                const key = `user-${u.id}`
                return (
                  <div className="list-row" key={u.id}>
                    {u.avatar_url
                      ? <img className="mod-avatar" src={u.avatar_url} alt="" />
                      : <span className="mod-avatar mod-avatar-empty" aria-hidden="true">{(u.display_name || u.email || "?").slice(0, 1).toUpperCase()}</span>}
                    <span className="list-name mod-name">
                      {u.display_name || u.email || `user #${u.id}`}
                      {u.is_admin && <span className="chip mod-role">admin</span>}
                      {u.banned_at && <span className="chip banned">banned {day(u.banned_at)}</span>}
                    </span>
                    <span className="mod-meta">{u.email || "no email"} · {u.provider}</span>
                    <span className="mod-meta">
                      {u.patch_count} {u.patch_count === 1 ? "patch" : "patches"} · {u.pack_count} {u.pack_count === 1 ? "pack" : "packs"}
                    </span>
                    <span className="mod-meta">joined {day(u.created_at)}</span>
                    <div className="list-actions">
                      {u.is_admin ? null : u.banned_at ? (
                        <button className="btn" onClick={() => setBan(u, false)} disabled={busy === key}>Unban</button>
                      ) : (
                        <button
                          className={"btn" + (armed === key ? " danger" : "")}
                          onClick={() => setBan(u, true)}
                          disabled={busy === key}
                        >
                          {armed === key ? "Confirm ban?" : "Ban"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mod-section">
            <h2>Public patches</h2>
            {data.patches.length === 0 ? (
              <p className="muted">No public patches.</p>
            ) : (
              <>
                <p className="muted mod-count">{data.patches.length} {data.patches.length === 1 ? "patch" : "patches"}</p>
                <div className="list">
                  {data.patches.map((p) => {
                    const privKey = `patches-${p.id}-priv`
                    const delKey = `patches-${p.id}-del`
                    return (
                      <div className="list-row" key={p.id}>
                        <span className="chip list-type">{p.type}</span>
                        <a className="list-name" href={`/patch.html?id=${p.id}`}>{p.name}</a>
                        <span className="list-author">{p.author ? `by ${p.author}` : "no owner"}</span>
                        <span className="mod-meta">{p.download_count} dl · {day(p.created_at)}</span>
                        <div className="list-actions">
                          {/* Delete (not Make private) hides on mobile: the
                              reversible takedown stays reachable everywhere. */}
                          <button
                            className="btn"
                            onClick={() => takePrivate("patches", p.id)}
                            disabled={busy === privKey || busy === delKey}
                          >
                            {busy === privKey ? "Working…" : "Make private"}
                          </button>
                          <button
                            className={"btn list-act-ext" + (armed === delKey ? " danger" : "")}
                            onClick={() => del("patches", p.id)}
                            disabled={busy === privKey || busy === delKey}
                          >
                            {armed === delKey ? "Confirm?" : busy === delKey ? "Working…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className="mod-section">
            <h2>Public packs</h2>
            {data.packs.length === 0 ? (
              <p className="muted">No public packs.</p>
            ) : (
              <>
                <p className="muted mod-count">{data.packs.length} {data.packs.length === 1 ? "pack" : "packs"}</p>
                <div className="list">
                  {data.packs.map((k) => {
                    const privKey = `packs-${k.id}-priv`
                    const delKey = `packs-${k.id}-del`
                    return (
                      <div className="list-row" key={k.id}>
                        <Link className="list-name" to={`/packs/${k.id}`}>{k.name}</Link>
                        <span className="list-author">{k.author ? `by ${k.author}` : "no owner"}</span>
                        <span className="mod-meta">{k.item_count} {k.item_count === 1 ? "item" : "items"} · {k.download_count} dl · {day(k.created_at)}</span>
                        <div className="list-actions">
                          <button
                            className="btn"
                            onClick={() => takePrivate("packs", k.id)}
                            disabled={busy === privKey || busy === delKey}
                          >
                            {busy === privKey ? "Working…" : "Make private"}
                          </button>
                          <button
                            className={"btn list-act-ext" + (armed === delKey ? " danger" : "")}
                            onClick={() => del("packs", k.id)}
                            disabled={busy === privKey || busy === delKey}
                          >
                            {armed === delKey ? "Confirm?" : busy === delKey ? "Working…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
