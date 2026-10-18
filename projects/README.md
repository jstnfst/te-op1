# projects/

OP-1 Field **projects**: each folder here is a full copy of what you can change on the device (`drum/`, `synth/`, `mixdown/`, `tapes/`), made and restored by `mondo project`.

| | |
|---|---|
| `mondo project pull <name>` | back up the OP-1 into `projects/<name>/` (`-f` updates an existing one) |
| `mondo project push <name> -f` | restore it: the OP-1 ends up exactly like the project |
| `mondo project diff <name>` | what differs between the project and the OP-1 |
| `mondo project init <name>` | start a new project from `factory-reset/` |
| `mondo project list` | the projects here |

`factory-reset/` is the device as a factory reset leaves it. Push it to put the OP-1 back to that starting point.

Notes: write production notes into a project's `readme.txt` files (e.g. `tapes/<tape>/readme.txt`) to carry them onto the OP-1, or into any other file (`NOTES.md`) to keep them on the computer.

Details: [README.md › mondo project](../README.md#mondo-project)
