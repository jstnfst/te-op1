import { useState } from "react"
import { apiGet, apiSend, downloadZip, type Pack } from "./api"

export const MAX_SELECTION = 200

/** Multi-select state shared by Browse and My patches. */
export function useSelection() {
  const [sel, setSel] = useState<Set<number>>(new Set())
  return {
    ids: [...sel],
    has: (id: number) => sel.has(id),
    toggle: (id: number) =>
      setSel((s) => {
        const n = new Set(s)
        if (n.has(id)) { n.delete(id) } else if (n.size < MAX_SELECTION) { n.add(id) }
        return n
      }),
    clear: () => setSel(new Set()),
  }
}

/** Floating action bar for the current selection: download a .zip or add to a pack. */
export function SelectionBar({ ids, onClear }: { ids: number[]; onClear: () => void }) {
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState("")
  const [adding, setAdding] = useState("")
  const [newPackName, setNewPackName] = useState("")
  const [creating, setCreating] = useState(false)
  if (!ids.length) return null

  async function downloadSelected() {
    setMsg("")
    try { await downloadZip("/api/patches/zip", { ids }, "op1-patches.zip") }
    catch (e) { setMsg((e as Error).message) }
  }

  async function openMenu() {
    setOpen((o) => !o)
    if (!packs) {
      try { const d = await apiGet<{ items: Pack[] }>("/api/packs"); setPacks(d.items) }
      catch { setPacks([]) }
    }
  }

  async function addTo(packId: number) {
    setMsg("")
    const total = ids.length
    let added = 0
    setAdding(`Adding 1 / ${total}…`)
    try {
      for (const id of ids) {
        await apiSend(`/api/packs/${packId}/items`, "POST", { patch_id: id })
        added++
        setAdding(`Adding ${added} / ${total}…`)
      }
      setAdding("")
      setMsg(added === total ? `Added ${added} to pack.` : `Added ${added} of ${total} to pack.`)
      setOpen(false)
    } catch (e) {
      setAdding("")
      setMsg(added > 0
        ? `Added ${added} of ${total}. ${(e as Error).message}`
        : (e as Error).message)
    }
  }

  async function createAndAdd() {
    const name = newPackName.trim()
    if (!name) return
    setCreating(true)
    try {
      const p = await apiSend<{ id: number }>("/api/packs", "POST", { name })
      setNewPackName("")
      setPacks(null)
      await addTo(p.id)
    } catch (e) { setMsg((e as Error).message) }
    finally { setCreating(false) }
  }

  return (
    <div className="selbar">
      <span><b>{ids.length} / {MAX_SELECTION}</b> selected</span>
      <button className="btn primary" onClick={downloadSelected}>Download .zip</button>
      <div className="selbar-pack">
        <button className="btn" onClick={openMenu}>Add to pack ▾</button>
        {open && (
          <div className="selbar-menu">
            <div className="menu-new-pack">
              <input
                type="text"
                placeholder="New pack name…"
                value={newPackName}
                onChange={(e) => setNewPackName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAdd() }}
                aria-label="New pack name"
                autoFocus
              />
              <button className="btn primary" onClick={createAndAdd} disabled={!newPackName.trim() || creating}>
                {creating ? "…" : "Create"}
              </button>
            </div>
            {packs === null ? (
              <div className="menu-item muted">Loading…</div>
            ) : packs.length === 0 ? (
              <div className="menu-item muted">No packs yet</div>
            ) : (
              packs.map((p) => (
                <button key={p.id} className="menu-item" onClick={() => addTo(p.id)}>{p.name}</button>
              ))
            )}
          </div>
        )}
      </div>
      <button className="btn" onClick={onClear}>Clear</button>
      {(adding || msg) && <span className="muted">{adding || msg}</span>}
    </div>
  )
}
