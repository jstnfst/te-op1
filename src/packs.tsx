import { useState } from "react"
import { apiGet, apiSend, downloadZip, type Pack } from "./api"

/** Multi-select state shared by Browse and My patches. */
export function useSelection() {
  const [sel, setSel] = useState<Set<number>>(new Set())
  return {
    ids: [...sel],
    has: (id: number) => sel.has(id),
    toggle: (id: number) =>
      setSel((s) => {
        const n = new Set(s)
        n.has(id) ? n.delete(id) : n.add(id)
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
    try {
      for (const id of ids) await apiSend(`/api/packs/${packId}/items`, "POST", { patch_id: id })
      setMsg(`Added ${ids.length} to pack.`)
      setOpen(false)
    } catch (e) { setMsg((e as Error).message) }
  }

  async function createAndAdd() {
    const name = window.prompt("New pack name:")?.trim()
    if (!name) return
    try {
      const p = await apiSend<{ id: number }>("/api/packs", "POST", { name })
      setPacks(null)
      await addTo(p.id)
    } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <div className="selbar">
      <span><b>{ids.length}</b> selected</span>
      <button className="btn primary" onClick={downloadSelected}>Download .zip</button>
      <div className="selbar-pack">
        <button className="btn" onClick={openMenu}>Add to pack ▾</button>
        {open && (
          <div className="selbar-menu">
            <button className="menu-item" onClick={createAndAdd}>+ New pack…</button>
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
      {msg && <span className="muted">{msg}</span>}
    </div>
  )
}
