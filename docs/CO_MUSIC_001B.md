# CO-MUSIC-001B — Course Soundtracks

**Status:** implementation PR, subject to owner listening and browser approval. [Roadmap](../ROADMAP.md) · [BPS-001](BPS_001.md).

Two original, eight-phrase, sample-indexed stereo PCM scores are generated from inspectable source data:

| Course | Composition | Mode | BPM | Loop |
| --- | --- | --- | ---: | ---: |
| Overdrive Speedway | **NEON HORIZON** | Synthwave / chiptune | 120 | 16.0 s |
| Redline Ridge | **IRON HORSEPOWER** | Industrial guitar-like / chiptune | 150 | 12.8 s |

The industrial lead uses BPS-001's seeded, bounded Karplus–Strong-inspired string delay and waveshaping; neither score imports commercial audio or tracker assets. Notes, percussion, dynamics and timbres are authored and original.

The game compiles a score lazily when the driver starts a course. A separate stereo Web Audio bus shares the existing **gesture-owned AudioContext** and master volume with the original engine/effects audio. The mixer has a **Music** control. The music position is an absolute 48 kHz sample-frame index. It is conserved through pause and reset on a new race. The soundtrack responds to accepted countdown/racing/final-lap/position telemetry through smoothed amplitude changes, never changes the race state, and has no network requests.

Important distinctions:
- Deterministic same-runtime PCM compilation is different from guaranteed speaker playback timing or hardware output.
- Browser audio scheduling remains bounded and can skip a late wall-time block; this does not change the race.
- Engine audio and music use distinct gain buses, although both share the final master output.
- The BPS score is looped, rather than claiming a full recorded song or a cycle-accurate SID/Paula emulator.
- The remaining four proposed tracks belong to CO-MUSIC-001C. Rocket Racing, W.O.C., After Dark and demolition are not yet playable.
- The score is generated and cached per course; startup latency and the soundtrack's musical quality require owner listening review.

Verification: `node --test tests/music.test.mjs tests/audio.test.mjs`, the full suite, packaged browser smoke (including Music slider and gesture gating), Pages verification and an owner listening playthrough. Any measured results should be cited from executed checks rather than this specification.
