# Crash Lab native performance

Chrome 158.0.8127.36 ran on the Ryzen 9 5950X, GeForce RTX 5060 Ti 16 GB, NVIDIA driver 595.99.02, Ubuntu 26.04.1 LTS and Linux 7.0.0-43-generic. Playwright 1.64.0 launched headless Chrome with native ANGLE OpenGL. The instrument panel and the verified 1920 × 1080 WebGL drawing buffer both fit in a 2320 × 1134 viewport. Keyboard events drove the extracted offline build at `14861ffb14fbacf02a3ab12d6c6fe04063e511bb` on the ordinary animation clock. [Native measurements](evidence/co-011/lab-native.json)

| Trial | Frames | Interval median/p95/worst ms | Physics p95 ms | Solver p95 ms | Worst solver time on a contact tick ms | GPU median/p95/worst ms | Peak contact candidates/tick | Resolved contacts / damage events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 · wall | 275 | 16.7/16.8/16.8 | 0.10 | 0.10 | 0.50 | 0.55/0.83/0.83 | 6 | 1 / 1 |
| 2 · glancing | 326 | 16.7/16.7/16.8 | 0.10 | 0.10 | 0.20 | 0.60/0.78/3.47 | 9 | 21 / 1 |
| 3 · opposing | 361 | 16.7/16.7/16.8 | 0.10 | 0.10 | 0.20 | 0.58/0.72/4.57 | 18 | 118 / 2 |
| 4 · wall | 274 | 16.7/16.7/16.8 | 0.10 | 0.00 | 0.00 | 0.56/0.90/4.47 | 6 | 1 / 1 |
| 5 · glancing | 326 | 16.7/16.7/16.8 | 0.10 | 0.10 | 0.10 | 0.55/0.61/3.99 | 9 | 21 / 1 |
| 6 · opposing | 361 | 16.7/16.7/16.8 | 0.10 | 0.10 | 0.10 | 0.58/0.81/8.74 | 18 | 118 / 2 |

The six trials produced 1,923 active frames, 1,917 frame intervals and 1,917 accepted simulation ticks. Each fixture ran twice. Across 280 resolved contacts there were eight damage events. The peak per tick was two physical responses and one new damage event. The two-car trials each contained a second impact after separation. Chrome’s CPU clock resolution was about 0.1 ms. A zero represents two reads within one clock interval. The GPU timer sampled every eighth draw, allowed four outstanding queries and discarded disjoint samples.

The one-car fixtures retained ten WebGL buffers totalling 844,560 bytes. The two-car fixture retained fifteen totalling 1,058,400 bytes. Each scene kept two programs and one reusable spark mesh. After a reset and revisit, buffer counts and bytes matched the fixture’s first run. The audio system reused four mono PCM buffers, peaked at three simultaneous voices and ended all 538 scheduled sources. Post-GC JavaScript heap readings ranged from 4,072,788 to 4,761,228 bytes.

## Published racing reference

The same machine ran nine timing windows of the six-car Orbital Spine workload from published v1.0.0 (`47b1a5c1562136bfd6b98ca9d4ef2ce07282200b`) and from the Crash Lab candidate. Both builds recorded 2,039 intervals, a 16.7 ms median in every window and a maximum of 16.8 ms. Section-median GPU draw times ranged from 0.77 to 1.15 ms on v1.0.0 and from 0.89 to 1.08 ms on the candidate. [Published-source timing](evidence/co-011/v100-native.json) · [Candidate timing](evidence/co-011/orbital-native.json)

Across eight course switches, each build returned to 13 WebGL buffers on every Orbital visit, allocated eight PCM buffers for the engine and stereo score, and ended all 862 scheduled sources. Peak voice count was six in both runs. These measurements cover the recorded workloads on this host. The CI browser suite uses SwiftShader for the keyboard, replay and WebGL lifecycle checks. [Published-source resource counts](evidence/co-011/v100-resources.json) · [Candidate resource counts](evidence/co-011/orbital-resources.json) · [Reproduction commands](co-011-acceptance.md#reproduce)
