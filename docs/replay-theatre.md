# CO-REPLAY-001 — REPLAY THEATRE

Replay Theatre shipped in v0.6.2.

Replay Theatre is a **source-bound, offline-first WebGL spectator**. It re-simulates all six cars from a saved recording’s accepted 60 Hz commands, seeded field and recovery requests. It does not take pre-recorded arbitrary car positions, invent checkpoints or change physics.

## How to watch and share

1. Finish a Speedway or Ridge race in the main game. Select **Save replay**; your browser downloads a JSON file.
2. Open **Replay Theatre** from the game header or visit `replay-theatre.html` in a **stamped GitHub Pages or verified offline release**.
3. Choose the JSON file using **Open local replay JSON**. The recording stays in your browser. No upload, account or server exists.
4. Use Play/Pause, Restart, ±5 s, Timeline, ½×/1×/2×/4×, Follow car and Chase/High cameras.
5. Select **Download to share** and send the original JSON file to a friend (email, USB or your choice of file transfer). They can import it into a compatible release.

The on-screen HUD follows your selected entrant, and the standings show all six competitors. The physical race is reconstructed from original VANILLAJS car, AI and course authority. Full playback includes the pre-race countdown; the *race timer* starts after green.

The standalone page supports keyboard, pointer/touch and native button/select controls. It is a spectator, not a game controller; no steering or brake commands are accepted from the viewer.

## Revision compatibility

A source stamp is mandatory. Playback accepts either the **exact site revision** or the following **explicitly audited same-physics revisions**:

| Release | Exact accepted revision |
| --- | --- |
| v0.6.0 — Arcade Certification Lab | `020e5dc4c7e2485e01f0f47c698f80ee58fe228b` |
| v0.6.1 — SYNTH//OVERDRIVE | `d81a2d4a09286029b87c2ac201edf8ab6448e023` |
| v0.6.2 — Replay Theatre | `c97ee47e7577337032a55eb2e6ae53b855285573` |

The source comparison between these tags contained no physics/AI/track/replay-authority changes. The Node test `tests/replay-theatre.test.mjs` pins the exact Git blob IDs of the authoritative files in v0.6.1 and fails if any authority changes are made without an explicit compatibility policy revision.

**Not supported:** v0.5.0 and older recordings, including unstamped version 1 JSON, and revisions with different physics. Replaying old commands under different physics could produce a different race, so the UI refuses them. A file claiming an accepted revision is **not cryptographically authenticated**, and local JSON can be edited; the replay is evidence under an honest local workflow, not a secure multiplayer competition receipt.

The package source revision is embedded into both `index.html` and `replay-theatre.html`. A raw development checkout lacks a verified stamp. For local playback, use the deterministic offline ZIP or serve a clean staged package; don't bypass the revision check.

## Determinism, seeking and limits

- Recorded commands are run-length encoded, admitted through strict finite-number, array-descriptor, duration and version validation, then copied into owned immutable entries.
- Maximum input size: **16 MiB**. Maximum logical duration: **108,000 ticks (30 minutes)**.
- Seek work is bounded at **240 authoritative simulation ticks per animation frame**. A backward seek resets the six-car field and runs the accepted commands again. No unbounded pose snapshots or artificial tick advances.
- Playback speed and follow-camera choices change only presentation cadence.
- Completion is accepted only if the recorded final tick produces the chequered flag; extra ticks and invalid recoveries are rejected.
- The current version is a **silent spectator**: soundtrack and engine audio playback are deliberately disabled to avoid presenting false audio-timeline synchronisation during speed changes and long seeks. Normal racing audio is unchanged.
- Game scores, checkpoint validation, AI decisions and collision authority are unchanged.
- Simulating a long seek may take several rendered frames. Repeated seek requests supersede previous requests without doing an unbounded amount of work in one callback.
- Replay files never contain executable JS, code imports or network URLs. The browser does not interpret replay-supplied HTML.

## Source checks

```sh
node --test tests/replay-theatre.test.mjs tests/replay.test.mjs
node --test tests/*.test.mjs
bash tests/browser-pages-shards.sh
```

The complete packaged browser test runs from `tests/browser-theatre.mjs`, integrated into the existing parallel browser verification. It imports an independently generated six-car race recording, checks the scene canvas and UI, changes camera target, seeks to completion, checks classification against the direct simulation, and exercises mismatched and legacy rejection.

**Remaining limitations:** real hardware input to the Theatre, physical-mobile browser UX, long-seek performance on older devices, and sound-synchronised replays require separate owner testing. Future editions may add trusted-compatible physics manifests or short video export, but no outbound service is needed for the current file-sharing workflow.

CO-007 also exports an ordinary v2 tape for each completed championship round in a stamped build. Its source, course, seed and tick count match that round. Open the downloaded JSON with the same Theatre controls. The championship's other events and points live in its separate local save. Importing a recording can only start spectator playback.
