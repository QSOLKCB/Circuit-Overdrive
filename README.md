# Circuit Overdrive

Start sixth in the Ignition GT No. 27. Race five rivals in a standalone event or compete for the World Overdrive Championship. All six cars use the same four-wheel vehicle simulation.

| Course | Format | Landmarks |
| --- | --- | --- |
| Overdrive Speedway | Three laps of the 1.58 km circuit | Two long straights, a 17° banked turn and a reverse bend |
| Redline Ridge | One 4.51 km mountain sprint | Forest switchbacks, a 270 m valley bridge, a 170 m tunnel and a downhill run to the flag |

For the downloadable game, archive checksums and receipt verification, see the [offline release guide](docs/offline-release.md).

## World Overdrive Championship

Choose **World Overdrive Championship** from course select. The Opening Cup and Speedway Grand Prix each cover three laps of Overdrive Speedway. The Mountain Challenge and championship finale take the six-car field through Redline Ridge. Each round has its own race seed.

At your chequered flag the six positions earn **10, 6, 4, 3, 2 and 1 points**. Rivals still racing keep their positions at the flag. The results show your award, every driver's total and the leader. After the fourth round the trophy goes to the standings winner. **Digital Dominion** accompanies the championship through the existing music mix.

Progress saves between events on the same browser, origin and build. Use **Continue championship** to pick up the competition. In a stamped build, **Save event replay** downloads that round's Theatre tape. [Calendar, countback rules and player guide](docs/championship.md)

## Start the game

From the checkout, run

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the local game](http://127.0.0.1:8000/) in a modern browser with WebGL and native JSON module support. All code, sound and track geometry are local. The same files work in a static site's `/Circuit-Overdrive/` directory.

Select a course and choose **Start race**. With the default keyboard, press **W** or **↑** on the grid. Hold it through the three lights to accelerate at green. The race clock starts at green. Cross the finish three times on Speedway or reach the far end of the Ridge after seven checkpoints.

| Keys | Action |
| --- | --- |
| W / ↑ | Accelerate, or slow down when reversing |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Esc | Pause / resume |
| R | Recover to the last safe track position. Adds three seconds, with a two-second cooldown |
| C | Toggle low / high chase camera |

Losing focus clears the controls and pauses the countdown or race. Resume explicitly and press a fresh driving key. The header controls open the driving guide and toggle procedural engine audio. Use **Restart race** to return to the same grid or **Course select** to choose the other road from the pause or results screen.

For a gamepad or wheel, open **Controller**, select the exposed slot, and set its mapping before the race. On touchscreens, tap **Drive with touch** on the grid. Each device supplies the same three driving values to the six-car simulation. [Controller setup and compatibility matrix](docs/controllers.md)

At the flag, **Save replay** downloads the accepted 60 Hz inputs and race seed. Recordings from Pages and the offline ZIP also carry the exact source revision. Run `node scripts/replay-drive.mjs PATH_TO_REPLAY.json` from the same game revision to reproduce the field classification. Pauses consume zero race ticks. Recordings are limited to 30 minutes of active simulation and stay on the device.

**Replay Theatre.** Import a locally saved JSON replay and watch all six cars in WebGL, switch the follow camera, adjust playback speed, and seek along an authoritative tick timeline. Shared files never leave the browser. Source-stamped replays from v0.6.0, v0.6.1 and v0.6.2 are admitted only because their physics-source fingerprints match the tested Theatre build. Unstamped v1 recordings and other incompatible revisions are rejected with an explanation. See [Replay Theatre guide](docs/replay-theatre.md).

## Cockpit and sound

The position display updates on every accepted race tick. A brief position-change notice waits for a place to hold for 0.2 seconds, so a door-to-door fight keeps a readable HUD. The map retains your latest completed lap or sprint split. The results highlight your fastest Speedway lap.

**Settings** opens the master, engine, tyre/effects and music mix. Each control ranges from silence to full level. The original 48 kHz procedural mix follows the player’s drivetrain and grounded tyres. Listen for the shift lift, brake scrub, guardrail tap and the short reflection in the Ridge tunnel. Audio starts when you take the wheel. Pause or mute fades it out.

**Driving effects** follows the browser’s reduced-motion and coarse-pointer capabilities by default. Mobile mode reduces the pixel dimensions to 75%. Full mode draws smoke during physical tyre slip, dust on the apron, tyre marks and brief sparks at a rail impact. Reduced mode retains up to 12 tyre marks and suppresses moving particles. Settings are saved locally when browser storage is available. Both chase cameras follow road grade, anticipate corners and give nearby rivals a little more room in the frame.

## How the race works

- The Speedway track file defines seven corners with tangent circular arcs. A shared distance and lateral coordinate system supplies mesh vertices, wheel contact heights, rail boundaries, the minimap and eight gates. Where the banking changes, the asphalt mesh samples across the lane as well as along it to follow the wheel-contact surface. Distances are metres, +Y is up and local −Z is forward.
- The upstream four-wheel suspension, drivetrain, tyres and automatic transmission advance at 60 Hz. At low speed the car has full steering travel. Wheelbase and measured speed set the available steering angle. The cornering target stays at 13.5 m/s² up to 130 km/h so a short steering tap stays predictable when you lift off the accelerator. Above that speed the target rises with squared speed. At 162 km/h it reaches 18 m/s² with full accelerator and 15.5 m/s² when coasting. On a fast sweeper, lifting off the accelerator eases the line while you keep steering. A half stick requests half the available angle. Aero load on grounded tyres rises with speed to 4 m/s² at 45 m/s. The suspension and tyres carry the extra load through the turn. Holding W and A or D keeps power on through corner entry. Near maximum speed, the throttle tapers over the last 3 m/s before a cutoff that varies from 59 m/s in a straight line to 48 m/s at full steering. Ease the steering as the bend opens to restore full straight-line power. The same handling applies to all driving inputs and AI. The brake pedal retains its low-speed reverse function.
- Each tick resolves curved rail contact using the oriented chassis footprint. A glancing hit scrubs speed along the rail. On a bank, a grounded car also sheds the climb associated with its outward motion, so the impact does not launch it off the road. Scenery outside the continuously enclosed track is decorative.
- Each lap requires seven intermediate gates and a forward finish crossing. The simulation checks the swept movement against the expected gate, the chassis heading and the distance travelled. Recovery resets the pose and speed on already travelled ground. It preserves the next required gate.
- Times and penalties are counted in simulation ticks. Long browser stalls can drop elapsed wall time. The chase cameras interpolate poses and widen the field of view with speed. Audio uses wheel and engine telemetry and starts on a user gesture.
- The bounded scene uses retained WebGL1 meshes. Graphics loss suspends play. After restoration the renderer rebuilds its buffers and the player can resume.

## Redline Ridge

Each race owns its course, vehicle field, checkpoint order and contact surface. On the Ridge, station zero is the start line and station 4510 is the finish. Sixty-four metres of approach pavement accommodate the staggered grid. Another 72 metres of road extend past the flag. A transverse guardrail closes each end of the pavement. Sampling, AI lookahead, ranking and the minimap respect these finite ends.

The road profile interpolates elevation and slope between surveyed stations in the original track data. Together with the road’s horizontal arcs and banking, that profile supplies each wheel contact and the retained road mesh. The bridge carries the same continuous driveable surface as the approach. The tunnel follows the road with clearance outside the rails. The AI reads the grade when planning its speed.

The sprint HUD counts validated intermediate checkpoints and shows the distance to the finish. A checkpoint split records elapsed time from green, including recovery penalties. A gate requires a forward crossing within both the road width and the gate’s height. The finish uses the same test after all seven intermediate gates. The results screen shows your cumulative splits and the field’s official status at your finish.

## Pack racing

| Grid | Car | Driver | Driving style |
| --- | --- | --- | --- |
| 1 | 14 · Blue | Mara Vale | Consistent pace and a steady line |
| 2 | 83 · Amber | Kit Vega | Looks for passing room early |
| 3 | 46 · Teal | Emi Park | Smooth turn-in and high corner speed |
| 4 | 59 · Violet | Rory Flint | Covers a lane when challenged from behind |
| 5 | 32 · Lime | Luca Reed | Conservative corner speeds and later reactions |
| 6 | 27 · Scarlet | Player | Keyboard control |

Each driver owns its physics, suspension, gear, gate history and recovery state. Each tick reads the same starting field to choose commands, advances the cars with VANILLAJS, resolves contacts in stable ID order, then scores the accepted motion. The fixed seed controls each rival’s pace variation, line preference and preferred passing side.

AI drivers sample the curvature and banking ahead, plan braking distance and steer toward a point on their chosen line. A pass needs a clear lane and space to move into it. Drivers slow behind occupied lanes, leave space alongside and hold their choice through a pass. An immobilised driver can request the same penalised recovery as the player. A recovery searches already-travelled track for space clear of nearby traffic.

Car-to-car contact uses chassis-length and chassis-width rectangles in the horizontal plane with a vertical clearance check. The sweep accounts for translation and turning within the tick. Equal-mass impulses exchange closing momentum, with limited sliding friction and low rebound. Bounded iterations settle overlaps between neighbours and the rails. Grounded corrections preserve height and vertical speed relative to the bank. The model approximates body contact and omits deformation and car-to-car rollover torque.

The HUD shows your live position, the closest rival within 60 m, a full-course map and a heading-up traffic display. A white outline identifies your car. Live order uses distance driven toward each required gate. Reversing gives up progress. Passing a gate without validating it falls back to the last validated gate for classification.

Each finisher records a time in ticks including three seconds per recovery. Finished competitors leave the active course. The field freezes when you finish. The results list finishers by penalty-adjusted time, then cars still racing in their on-track order. Grid ID breaks exact ties. Your lap splits include any penalties for that lap.

## Engine source

VANILLAJS is pinned at [9d95d74b355ec17add32db0b55f0f71130f9c004](https://github.com/QSOLKCB/VANILLAJS/tree/9d95d74b355ec17add32db0b55f0f71130f9c004). The [manifest](vendor/vanillajs/provenance.json) lists every adopted source path and SHA-256 digest. The vendored [licence](vendor/vanillajs/LICENSE) and [notice](vendor/vanillajs/NOTICE) accompany those files.

| Used for | Upstream modules or file |
| --- | --- |
| Physical vehicle and contact primitives | `vehicle3d`, `collision`, `math` |
| Lit WebGL scene and touring car rig | `render-lit`, `scenic3d`, `terrain` (imported by scenic3d) |
| Fixed clock and keyboard cancellation | `time`, `input` |
| Procedural vehicle voice and telemetry-to-sound mapping | `vehicle-audio`, `demos/horizon-lab/race-audio.js` |

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
node tests/browser-finish.mjs http://127.0.0.1:8000/ --attack
node tests/browser-smoke.mjs http://127.0.0.1:8000/ --ridge
node tests/browser-finish.mjs http://127.0.0.1:8000/ --ridge
node tests/browser-finish.mjs http://127.0.0.1:8000/ --ridge --attack
node tests/browser-effects.mjs http://127.0.0.1:8000/
node tests/browser-frames.mjs http://127.0.0.1:8000/
node tests/browser-frames.mjs http://127.0.0.1:8000/ --ridge
```

To check subpath hosting, serve the parent of a checkout named `Circuit-Overdrive` and append `Circuit-Overdrive/` to the test URL. The finish test drives the real browser keyboard handler with a deterministic digital driver and advances controlled animation timestamps. The standard finish replay classifies the whole field. The attack replay drives for the win and checks unfinished statuses. Both compare every rendered race position and the final standings with a separate same-runtime simulation. Set `NATIVE_GL=1` for a native OpenGL finish replay on a supported machine. The smoke and frame-interval tests use ordinary browser animation timing. The frame test requests native WebGL at 1920×1080 and reports the actual renderer, sample count, median, p95 and worst interval. Speedway samples the six-car standing start, the pack at speed and the 17° bank. The Ridge run samples the starting pack, open road, forest, bridge and tunnel as the player drives through each section. The PR records the executed environments and evidence.

For the hosted game, package verification and deployment evidence, see the [GitHub Pages guide](docs/pages.md).
