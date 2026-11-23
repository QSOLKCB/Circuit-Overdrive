# CO-MUSIC-001C — Original Future-Mode Chiptune Collection

**Status:** review candidate for the final v0.6.1 music PR. The future gameplay modes do not yet exist.

Six original, deterministic soundtrack arrangements are represented as **inspectable note, bass, arpeggio and percussion data** in `src/music-scores.js`.

| Title | Assignment | Character | BPM | Loop |
| --- | --- | --- | ---: | ---: |
| NEON HORIZON | Speedway — **live** | Synthwave/chiptune | 120 | 16.00 s |
| IRON HORSEPOWER | Redline Ridge — **live** | Guitar-like industrial chiptune | 150 | 12.80 s |
| RASTER VELOCITY | CO-010 Rocket Racing — **future** | Fast demoscene arpeggios, syncopated breaks | 180 | 10.67 s |
| MIDNIGHT PROTOCOL | CO-008 After Dark — **future** | Sparse minor-key cyberpunk synth | 144 | 13.33 s |
| DIGITAL DOMINION | CO-007 W.O.C. — **future** | Major-key arcade championship anthem | 120 | 16.00 s |
| STEEL RIOT | CO-012 Total Destruction — **future** | Industrial power riffs and mechanical percussion | 150 | 12.80 s |

Each future composition uses independently authored original 16-step melodic motifs, a mode-specific chord-root progression, dedicated bass and arpeggio patterns, and distinct percussion. These are mathematical, seeded 48 kHz stereo PCM16 arrangements. The industrial guitar-like sound uses BPS-001's bounded Karplus–Strong-style synthesis, not imported guitar recordings. No existing commercial melodies, samples or game assets are used.

## Produce the six WAV files and SHA-256 receipts

From the repository root:

```sh
node scripts/music-preview.mjs ../circuit-overdrive-soundtrack
sha256sum -c ../circuit-overdrive-soundtrack/SHA256SUMS
```

Use a **new**, nonexistent output directory. The command writes six `<mode>-preview.wav` references, six inspectable `<mode>-score.json` files and one `SHA256SUMS` with twelve entries.

Each score JSON includes a title, score data, a fixed seed, the revision identifier when its runtime bytes match the committed Git tree, and either `playable` or `future-mode-only`. The source revision is not invented for dirty runtime files. The WAV reference renders are **not** embedded in the game; the game synthesizes the active two scores from its source data.

## Musical acceptance

Deterministic byte-identical output, bounded numerical values, stereo samples and SHA-256 verification are **engineering checks**, not proof that music sounds excellent.

The owner should listen to all six exported WAVs on real speakers or headphones, including consecutive repeats. Review originality, coherent 1990s arcade aesthetic, recognisable riffs, demoscene arpeggios, relative instrument balance, phrase junctions, fatigue and musical progression. If a composition is unsatisfactory, revise the score and regenerate its receipt before release.

## Separation from gameplay

`MUSIC_TITLES`, `scoreForCourse` and `musicForCourse` continue to accept only Speedway and Ridge. The future catalogue uses separate `FUTURE_MUSIC_TITLES` and `scoreForFutureMode`; it does **not** create playable championship, night, rocket or demolition routes. No changes to VANILLAJS source pin, vehicle physics, simulation, replay, race classifications or audio-device lifecycle.

## Verification

Run `node --test tests/music-catalogue.test.mjs tests/music.test.mjs tests/bps.test.mjs`, the full Node suite, the Python offline-release regression, and the packaged browser/Pages workflow. Record real execution outcomes and exact source SHAs. Full listening sign-off, merging and tagging `v0.6.1` remain owner-controlled.
