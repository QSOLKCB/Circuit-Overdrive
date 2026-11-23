# Circuit Overdrive

Drive the Ignition GT No. 27 through three laps of Overdrive Speedway. The 1.58 km circuit links two acceleration straights, a 17° banked turn and a reverse bend through pine-covered hills. CO-001 is a single-entrant keyboard race.

## Start the game

From the checkout, run

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the local game](http://127.0.0.1:8000/) in a modern browser with WebGL and native JSON module support. All code, sound and track geometry are local. The same files work in a static site's `/Circuit-Overdrive/` directory.

Choose **Start race**, then press **W** or **↑** on the grid. Hold it through the three lights to accelerate at green. The race clock starts at green and stops on the third valid finish-line crossing.

| Keys | Action |
| --- | --- |
| W / ↑ | Accelerate, or slow down when reversing |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Esc | Pause / resume |
| R | Recover to the last safe track position. Adds three seconds, with a two-second cooldown |
| C | Toggle low / high chase camera |

Losing focus clears the controls and pauses the countdown or race. Resume explicitly and press a fresh driving key. The header controls open the driving guide and toggle procedural engine audio. Pause and finish screens both offer restart.

## How the race works

- The validated track file defines seven corners with tangent circular arcs. A shared distance and lateral coordinate system supplies mesh vertices, wheel contact heights, rail boundaries, the minimap and eight gates. Where the banking changes, the asphalt mesh samples across the lane as well as along it to follow the wheel-contact surface. Distances are metres, +Y is up and local −Z is forward.
- The upstream four-wheel suspension, drivetrain, tyres and automatic transmission advance at 60 Hz. Game tuning adds speed-sensitive digital steering, pedal-to-reverse transitions and a throttle cutoff at 59 m/s. Each tick resolves curved rail contact using the oriented chassis footprint. A glancing hit scrubs speed along the rail. On a bank, a grounded car also sheds the climb associated with its outward motion, so the impact does not launch it off the road. Scenery outside the continuously enclosed track is decorative.
- Each lap requires seven intermediate gates and a forward finish crossing. The simulation checks the swept movement against the expected gate, the chassis heading and the distance travelled. Recovery resets the pose and speed on already travelled ground. It preserves the next required gate.
- Times and penalties are counted in simulation ticks. Long browser stalls can drop elapsed wall time. The chase cameras interpolate poses and widen the field of view with speed. Audio uses wheel and engine telemetry and starts on a user gesture.
- The bounded scene uses retained WebGL1 meshes. Graphics loss suspends play. After restoration the renderer rebuilds its buffers and the player can resume.

## Engine source

VANILLAJS is pinned at [9d95d74b355ec17add32db0b55f0f71130f9c004](https://github.com/QSOLKCB/VANILLAJS/tree/9d95d74b355ec17add32db0b55f0f71130f9c004). The [manifest](vendor/vanillajs/provenance.json) lists every adopted source path and SHA-256 digest. The vendored [licence](vendor/vanillajs/LICENSE) and [notice](vendor/vanillajs/NOTICE) accompany those files.

| Used for | Upstream modules or file |
| --- | --- |
| Physical vehicle and contact primitives | `vehicle3d`, `collision`, `math` |
| Lit WebGL scene and touring car rig | `render-lit`, `scenic3d`, `terrain` (imported by scenic3d) |
| Fixed clock and keyboard cancellation | `time`, `input` |
| Procedural sound and Web Audio buffer scheduling | `vehicle-audio`, `demos/horizon-lab/race-audio.js` |

The track, game rules, scenery, car modifications, livery and interface are game-owned. The lit renderer supplies the complete WebGL path. A separate copy of render-webgl is unnecessary.

## Verification

With Node 22.18 or newer, run

```sh
node --experimental-test-isolation=none --test tests/*.test.mjs
```

The browser checks are optional development tools. With Playwright and Chromium available, run the following against a running server. Set `PLAYWRIGHT_MODULE` to the absolute path of an existing Playwright ES module and `CHROME_BIN` to your Chrome binary when using external installations.

```sh
node tests/browser-smoke.mjs http://127.0.0.1:8000/
node tests/browser-finish.mjs http://127.0.0.1:8000/
```

To check subpath hosting, serve the parent of a checkout named `Circuit-Overdrive` and append `Circuit-Overdrive/` to the test URL. The finish test drives the real browser keyboard handler with a deterministic digital driver and advances controlled animation timestamps. The smoke test uses ordinary browser animation timing. The PR records the executed environments and evidence.
