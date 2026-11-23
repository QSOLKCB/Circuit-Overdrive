# World Overdrive Championship

Six entrants contest four rounds on the original courses. The Speedway events each cover three laps. Both Ridge events use the full point-to-point mountain sprint.

| Round | Event | Course | Race seed |
| --- | --- | --- | ---: |
| 1 | Overdrive Opening Cup | Overdrive Speedway | 701 |
| 2 | Redline Mountain Challenge | Redline Ridge | 702 |
| 3 | Speedway Grand Prix | Overdrive Speedway | 703 |
| 4 | Ridge Championship Finale | Redline Ridge | 704 |

All four events use daylight and play Digital Dominion. Returning to standalone racing restores the course and lighting selected before entering the championship.

The five rivals keep their original cars, numbers and driving profiles. Each event seed feeds their existing pace, line and passing preferences. The field runs on the same 60 Hz simulation as a standalone race.

## Scoring at the flag

First through sixth earn **10, 6, 4, 3, 2 and 1 points**. The player's chequered flag freezes the six-car classification. Finishers use their official times, including recovery penalties. Every rival still racing receives points for their validated position at that instant and has an empty finish time.

Ties go to the driver with more victories, then more seconds, then more thirds. Remaining ties compare finishing places from the latest completed round backwards, then the lower stable driver ID. Standings and points are always recomputed from accepted event orders.

## Results and storage

An attempt belongs to one championship ID, calendar slot and seed. Only the active race crossing its flag in a simulation step issues a settlement receipt. Settling it once freezes a new result. Restarting or abandoning an attempt discards it. Restoring progress recreates an event boundary.

The local version 1 save contains the edition, championship ID, v0.6.2 racing authority, game build revision and up to four ordered event classifications. Its limit is 8,192 JSON characters. Each row records driver ID, official finish ticks or null, and accepted recoveries. Totals and current round are derived from that history. A stamped save requires its exact build. Raw checkouts use a null build stamp and should be used for development.

One origin-local storage write replaces the complete slot. Competing writes check the previous slot under a Web Lock. A stale tab cannot overwrite a later result or a replacement championship. A player with access to browser storage can edit local data. Validation enforces the format and consistency of a save. Replay imports have no role in settlement.

## On the starting grid

Choose **World Overdrive Championship** from course select. The calendar identifies both visits to each course. Standings list all six car numbers, names and points. Start the championship, read the round briefing, then choose **Start event**. Use the same grid arming, pause, recovery and restart controls as a standalone race.

The results board shows the flag order, official times where available, each position's award, updated totals and the next round. After the fourth flag, open the trophy presentation to see the winning driver, all six totals and the four individual event boards. The chequered banner follows the device's reduced-motion preference.

## Saving, music and Replay Theatre

Progress saves automatically when you start a championship and at each chequered flag. Check the local save status on the results board before closing the tab. On the same browser, origin and build, choose **World Overdrive Championship → Continue championship** to review the latest results or resume. Reloading during a race returns to the previous event boundary. **New championship** asks before replacing the slot. A storage or quota failure leaves the competition playable in the current tab. For a conflict, open the championship menu and choose **Load saved championship** to load the other tab's progress.

**Digital Dominion** is the original 120 BPM championship score. Each round arms music with the driving controls. The trophy plays the anthem through the music slider with the engines quiet. After leaving the window, use **Play Digital Dominion** to hear it again.

On a source-stamped build, choose **Save event replay** at the flag, before starting the next round or closing the tab. Replay Theatre accepts this normal v2 single-race recording. Its filename identifies the championship, round, course and seed. The tape identifies its build and tick count. The save retains the classification, while the downloaded file retains the driving commands. Recordings over the existing 30-minute replay limit can still score championship points.
