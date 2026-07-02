import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, type Pack, type PatchSummary } from "../api"
import { LikeButton } from "../like"

/** Liked patches and packs, newest like first. Unliking removes the row live. */
export default function Favorites() {
  const [patches, setPatches] = useState<PatchSummary[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState("")

  useEffect(() => {
    apiGet<{ patches: PatchSummary[]; packs: Pack[] }>("/api/favorites")
      .then((d) => { setPatches(d.patches); setPacks(d.packs) })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false))
  }, [])

  if (busy) return <p className="muted">Loading…</p>

  const empty = patches.length === 0 && packs.length === 0

  return (
    <>
      <h1 className="hero-title">Favorites</h1>
      <p className="lead">Everything you've liked, newest first.</p>
      {err && <p className="error">{err}</p>}

      {empty ? (
        <p className="muted">
          Nothing saved yet - tap the heart on any <Link to="/patches">patch</Link> or{" "}
          <Link to="/packs">pack</Link> and it lands here.
        </p>
      ) : (
        <>
          <section>
            <h2>Patches</h2>
            {patches.length === 0 ? (
              <p className="muted">No liked patches yet.</p>
            ) : (
              <div className="grid">
                {patches.map((p) => (
                  <div className="card" key={p.id}>
                    <div className="card-eyebrow">
                      <span className="chip">{p.type}</span>
                      {p.author ? <span>by {p.author}</span> : null}
                    </div>
                    <div className="card-title">{p.name}</div>
                    {p.tags && p.tags.split(",").filter(Boolean).length > 0 && (
                      <div className="card-tags">
                        {p.tags.split(",").filter(Boolean).slice(0, 6).map((t) => (
                          <span key={t} className="chip tag">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="row card-actions">
                      <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
                      <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
                      <LikeButton
                        type="patch"
                        id={p.id}
                        likeCount={p.like_count}
                        likedByMe={p.liked_by_me}
                        onToggled={(liked) => { if (!liked) setPatches((i) => i.filter((x) => x.id !== p.id)) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: 36 }}>
            <h2>Packs</h2>
            {packs.length === 0 ? (
              <p className="muted">No liked packs yet.</p>
            ) : (
              <div className="grid">
                {packs.map((k) => (
                  <Link className="card" key={k.id} to={`/packs/${k.id}`}>
                    <div className="card-eyebrow">
                      <span className="chip">pack</span>
                      <span>{k.item_count ?? 0} patches</span>
                      {k.author ? <span>by {k.author}</span> : null}
                    </div>
                    <div className="card-title">{k.name}</div>
                    <div className="row card-actions">
                      <LikeButton
                        type="pack"
                        id={k.id}
                        likeCount={k.like_count}
                        likedByMe={k.liked_by_me}
                        onToggled={(liked) => { if (!liked) setPacks((i) => i.filter((x) => x.id !== k.id)) }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
