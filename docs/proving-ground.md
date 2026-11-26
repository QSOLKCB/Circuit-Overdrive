# The Proving Grounds — Machine Test Facility

CO-014D adds a separate owned-build driving authority. Open it from the main menu for free stock simulations, or select an owned garage bay and choose **Drive at the Proving Grounds**. Choose a test, load the selected build, then explicitly arm controls. W/up accelerates, S/down brakes, A/D steers, C changes view and Esc pauses. Controller profiles and touch use the existing driving-command boundary. Reset loads a fresh accepted build at the declared starting pose. There is no recovery teleport or reverse-drive policy.

`proving-ground-admission.js` validates the actual whole garage and resolves the selected owned ID, independently of the active ID. Current means the accepted saved configuration. Stock retains attribution when comparing an owned model, but uses the stock build. Proposed applies one discrete catalogue part to a private validated copy; no purchase, fitting, credits, inventory or condition is persisted. Selecting a catalogue model explicitly enters a free unowned simulation. Changes in another tab invalidate owned admission until an explicit reload. Established racing and championship recipes do not import these modules.

## Physical authority

The pure `proving-ground.js` compiles the complete accepted build and creates the pinned VANILLAJS vehicle3d solver. Every accepted call is 1/60 simulation second. Commands contain bounded throttle, brake and steering only. There are no force assists, speed setters or cosmetic performance scores. The declared seed is zero; the current world and reference driver use no random stream. Non-finite state, recovery requests and solver truncation terminate the run as an explicit physical failure.

`machine-test-facility-v1` is a flat dry surface with friction 1 and four enclosing physical AABBs. The enclosure spans x ±125 m, z −1345 to +125 m. The straight has substantial run-off; an acceleration run lasts 900 accepted calls, including after its first speed threshold. Slalom gates and the handling circle are painted timing windows, not hidden collision objects. All solid-looking outer buildings stand beyond the physical enclosure. Contact with a physical wall invalidates a scored run; practice displays accepted contacts and stops if the solver cannot safely continue.

Each model starts at its stock suspension equilibrium, with zero velocity, yaw/pitch/roll zero. That same initial pose is used for modified builds, including suspension changes. Spawn admission checks the pinned solver's conservative chassis cube, whose half-extent is half the chassis diagonal, against the facility walls. This cube is wider than the visible silhouette; it is a solver contact approximation, not the rendered panel boundary. The six mechanical dimensions remain those documented in [Build Forge](vehicle-builds.md).

The scene separates each original silhouette into body and four wheel meshes. Body orientation and suspension movement follow interpolated accepted state; each hub, front steering angle and wheel spin follows its corresponding physical wheel. The body has a fixed stock-equilibrium rendering anchor. Before the first solver call only, the upstream spawn's empty wheel contacts use known level-plane support for presentation. That observer never changes the physical state; accepted ticks use the solver's actual hubs. Paint changes panel colours only.

## Measurement rules

| Test | Accepted measurement and limit |
| --- | --- |
| Acceleration | First crossing of 100 km/h horizontal speed, linearly interpolated between adjacent accepted speed endpoints. Exactly 900 full-throttle reference calls; null is a valid non-completion. |
| Braking | Accelerate physically from rest to the first accepted speed at least 100 km/h, then command full brake until horizontal speed is at most 0.1 m/s. Sum actual horizontal path from that accepted starting state. The slightly over-threshold starting speed is reported; this is **reached-100 to stop**, not an invented exact-100 launch. Limit 1,800 calls. |
| Slalom | Six alternating, disjoint finite timing windows at z −30, −60, −90, −120, −150 and −180 m. Ordered forward swept chassis-centre passage, interpolated crossing times, corridor checks; no teleport/gate skip credit. Limit 3,600 calls. |
| Handling | Eight ordered radial gates around the authored 32 m circle, within its ±6 m corridor. Actual elapsed passage time, accumulated heading change, lateral slip and maximum lateral acceleration. Limit 3,600 calls. |

The reference acceleration uses an identical 900-call full-throttle tape for every build. Braking is a deterministic speed-threshold feedback policy. Slalom and handling use recipe-aware pure pursuit, a 12 m look-ahead and 8 m/s speed feedback. Their accepted commands can differ by build: these compare deterministic policies, and are not controlled part-only comparisons. Manual results likewise declare their actual commands. The page never substitutes reference outcomes for a manual run.

**Run reference comparisons** performs stock/current/proposed simulations in bounded asynchronous batches, separate from the paused live car. Every result includes its policy and accepted tape. These batches may finish faster than real time; normal playable driving uses animation frames and a fixed clock. Dropped wall time is disclosed separately and does not fabricate accepted ticks.

## Receipts, save and replay boundaries

Source-stamped packages export inert `circuit-overdrive.proving-receipt` version 1, bounded to 2 MiB UTF-8. A receipt identifies exact game and engine revisions, model and owned ID, installed build rules and canonical configuration, build/recipe SHA-256 digests, track/rules, seed, starting pose, command RLE, accepted tick count, crossings, terminal result and actual terminal solver state. Tests reconstruct the solver from the recorded build and re-execute the accepted commands independently. Browser comparisons and normal frame-timed driving must reproduce the same accepted result in the tested runtime.

Receipts are diagnostic evidence, not replay admission. They are not accepted by historical Replay Theatre v2–v6. CO-014E adds separate [build-bound v7 recordings and a dedicated viewer](proving-replay.md). No current garage lookup may silently replace a recorded build. The Machine Shop re-simulates temporary v7 test evidence before showing comparison metrics.

This page has no garage mutation API calls. Saving, migration, purchases and fitting remain under the existing whole-state Vault protocol in the Garage. Context loss, focus loss, hidden tabs, controller disconnect and touch cancellation pause and clear held controls; restoration requires fresh arming. No test awards currency or changes persistent condition. The pinned solver's barrier contacts do not provide a reviewed impact-energy-to-damage adapter. Persistent damage and repairs are therefore deferred, rather than assigning a repair bill after a benchmark. Existing cars remain pristine.

## Resource scope

The scene retains 18 meshes, with 9,660 facility vertices and 1,710–2,124 vehicle vertices. Recording-WebGL tests exercise eight complete construction/driving/camera/disposal cycles per model and verify uploads stay constant. These resource checks and software-browser acceptance do not establish native GPU frame-time performance. Native upgraded-workload certification and the complete Machine Shop remain CO-014F/E review gates.
