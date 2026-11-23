# CO-MUSIC-001C — Original Future-Mode Chiptune Collection

The original six-score catalogue shipped in v0.6.1. CO-007 activated Digital Dominion for championship rounds and CO-008 activated Midnight Protocol for night racing. The CO-009 review candidate adds a seventh score, **NITRO PULSE**, for Nitro Skyway. The catalogue is authored in `src/music-scores.js` and rendered through BPS-001.

| Title | Assignment | Character | BPM | Loop |
| --- | --- | --- | ---: | ---: |
| NEON HORIZON | Speedway — **live** | Synthwave/chiptune | 120 | 16.00 s |
| IRON HORSEPOWER | Redline Ridge — **live** | Guitar-like industrial chiptune | 150 | 12.80 s |
| RASTER VELOCITY | CO-010 Rocket Racing — **future** | Fast demoscene arpeggios, syncopated breaks | 180 | 10.67 s |
| MIDNIGHT PROTOCOL | CO-008 After Dark — **live** | Sparse minor-key cyberpunk synth | 144 | 13.33 s |
| DIGITAL DOMINION | CO-007 W.O.C. — **live** | Major-key arcade championship anthem | 120 | 16.00 s |
| STEEL RIOT | CO-012 Total Destruction — **future** | Industrial power riffs and mechanical percussion | 150 | 12.80 s |
| NITRO PULSE | CO-009 Nitro Skyway — **candidate** | Syncopated demoscene bass, sixteenth-note arpeggios, rising lead answer | 160 | 12.00 s |

Nitro Pulse uses eight bars in four-four time. Each sixteenth is exactly 4,500 sample frames at 48 kHz. Seed `0x9df05a37` drives the timbres for the original F♯ pedal-point bass, pitched arpeggio, lead and percussion. The loop contains 576,000 stereo frames. On Node 22.18.0 x86-64, the interleaved little-endian PCM16 SHA-256 is `87d4fba988f5ddfbc309682e99499eb5e45154b6179debd59a1f22cb34104253`. The full WAV SHA-256 is `aca8683f9a00768df1698d5aca0111fd8950deaa2aeafe7affd5d9fc04acb84f`.

In the Nitro discipline the engine/effects voice adds a rising boost ignition, descending depletion tone, charging oscillator, launch sweep, airborne wind and a low landing thump on a rewarded touchdown. The effects mixer reads accepted vehicle state each tick and writes into the existing mono buffer pool. The stereo score uses the Music slider and the same gesture-owned device.

Each future composition uses independently authored original 16-step melodic motifs, a mode-specific chord-root progression, dedicated bass and arpeggio patterns, and distinct percussion. These are mathematical, seeded 48 kHz stereo PCM16 arrangements. The industrial guitar-like sound uses BPS-001's bounded Karplus–Strong-style synthesis, not imported guitar recordings. No existing commercial melodies, samples or game assets are used.

## Produce the seven WAV files and SHA-256 receipts

From the repository root:

```sh
node scripts/music-preview.mjs ../circuit-overdrive-soundtrack
(cd ../circuit-overdrive-soundtrack && sha256sum -c SHA256SUMS)
```

Use a **new**, nonexistent output directory. The command writes seven `<mode>-preview.wav` references, seven inspectable `<mode>-score.json` files and one `SHA256SUMS` with fourteen entries.

Each score JSON includes a title, score data, a fixed seed, the revision identifier when its runtime bytes match the committed Git tree, and either `playable` or `future-mode-only`. The source revision is not invented for dirty runtime files. The WAV reference renders are **not** embedded in the game; the game synthesizes each selected score from its source data.

## Musical acceptance

Deterministic byte-identical output, bounded numerical values, stereo samples and SHA-256 verification are **engineering checks**, not proof that music sounds excellent.

The owner should listen to all seven exported WAVs on real speakers or headphones, including consecutive repeats. Review originality, coherent 1990s arcade aesthetic, recognisable riffs, demoscene arpeggios, relative instrument balance, phrase junctions, fatigue and musical progression. If a composition is unsatisfactory, revise the score and regenerate its receipt before release.

## Separation from gameplay

The runtime selects Speedway, Ridge, championship, night and Nitro scores through `musicForCourse`. Developers can export the original future-mode catalogue through `scoreForFutureMode`. The selection is local to the audio presentation.

## Verification

Run `node --test tests/music-catalogue.test.mjs tests/music.test.mjs tests/bps.test.mjs`, the full Node suite, the Python offline-release regression, and the packaged browser/Pages workflow. Record real execution outcomes and exact source SHAs. Owner listening review covers the mix on speakers and headphones.
