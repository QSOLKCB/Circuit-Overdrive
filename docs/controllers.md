# Driving controllers

Keyboard is the initial source on each visit. Open **Controller**, press a button on the connected pad to expose it to the browser, select its slot and choose **Use this device**. Connecting another controller never transfers the driver's seat. The keyboard still works for native menu navigation.

For a standard-layout pad, release the stick, pedals and buttons. Choose **Start race**, then press the bottom face button on the grid. Drive with the left stick and triggers. D-pad moves menu focus. Left/right changes a focused selection or slider.

| Control | Xbox-style label | PlayStation-style label |
| --- | --- | --- |
| Steer, accelerate, brake/reverse | Left stick, RT, LT | Left stick, R2, L2 |
| Confirm, back | A, B | Cross, Circle |
| Pause/resume | Menu | Options |
| Camera, recover | Y, X | Triangle, Square |

These defaults require the browser's standard mapping. Device names, USB and Bluetooth transport do not select layouts. Use a loopback server or HTTPS for browser device access. A browser, permissions policy or OS can limit which devices it exposes. [W3C Gamepad API](https://www.w3.org/TR/gamepad/)

The browser polls the chosen physical slot at each fixed simulation tick. A menu can consume navigation while the race clock is stopped. Losing focus, disconnecting or changing sources clears held values. After disconnection, explicitly select the controller again, release every mapped control and then resume. A disconnected driver never inherits another slot's steering or throttle. The automatic gearbox and brake-to-reverse behaviour are shared with keyboard driving.

## Custom pads and steering wheels

Highlight a device and expand **Mapping and calibration**. Choose a generic/digital or wheel layout and start calibration. Release the controls, capture the two steering limits and centre, then capture each pedal and button while holding it. If more than one channel moved, select the observed channel to bind. The test display shows the resulting steering and pedal commands. Release the controls, choose **Save**, then **Use this device**.

A digital pad can use separate directions, two face buttons for pedals and its own confirm/pause buttons. A wheel can expose separate axes, inverted axes, analog buttons, or a combined pedal axis with opposite excursions from the same rest point. Capture the actual travel. Adjust steering deadzone, inversion, sensitivity and curve, or either pedal's travel, before saving. Wheel degrees, force feedback and native HID reports are outside the supported browser interface.

Profiles are versioned and stored on this browser only. Storage failure keeps a profile usable for the session. Unknown or incomplete layouts require calibration. Device names are matching hints for local settings; explicitly select the slot each time. Profiles never leave the browser.

## Touch driving

On a touch-capable screen select either course, tap **Start race**, then **Drive with touch** on the grid. The same source is available in the controller picker. Hold Gas or Brake with one finger and a steering arrow with another. Lift or move a finger off a control to release it. Use View, Recover and Pause beside the steering arrows. A cancelled gesture, lost capture, app switch or orientation change clears the controls and pauses active racing. Tap **Resume race**, then make fresh presses.

Landscape offers the widest road view. Portrait keeps the instrument panel and controls accessible. **Settings → Driving effects → Mobile** limits the drawing buffer to 75% in each dimension and selects reduced effects. Automatic quality selects this mode when the browser reports a coarse primary pointer. Physics and timing always use the same fixed-step update.
