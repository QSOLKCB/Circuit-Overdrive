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
