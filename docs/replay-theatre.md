# CO-REPLAY-001 — REPLAY THEATRE

Replay Theatre shipped in v0.6.2.

Replay Theatre is a **source-bound, offline-first WebGL spectator**. It re-simulates all six cars from a saved recording’s accepted 60 Hz commands, seeded field and recovery requests. It does not take pre-recorded arbitrary car positions, invent checkpoints or change physics.

## How to watch and share

1. Finish a Speedway, Ridge, Nitro Skyway or Orbital Spine race in the main game. Select **Save replay**; your browser downloads a JSON file.
2. Open **Replay Theatre** from the game header or visit `replay-theatre.html` in a **stamped GitHub Pages or verified offline release**.
3. Choose the JSON file using **Open local replay JSON**. The recording stays in your browser. No upload, account or server exists.
4. Use Play/Pause, Restart, ±5 s, Timeline, ½×/1×/2×/4×, Follow car and Chase/High cameras.
5. For a night race, select **Nightshift** under **Spectator lighting**. The environment can also be switched during playback or at a paused tick.
6. Select **Download to share** and send the original JSON file to a friend (email, USB or your choice of file transfer). They can import it into a compatible release.

The on-screen HUD follows your selected entrant, and the standings show all six competitors. The physical race is reconstructed from original VANILLAJS car, AI and course authority. Full playback includes the pre-race countdown; the *race timer* starts after green.

The standalone page supports keyboard, pointer/touch and native button/select controls. It is a spectator, not a game controller; no steering or brake commands are accepted from the viewer.

## Revision compatibility

A source stamp is mandatory. For touring v2, playback accepts either the **exact site revision** or the following **explicitly audited same-physics revisions**:

| Release | Exact accepted revision |
| --- | --- |
| v0.6.0 — Arcade Certification Lab | `020e5dc4c7e2485e01f0f47c698f80ee58fe228b` |
| v0.6.1 — SYNTH//OVERDRIVE | `d81a2d4a09286029b87c2ac201edf8ab6448e023` |
| v0.6.2 — Replay Theatre | `c97ee47e7577337032a55eb2e6ae53b855285573` |
| v0.7.0 — World Overdrive Championship | `3295b82004b64328072ac5fa64f8ba2b55394416` |
| v0.8.0 — Nightshift | `8204da56fce6b40ab33cb66c684a2e780f3e3001` |
| v0.9.0 — Nitro Overdrive | `f7f45d1b6c3521dd728945b71cf20ab406603cb4` |

The v0.7.0 authority audit compared committed trees with `git diff --exit-code v0.6.2 v0.7.0 -- src/ai.js src/contact.js src/field.js src/ridge.js src/speedway.js src/sim.js src/track.js src/replay.js tracks vendor`. Git returned exit code 0. The Node test `tests/replay-theatre.test.mjs` checks the individual blob IDs, including the vehicle, collision and math modules. Provenance tests cover every vendored file.

Version 2 describes the course, seed and accepted ticks. Lighting is the viewer’s choice and starts at Day on each import. For example, after opening `circuit-overdrive-ridge-night-replay.json`, select Nightshift to restore Midnight Descent. The filename is a reminder for the driver. Changing lighting rebuilds the WebGL scene while retaining the current timeline, follow target and six-car classification. Downloads preserve the imported JSON text.

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

## Nitro Skyway version 3

Skyway recordings require the exact stamped source or the audited published v0.9.0 source. The JSON object has exactly eight fields. `version` is 3, `discipline` is `nitro`, `rules` is 1, and `course` is `skyway`. The other fields are `revision` (40 lowercase hexadecimal digits), `seed` (unsigned 32-bit integer), `ticks` and `runs`.

Each run contains `[length, throttle, brake, steer, drift, boost, recover]`. Length is a positive integer. The two pedals range from zero to one and steering from −1 to +1. The final three entries are booleans. All numbers must be finite. Run lengths must sum exactly to the declared 1–108,000 ticks. The viewer admits files up to 16 MiB, advances at most 240 ticks per seek frame and rejects an early or late flag. A recovery is recorded on the tick the race accepts it. Both new held controls are sampled during each 60 Hz update.

The viewer reconstructs wheel contacts, charge, boost impulses, flight, landings and standings. Follow any car to see its energy and stunt points. Skyway uses its authored daylight environment. For terminal reconstruction run `node scripts/replay-drive.mjs FILE.json` from the matching clean checkout. The touring recorder and command decoder live byte-for-byte in `src/replay-v2.js`. The v0.7.0 to v0.8.0 authority comparison returned an empty diff. The test checks the historical simulator body after removing its one appended export declaration and verifies the other authority blob IDs.

## Orbital Spine version 4

Rules 2 include updated tyre load transfer and chassis-to-deck contact during a rollover. To watch a rules 1 drive, open the archive for its recorded source revision. Both rules versions use the same eight-element command row.

Finish Rocket Overdrive and save the replay from the results screen. In Theatre, follow any of the six drivers to see fuel, boost and magnetic contact. The camera follows the interpolated chassis quaternion through walls and ceilings. Seeking and replay speed affect the spectator clock. The Theatre runs each physics tick in order and stays silent during playback.

| Field | Orbital recording |
| --- | --- |
| `version`, `discipline`, `rules`, `course` | `4`, `"rocket"`, `2`, `"orbital"` |
| `revision` | Exact matching 40-digit lowercase hexadecimal source SHA |
| `seed`, `ticks` | Unsigned 32-bit race seed, 1–108,000 accepted ticks |
| `runs` | Dense nonempty rows with exactly eight entries |

A row is `[length, throttle, brake, steer, boost, assist, dodge, recover]`. Each positive integer length repeats the same accepted command. Pedals range from 0 to 1, steering from −1 to 1, boost and assist are booleans, and dodge is a signed integer equal to −1, 0 or +1. Recovery is a boolean for the accepted recovery request. All scalars must be finite. Row lengths must add up to the exact tick count. The file budget is 16 MiB and work per seek batch is at most 240 ticks. World positions, surface IDs, wheel forces, standings, and file-supplied code are never accepted as overrides. The race reconstructs these from the command stream and calibrated course.

The published v0.9.0 SHA `f7f45d1b6c3521dd728945b71cf20ab406603cb4` is an audited touring and Nitro source. The pin test verifies the complete Nitro solver, Skyway, simulation, shared AI, contact code, course data and pinned engine blobs. A separate Node v22.18.0 run of that archived source reproduced the 3,925-tick Skyway drive from seed 27. Its 952 command runs hash to `596ad8d87cc8a1546bd2486a22d6a045be272a7c8d66536350aa56b28a7cf20f` using compact JSON. The final six entrants hash to `5a3295dde8531429690bc46776a5d08efa93961c9c7e784303c3800015da4bad` in that runtime. v4 requires the exact source. A revision stamp identifies the expected implementation and does not authenticate the driver.
