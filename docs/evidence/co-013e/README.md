# CO-013E source-bound evidence

Tested implementation: `66db7fee84d389f152ef53b6801e4b51031fd0ef`. These are actual production-page captures and local downloads from the independently verified offline ZIP. No valid ownership or money was injected.

[Full candidate acceptance](../../co-013-acceptance.md) · [Native timing methods/results](../../garage-performance.md)

## Native garage journey

`native-browser.json` records Chrome/renderer identity, all 18 scenarios, 17 invalid-file cases, resource observations, 24 screenshot hashes and nine actual downloaded save files. Only the native journey images are duplicated here; CI retains its separately generated software captures.

| Capture | SHA-256 |
| --- | --- |
| [empty-garage.png](empty-garage.png) | `9cceed7ce75e297402a76e164d44fc6d919a71300a709a4ffaa83768077a941d` |
| [catalogue-starter.png](catalogue-starter.png) | `bc1546e8f888a08b6b94d4f74ecb4ca322749fdfbf8ea9da34c87010ad9cd85d` |
| [purchase-confirmation.png](purchase-confirmation.png) | `683360ed3946918c50a5ae7087551627a86925d4397c670182816a62ded584ee` |
| [first-owned-bay.png](first-owned-bay.png) | `d8a05a318328f0ca1dc38156148f62d03f040cd623c378b9e3459190dc53d109` |
| [insufficient-credits.png](insufficient-credits.png) | `73187e978e669617428e8b03bc1549d56725e5958c6eee31052f245f5b21d59a` |
| [four-bays-front.png](four-bays-front.png) | `26284359877c1cbeea3cacd6ab8f9aae00d500aabcf9f0ed0c141256ed75f927` |
| [four-bays-full.png](four-bays-full.png) | `70b7f0941ccf2eddb17d4eb7d35e33ed2d2925d8f5c0c65f71ce0316e9096cb1` |
| [successful-sale.png](successful-sale.png) | `fe5f116049b4af467b7c85c5778f933ae275f71946832d9697083c9b0082c079` |
| [save-export.png](save-export.png) | `0bcf6c4dcc4e5e1ff1ff42c8e375827a9caeef0f9fd075210db25810bf04e2f7` |
| [recovered-save.png](recovered-save.png) | `495822380d68b8569d1d127bc92e3270bd14bdccc449a8aea7ea5ea9ecb0ecd4` |
| [invalid-import.png](invalid-import.png) | `d2d11d9118e1e4fb2dff4ca0d18ad349bd7f782dc56b0236deeef4db8d83d45a` |
| [showroom-cinder-two.png](showroom-cinder-two.png) | `3eaf93d171279c0b4a11e6f99b6a71e89533b17114d7f709469bb3d9bf42b331` |
| [showroom-lilt.png](showroom-lilt.png) | `a27beee205bea742a707b8a30903db4ac17d80e2b7517112b88b1919fc424222` |
| [showroom-evening-line.png](showroom-evening-line.png) | `bc93c1a820dd5dadad532061632a326769c345f9844fb29ea6a7f25d1e7d7eca` |
| [showroom-rivet-eight.png](showroom-rivet-eight.png) | `874e34d96a9ba86bb5cd18dc6436d3eb4952ea14ae3b483eea9c626a9c1b1856` |
| [showroom-yardhand.png](showroom-yardhand.png) | `ae98a4a72f86b2def46879e75252977a1771cde85a64d14add9b646908ade712` |
| [showroom-glass-comet.png](showroom-glass-comet.png) | `8e491d49bb2201a4365be8d71212a6413e5252caddfb6a979803305d986ae913` |
| [stale-tab-conflict.png](stale-tab-conflict.png) | `1190fbb6a5ce535d4f81cf24661492601d2cdf330ffe2ca26ade85fb818fb8b6` |
| [premium-owned-car.png](premium-owned-car.png) | `a77407db56b07f3e0ef68b347e2821faee29d863c6eadfc26e67516ab1137c38` |
| [multiple-owned-models.png](multiple-owned-models.png) | `b446d0bbdc4d8be478fecd67d5839da770edbad0d76ea660f7d75f71555e9cef` |
| [last-car-sold.png](last-car-sold.png) | `2807de2b7016af7de24d61bd0c1fedd93ee61a87935ccaec45b03db34aea7595` |
| [corrupt-save-recovered.png](corrupt-save-recovered.png) | `6f43ed169aee5a7cfbac276266395802e591eb27e0ac2d92ee97da241c6d7c0c` |
| [mobile-purchase-controls.png](mobile-purchase-controls.png) | `6fa945697155c731612f881938ef05b214570a873c8aa1983d155f9c643bf137` |
| [mobile-owned-garage.png](mobile-owned-garage.png) | `94a812d09ec4030961446aee9ac39afe32055e0cade9db7d400b9e04eb5542ea` |

## Exported local files

These files came from actual browser downloads during accepted transactions and whole-save replacement tests. They are inert fictional garage data, not identity authentication or replay results.

| File | Browser filename | SHA-256 |
| --- | --- | --- |
| [download-01.json](download-01.json) | circuit-overdrive-garage.json | `b6d9871f46f69fe1d07789a0e29115e70c9edbce566033d00c7dc5657689b6cd` |
| [download-02.json](download-02.json) | circuit-overdrive-garage-before-replacement.json | `b6d9871f46f69fe1d07789a0e29115e70c9edbce566033d00c7dc5657689b6cd` |
| [download-03.json](download-03.json) | circuit-overdrive-garage.json | `b6d9871f46f69fe1d07789a0e29115e70c9edbce566033d00c7dc5657689b6cd` |
| [download-04.json](download-04.json) | circuit-overdrive-garage.json | `3078fa3d5aa7f38355148b4f05196ca247fdb45c9edfcfeb61834fb49d295b3b` |
| [download-05.json](download-05.json) | circuit-overdrive-garage.json | `1d118e837a6f39e46e30dec4c4fe451e3f5d160dbaa433b7b0027ed07ee74366` |
| [download-06.json](download-06.json) | circuit-overdrive-garage.json | `31522821f2845e8588c2aac9f4713050da18e2d262236521521da9b47aeb43ad` |
| [download-07.json](download-07.json) | circuit-overdrive-garage.json | `31522821f2845e8588c2aac9f4713050da18e2d262236521521da9b47aeb43ad` |
| [download-08.json](download-08.json) | circuit-overdrive-garage.json | `31522821f2845e8588c2aac9f4713050da18e2d262236521521da9b47aeb43ad` |
| [download-09.json](download-09.json) | circuit-overdrive-garage.json | `31522821f2845e8588c2aac9f4713050da18e2d262236521521da9b47aeb43ad` |

## Native performance

`native-performance-run1.json` and `native-performance-run2.json` contain raw intervals, CPU/GPU samples, actual viewport/framebuffer dimensions, resource ledgers and every post-GC memory sample. `garage-native-1080p.png` is the actual first-run full-bay view; both runs emitted the same screenshot hash. The scripts observe unchanged runtime modules and preserve the accepted save. See the performance guide for timing boundaries and why idle callbacks are not full scene redraws.

## Source and package

`source-isolation.json` compares 85 unchanged existing source/vendor/track files against v1.2.0 and records the reviewed main-menu adapter separately. No runtime changed from accepted PR D. `offline-package.json` records the independently rebuilt ZIP SHA-256 and equality of all 103 runtime files to the separate static package. Final verification and browser-lane receipts are described in the acceptance record.


## Executed verification and browser matrix

[verification.json](verification.json) records all 360 passing Node tests,
both 45,225-tick legacy comparisons and packaging/orchestration checks.
[browser-matrix.json](browser-matrix.json) indexes all seven executed browser
lanes, their exit codes and SHA-256-bound logs in `browser-lanes/` (20 suites).
The independent software-rendered garage run is retained in
[software/garage-browser.json](software/garage-browser.json); its separate
captures/downloads remain in the execution artifacts rather than duplicating
the native images above. All runs identify the same tested implementation.
