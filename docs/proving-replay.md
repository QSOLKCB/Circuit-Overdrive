# Proving recording v7

This contract belongs to the dedicated `proving-replay.html` viewer. Historical Replay Theatre v2–v6, including its source admission rules, remains unchanged. D diagnostic receipts remain a separate format and cannot be imported as recordings.

`src/proving-replay.js` admits inert native JSON at most **2 MiB UTF-8**, with exact enumerable data keys and dense arrays. Version 7 / discipline `proving-ground` / format `circuit-overdrive.proving-replay` contains:

- `revision`: exact 40-character game source; `engineRevision`: immutable pinned engine.
- Model and optional owned ID, build rules version, validated canonical build, installed-build and full source-bound recipe SHA-256 digests.
- Track ID, proving/test rules, seed, 1/60 step and driving policy.
- The source-derived starting pose; 1–7,200 accepted calls within the selected discipline's own lower limit.
- Canonical bounded RLE command records `{ticks,throttle,brake,steer}` totaling the declared tick count.
- An explicit player-stop marker, accepted terminal result and full reconstructed solver-state digest.

No imported position stream or executable recipe can supply simulator state. Admission compiles the recorded build from the recorded matching source, recreates the fixed starting conditions, repeats every accepted command, and compares both the complete terminal result and full-state SHA-256. Altered model/parts/tuning/rules/source/digests/commands/results, truncated tapes, premature terminal state and unsupported formats reject. Recorded inventory is validated data; no owned part or money is granted by admission. The viewer never reads the garage to reconstruct a build and never writes ownership.

Only a fully admitted immutable tape enters the private admission set. Arbitrary objects, including a deserialized copy that has not been verified, cannot be serialized or passed directly to playback. Browser admission yields after at most 120 calls; cancellation prevents publishing a partial candidate. Seeking likewise reconstructs from zero in bounded batches and publishes accepted state at the requested tick. Playback advances the same recorded commands on a fixed clock, with rendering interpolating actual previous/current body and wheel states. Render timing and camera selection do not alter results.

`createProvingRecording(finishedRun, options)` creates and physically verifies a recording before export. `parseProvingReplay(text, expectedRevision, options)` enforces file bounds and full reconstruction. `serializeProvingReplay(admittedTape)` exports validated data. `createProvingPlayback(admittedTape)` exposes a bounded cursor with `advance(steps <= 120)` and `seekBatch(target)`.

UI cancellation, a replacement file, navigation or a changed selection invalidate pending work. The viewer pauses on blur, hidden tabs, controller disconnect and graphics loss; context restoration rebuilds retained meshes and requires Play. Native file size is checked before reading, then bounded UTF-8 text is checked again. Zero-call or unreproducible solver-rejected runs report an export rejection rather than inventing a recording. A stopped benchmark retains non-completion; player stop cannot replace a naturally terminal result.

Matching source is required. A future build or merge is a different revision and must not silently admit an old live source. This establishes reproducibility in the declared matching runtime, not an untested cross-browser bit-exact guarantee. There is no executable mod loader, remote source fetch, trusted imported telemetry or authenticity claim about who physically operated the controls.
