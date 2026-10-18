# probe the rest of tape.json
`tape_type` is mapped (0 Studio 4-Track, 1 Vintage 4-Track, 2 Porta 4-Track, 3 Disk Mini). The other fields are identical on blank tapes, so they still print raw in `mondo tape -v`. Decode them by changing **one setting at a time** on the OP-1 on tape `s`, then running this after each change:

```
f="sandbox/s-$(date +%H%M%S).json"; mondo op1 pull "tapes/s/tape.json" "$f" && mondo tape -v "$f"
```

Note what you changed each time, then diff the saved files. Settings to try, with the field each one probably moves:
- tempo -> `tempobpmdecimal` (1200 now; likely BPM x10)
- selected track -> `track` (0-3?)
- a track's level, and the 4 other mixer controls -> `mixer_params[0-3]`, `[4-7]`
- loop on/off and its points -> `loop`, `loop_in`, `loop_out`
- metronome level and sound -> `tempometronomelevel`, `tempometronometype`
- sync out / sync source -> `temposyncout`, `temposynctype`
- playhead position -> `pos`
- record a short clip -> `clips`
