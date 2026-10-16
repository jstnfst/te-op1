import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { useSelection, SelectionBar } from "../packs"
import { DiscoverPatches } from "../patchLists"
import { loginPath } from "../paths"

/** /library - the public patch browser; the front door of the LIBRARY path. */
export default function Library() {
  const { user } = useAuth()
  const selection = useSelection()

  return (
    <>
      <p className="eyebrow">Library</p>
      <h1 className="hero-title">Find a sound</h1>
      <p className="lead">
        Community patches for the OP-1 Field. Open one to see how it's built, or download the
        .aif and copy it onto your device.
        {user
          ? <> Select patches to grab a .zip or add them to a <Link to="/library/packs">pack</Link>.</>
          : <> <Link to={loginPath("/library")}>Log in</Link> to upload, like, and build packs.</>}
      </p>

      <DiscoverPatches selection={selection} />

      {user && <SelectionBar ids={selection.ids} onClear={selection.clear} />}
    </>
  )
}
