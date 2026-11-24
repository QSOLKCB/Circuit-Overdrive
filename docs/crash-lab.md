# Crash Lab — The Impact Facility

Choose **Crash Lab** from course select, choose an experiment and press **Arm controls**. Hold W or ↑ to accelerate. S or ↓ brakes and A/D steer. The centreline lines up the advertised impact without steering. After contact, try steering or braking with the damaged car. C changes view and Esc pauses. The Input menu supports touch and the first connected standard or saved-profile controller. Centre the controls before arming. Calibrate a generic device in the racing menu first.

| Test | Starting conditions | What to inspect |
| --- | --- | --- |
| 01 · The Wall | Player (0,24) facing −Z. Concrete capsule across X = −7…7 at Z = −56, radius .65 m. | Front panel and engine, rebound and normal impulse. |
| 02 · The Glancing Blow | Same start. Steel rail from (4,−36) to (−6,−78), radius .30 m. | Right-side strike, normal direction, signed slide impulse and tyre grip. |
| 03 · Two-Car Impact | Same start. Second 1,200 kg car at Z = −68, heading +Z, throttle .68; X = .10 + (seed modulo 17)/100 m. | Relative approach speed, shared damage, two separate velocities and the second car’s motion. |

The player seed is 27. The fixture camera looks down the instrumented lane. Inspection shows the car from its front quarter. The panel diagram shows damage and the four meters show remaining mechanical condition. In the two-car experiment, **Inspect chassis** switches both the view and telemetry to the opposing car. Expand **Impact and handling details** for the actual increments and remaining drive, steering, grip and damping factors. Save the replay to repeat the commands in Theatre and save the evidence JSON for the measurements. At rest, select **Reset trial** to repair and repeat the same setup. Reset also works during a run. Use the selector to change experiments.

Results report the first applicable end condition. A disabled drive ends immediately. A struck field settles below .8 m/s and .15 rad/s for each chassis, or after three seconds of post-impact driving. Crossing the painted test-pad bounds ends the run, with a distinct result for a missed fixture. A no-impact run times out at 60 seconds. A solver budget stop or filled 512-contact instrument bank ends the trial with its own status. All receipts from the last accepted tick are retained. Pausing and camera changes consume zero physics ticks.

The WebGL facility shares the original touring shell and wheels. Bounded vertex displacements compress the affected panel and lift the bonnet with front damage. The scene retains one spark mesh and suppresses flashes under reduced motion. Each experiment uses the existing gesture-activated PCM pool. Impulse selects impact pitch and strength, material controls ringing, tangential impulse controls scrape, suspension damage excites a damped tone and engine wear roughens the motor. The facility has no score. Full contact measurements use SI units. [Impact contract](crash-impact.md) · [Damage model](crash-damage.md)
