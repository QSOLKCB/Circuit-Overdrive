# Driving controllers

Keyboard is the initial source on each visit. Open **Controller**, press a button on the connected pad to expose it to the browser, select its slot and choose **Use this device**. Connecting another controller never transfers the driver's seat. The keyboard still works for native menu navigation.

For a standard-layout pad, release the stick, pedals and buttons. Choose **Start race**, then press the bottom face button on the grid. Drive with the left stick and triggers. D-pad moves menu focus. Left/right changes a focused selection or slider.

| Control | Xbox-style label | PlayStation-style label |
| --- | --- | --- |
| Steer, accelerate, brake/reverse | Left stick, RT, LT | Left stick, R2, L2 |
| Confirm, back | A, B | Cross, Circle |
| Pause/resume | Menu | Options |
| Camera, recover | Y, X | Triangle, Square |
| Nitro Skyway drift, boost | LB, RB | L1, R1 |
| Orbital assist, boost | LB, RB | L1, R1 |
| Orbital dodge | D-pad left / right | D-pad left / right |

These defaults require the browser's standard mapping. Device names, USB and Bluetooth transport do not select layouts. Use a loopback server or HTTPS for browser device access. A browser, permissions policy or OS can limit which devices it exposes. [W3C Gamepad API](https://www.w3.org/TR/gamepad/)

The browser polls the chosen physical slot at each fixed simulation tick. A menu can consume navigation while the race clock is stopped. Losing focus, disconnecting or changing sources clears held values. After disconnection, explicitly select the controller again, release every mapped control and then resume. A disconnected driver never inherits another slot's steering or throttle. The automatic gearbox and brake-to-reverse behaviour are shared with keyboard driving.

## Custom pads and steering wheels

Highlight a device and expand **Mapping and calibration**. Choose a generic/digital or wheel layout and start calibration. Release the controls, capture the two steering limits and centre, then capture each pedal and button while holding it. If more than one channel moved, select the observed channel to bind. The test display shows the resulting steering and pedal commands. Release the controls, choose **Save**, then **Use this device**.

A digital pad can use separate directions, two face buttons for pedals and its own confirm/pause buttons. A wheel can expose separate axes, inverted axes, analog buttons, or a combined pedal axis with opposite excursions from the same rest point. Capture the actual travel. Adjust steering deadzone, inversion, sensitivity and curve, or either pedal's travel, before saving. Wheel degrees, force feedback and native HID reports are outside the supported browser interface.

Profiles are versioned and stored on this browser only. Storage failure keeps a profile usable for the session. Unknown or incomplete layouts require calibration. Device names are matching hints for local settings; explicitly select the slot each time. Physically identical units reporting the same ID and layout can share calibration. Active ownership still belongs to the explicitly selected slot. Profiles never leave the browser.

### Nitro bindings

On Nitro Skyway the keyboard uses **Space** for drift and either **Shift** for boost while the racing canvas owns focus. The standard gamepad uses its two shoulder buttons. Hold either control for as many physics ticks as intended. Release every mapped control before arming the grid or resuming a paused gamepad race.

For a custom pad or wheel, open **Mapping and calibration → Button assignments**, choose **Nitro drift** or **Nitro / Rocket boost**, then capture the neutral and pressed endpoints for that assignment. Save the profile and select the device.

### Rocket bindings

On Orbital Spine, hold **Space** for magnetic and airborne assistance and **Shift** for boost. Press **Q** to dodge left or **E** to dodge right in flight. Both directions held together produce a neutral dodge command. The selected standard pad uses LB/RB and the horizontal D-pad. The touch layout has separate Assist, Boost and two directional Dodge buttons. Release the dodge before requesting another.

Custom layouts can capture **Rocket assist**, **Rocket dodge left** and **Rocket dodge right**. The boost assignment serves both disciplines. Release the pedals, buttons and steering before saving or arming the grid. Loading a version 1 or 2 profile preserves its saved assignments. Version 1 starts with unassigned boost, and both older formats start with unassigned assist and dodge. The next explicit save writes version 3.

## Touch driving

On a touch-capable screen select either course, tap **Start race**, then **Drive with touch** on the grid. The same source is available in the controller picker. Hold Gas or Brake with one finger and a steering arrow with another. Lift or move a finger off a control to release it. On Nitro Skyway, separate Drift and Nitro buttons sit above the pedals. Each finger holds its own control, including when steering and accelerating together. Use View, Recover and Pause beside the steering arrows. A cancelled gesture, lost capture, app switch or orientation change clears the controls and pauses active racing. Tap **Resume race**, then make fresh presses.

Landscape offers the widest road view. Portrait keeps the instrument panel and controls accessible. **Settings → Driving effects → Mobile** limits the drawing buffer to 75% in each dimension and selects reduced effects. Automatic quality selects this mode when the browser reports a coarse primary pointer. Physics and timing always use the same fixed-step update.

## Compatibility and evidence

| Platform / input | Implementation and executed evidence | Physical coverage |
| --- | --- | --- |
| Keyboard, desktop | Original WASD/arrow bindings. Chromium drove the complete Speedway and Ridge races through DOM key transitions. Focus loss, off-window release, pause and restart are covered. | Automated desktop-browser input |
| Xbox-style standard pad | The browser's standard mapping selects stick X, analog triggers, face buttons and D-pad. Synthetic reports drove the installed Chromium browser, including unplugging while accelerating and steering. | Xbox hardware unverified |
| PlayStation-style standard pad | Same standard mapping uses positional equivalents. Tests vary identifiers and include anonymous names. | PlayStation hardware unverified |
| Generic USB and SNES-style | The DOM wizard captured arbitrary digital directions and pedals, conflicting movement, remaps, neutral save and reload from synthetic device reports. Discrete hats can learn observed cardinal values and ignore unmapped diagonals. | USB adapters and physical retro pads unverified |
| Steering wheels | Asymmetric steering, separate pedals, analog buttons, decreasing travel and shared-axis pedals are covered. The DOM wizard calibrated synthetic combined pedals. | Physical wheels, pedal ranges, vendor drivers and paddles unverified |
| Android touchscreen | Desktop Chromium used its touch input pipeline, including simultaneous fingers, independent releases, moving off a pedal, gesture cancellation, rotation and layout checks at 844×390 and 390×844 CSS pixels. | Android hardware and mobile frame times unverified |
| iPhone and iPad | Linux WebKitGTK 2.52.6 loaded WebGL and both JSON courses, armed and paused races through the touch UI and cancelled input on pagehide. The mobile layout uses safe-area insets. | Desktop WebKit testing. Mobile Safari, notches and physical iOS interruptions unverified |
| Mobile Bluetooth pad | The ordinary slot picker and neutral arming apply when the browser exposes the device through the Gamepad API. | Bluetooth pairing and mobile browser exposure unverified |

The page requires native JSON import attributes and WebGL. WebKit added JSON import attributes in Safari 17.2 and Pointer Events in Safari 13. An older browser that cannot parse the track modules keeps a visible startup explanation. Web Audio is optional and can fail independently. Gamepad access is capability-detected. The Linux WebKitGTK process used for these checks had no Gamepad API, and touch selection remained usable. [WebKit import attributes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) · [WebKit Pointer Events](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)

The wheel path uses the Gamepad API only. The game has automatic gears. WebHID, force feedback, vibration, native wheel drivers and device-specific brake or clutch reports have no implementation in this release.

## Reproducing controller checks

Run the repository's Node tests, start an HTTP server and set `PLAYWRIGHT_MODULE` and `CHROME_BIN` to an installed development browser driver and Chromium. These are validation dependencies only.

```sh
node --test tests/*.test.mjs
node tests/browser-gamepad.mjs "$URL"
node tests/browser-profiles.mjs "$URL"
node tests/browser-lab.mjs "$URL"
node tests/browser-touch.mjs "$URL"
node tests/browser-finish.mjs "$URL" --input=standard --software-replay
node tests/browser-finish.mjs "$URL" --input=wheel --ridge --software-replay
/usr/bin/python3 tests/browser-webkit.py "$URL"
```

The finish runner also accepts `--input=digital` and `--input=touch`. The optional Linux WebKitGTK test needs GTK 4, WebKitGTK 6, Python GI and a graphical session. For comprehensive keyboard and controller checks of the static package, run `bash scripts/browser-pages.sh "$URL" /tmp/circuit-browser-evidence`.

For a physical device, follow the lab procedure and record the result for that specific OS, browser and connection. [Hardware and mobile acceptance](hardware-acceptance.md)

## Race and replay verification

The same race driver exercised each input family on the packaged Speedway and Ridge courses. The standard pad and wheel runs included 60 partial-throttle ticks to check analog values through the browser and replay export. The wheel and digital runs used saved calibrations. Touch runs sent events through Chromium's touch pipeline at the coordinates of the on-screen controls. The downloaded replay contains the seed, course, normalized driving values and accepted recoveries. The Node playback checks every finisher's official ticks, order, penalties and the player's splits.

[Per-course controller results and classifications](evidence/co-005/race-matrix.json) · [Landscape touch HUD](evidence/co-005/touch-landscape.webp) · [Portrait touch HUD](evidence/co-005/touch-portrait.webp)
