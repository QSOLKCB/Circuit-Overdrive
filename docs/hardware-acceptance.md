# Controller and mobile hardware acceptance

Open **Controller**, choose a slot under **Input device**, then expand **Controller diagnostics**. Opening the picker during a race pauses all six entrants. **Driving input** identifies the current owner. **Connection** identifies the device you are examining. Move its controls while the timer is frozen. Return to the picker and choose **Cancel** to keep the current owner. Choose **Use this device** to change it. Either route leaves the race waiting for an explicit resume.

## Bench checks

- [ ] Record the game commit, date, device model, OS, browser version and USB or Bluetooth connection. Record the slot, reported mapping and axis/button counts before calibration. The game keeps identifiers and profiles locally.
- [ ] Release everything. Read **Axes** and **Buttons**, then compare with **Steering**, **Accelerator**, **Brake** and **Neutral**. After calibration the released values should be 0, 0, 0 and neutral. Move only one control at a time. Check both steering limits (−1 left, +1 right), full pedals (1) and return to zero. Check intermediate travel on analog controls. Record actual readings and deadzone.
- [ ] For an unknown mapping, capture the observed channels under **Mapping and calibration**. Release all mapped controls before saving. Reopen the picker after reloading and confirm the saved bindings still correspond to the same device. An unavailable reading needs a valid report or mapping before its normalized value can be evaluated.
- [ ] Preview a second connected pad. Confirm its identity/readings change while the original owner and paused timer stay the same. Disconnect the preview. Then disconnect the *active* controller under steering and throttle in a race. The race should pause with no automatic takeover. Reconnect and select the desired slot, release controls, explicitly resume, and verify fresh input is required.
- [ ] Drive and finish three laps of Speedway and the Ridge sprint. Record placement, six classification entries and lap/checkpoint splits. Use recovery once, check the three-second penalty, save that race's replay, and verify it on the matching game revision. Check pause, camera, restart and the selected course after restart.

| Physical controller | Additional checks | Local hardware result |
| --- | --- | --- |
| Xbox-style | If the browser reports a standard layout, confirm A/B, Menu, left stick and independent LT/RT. Check both triggers partly depressed and the neutral release. | Awaiting device |
| PlayStation-style | Check Cross/Circle, Options, left stick and L2/R2 against browser-observed positions. Repeat for each transport being certified. | Awaiting device |
| Generic USB pad | Capture actual indices, test centre and extremes, configure actions, and verify that steering with a pedal leaves both bindings independent. | Awaiting device |
| USB SNES-style pad/adapter | Identify axes, separate direction buttons or a shared hat. Press the same two diagonal combinations before and after calibration. Confirm digital gas, brake, pause, camera and recover on this adapter. | Awaiting device |
| Wheel and pedals | Observe centre and both wheel stops, pedal rest and full polarity. Record separate or combined axes. For a combined axis, check both opposite excursions from rest. For separate axes, test partial gas and brake together. | Awaiting device |
| Mobile Bluetooth pad | Pair in the OS, activate a button, select the exposed slot and arm neutral. Disconnect or switch to touch with a trigger held. Check explicit resume and drive with a new touch. | Awaiting device |

## Phone and tablet checks

Run the full sequence on each row. Record portrait and landscape separately. A browser with native JSON import attributes, WebGL and Pointer Events can attempt the game. Chrome shipped the required import syntax in 123 and Safari in 17.2. An unavailable Gamepad API leaves the touch path usable. [V8 import attributes](https://v8.dev/features/import-attributes) · [Safari 17.2 release notes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

| Physical platform | Conditions to record | Local hardware result |
| --- | --- | --- |
| Android phone or tablet, Chrome | OS/browser build, GPU if exposed, navigation mode, cutout, audio output and Bluetooth pad if present | Awaiting device |
| iPhone, Safari | iOS version, portrait and both landscape directions, sensor housing, home indicator and browser toolbar positions | Awaiting device |
| iPad, Safari | iPadOS version, both orientations, full-screen and a narrow multitasking window when available | Awaiting device |

1. Choose a course, tap **Start race**, wait on the stationary grid, then tap **Drive with touch**. Verify the countdown, rendered track, five opponents and responsive timer. Listen for engine audio after the gesture and silence on mute/pause. Check restart with sound enabled and disabled.
2. Hold **Gas** while steering. Lift each finger first in turn, slide a finger off its control, then repeat with **Brake**. Check that the other held control still works, touches do not scroll the race, and the car responds to a fresh press after release.
3. Rotate while holding gas and steering. With the browser toolbar visible and collapsed, check the steering, pedals, pause button, speed/gear, position, timing and minimap against the cutout and home indicator. Use **Resume race** and check the old touch has cleared. Repeat in portrait.
4. While accelerating, open the app switcher and return, lock/unlock the screen, then test an OS interruption available on the device. A retained race must wait paused with cleared controls. If the OS discarded the tab, record the cold return to the menu. Resume and drive afresh. Check the clock stayed frozen during a retained pause.
5. Complete both courses, restart, and switch courses from the pause/results menu. Try automatic and mobile quality on the same hardware. Record actual browser frame intervals, resolution, duration and course section if available. Record thermal throttling, sound interruptions or graphics/device loss if observed.

For each row record **passed**, **failed**, **unavailable** or **unverified**, the exact steps completed and any observed limitation. Keep the original replay and classification with the game revision used to verify it. An unexposed controller or an unavailable browser feature belongs in the result for that device.

## What desktop automation covers

Desktop Chromium 158.0.8127.36 on Linux with SwiftShader passed the CO-006 touch checks with emulated safe-area insets in 844 × 390 and 390 × 844 CSS-pixel viewports. The checks exercised simultaneous fingers, independent release, cancellation, 44 px hit targets, explicit resume and restart. A synthetic standard pad drove the car, then touch took ownership while its trigger stayed down. Navigating away with a pedal held produced a trusted hidden-document event, paused the race and cleared every held touch. The landscape drawing buffer measured 633 × 258 at mobile quality. One audio context opened on the touch gesture and scheduled non-silent PCM. Scheduling stopped on pause.

Linux WebKitGTK 2.52.6 loaded both courses, verified the mobile buffer (633 × 246), restored a lost WebGL context, paused and resumed, recovered and restarted through DOM-activated touch controls. That process exposed Pointer Events and Web Audio. The Gamepad API was unavailable. The physical rows above cover browser chrome, cutouts, OS app switching, audible device output, controller transport, performance and handling feel. [Controller test commands](controllers.md#reproducing-controller-checks)
