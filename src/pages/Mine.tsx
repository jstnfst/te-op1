import { Link } from "react-router-dom"
import { useSelection, SelectionBar } from "../packs"
import { MyPatches } from "../patchLists"
import { MyPacks } from "./Packs"

/** /library/mine - the signed-in owner's patches and packs (route is auth-gated in App). */
export default function Mine() {
  const selection = useSelection()

  return (
    <>
      <p className="eyebrow">Library</p>
      <h1 className="hero-title">Mine</h1>
      <p className="lead">
        What you've uploaded and the packs you've built. <Link to="/library/upload">Upload more</Link>.
      </p>

      <MyPatches selection={selection} />
      <MyPacks />

      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}
