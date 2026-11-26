# CO-014E — The Machine Shop owner review

Release target: v1.4.0, still unpublished. This is the fifth of six owner-reviewed CO-014 PRs. Native GPU/endurance certification and the final release gate remain CO-014F. This branch does not approve, merge, tag or publish itself.

## Exact source

- Exact base: PR D merge `57a30486fcf8674e30486d01dea972b8981bcccd`.
- Final tested runtime: `f580e9091da2c1bb188a89b0882f7d89460c8e70`.
- Immutable VANILLAJS: `9d95d74b355ec17add32db0b55f0f71130f9c004`, unchanged and checksum-verified.
- Published v1.3.0 comparison: `1c745a90258d0f6cb968935f773354cff702b276`.
- Focused branch: `feature/co-014e-machine-shop`.
- Exact review head: Recorded in the PR after the evidence/CI-only commit. Later evidence/CI-only commits do not change the tested runtime assets; a later source stamp still identifies a different revision.

The owner reported PR D merged without issues and post-merge CI green. Its merge and current main were verified at the exact base above before E began in an isolated clean worktree.

## Delivered behavior and authority

The selected owned car now opens **The Machine Shop** inside After Hours Motor Works. It names the catalogue model, exact owned ID, accepted build rules, garage revision, credits, installed parts and this car's inventory. Nine named sections expose engine, intake, exhaust, gearbox, final drive, tyres, suspension, steering and paint. Existing part and setup controls retain their IDs, quantized ranges and transaction boundary.

Specifications describe actual compiler fields in their physical units: torque at each RPM point, gear ratios, spring/damper values, suspension lengths, tyre coefficients and steering response. They are not measured acceleration scores or horsepower badges. A proposed part/setup compiles in a private copy and displays the real supported configuration or the compiler's rejection reason. Prices, affordability and fitting rules come from the existing installation transition. Only the existing explicit confirmation and Save Vault commit can install a part or deduct credits. The proposed selector never changes the rendered accepted car.

Original rim colours/patterns follow the accepted tyre pack; the flow-exhaust pack adds original bounded tail pieces. Paint retains its original panel-colour contract. These visual representations supply no extra physical effect or hidden tuning: the compiler's tyre/exhaust fields remain authoritative. Wheel radius, wheelbase and track remain physical. In driving and playback, actual accepted wheel hubs, steering and chassis/suspension motion determine stance.

Completed driving tests can return to the shop as temporary evidence. **Verify measured tests** reconstructs the recorded inputs and build before populating the four-test stock/current/proposed table. There are no illustrative performance values before measurement. Every displayed result exposes its source, build/recipe digests, track/rules, accepted ticks and driving policy. Stock-labelled evidence must match the actual stock build. Previously measured current results become **Original build** when the saved configuration changes. Pending reconstruction cancels when selection or storage availability changes; an obsolete continuation cannot publish a table or re-enable controls after a conflict.

### Build-bound v7 recording and playback

`src/proving-replay.js` introduces the separate `circuit-overdrive.proving-replay` version 7 contract, at most **2 MiB UTF-8**. It records the exact game and engine source, model/owned ID, validated canonical build and rules, full source-bound recipe identity, track/test rules, seed, starting pose, accepted command RLE, tick count, terminal result and reconstructed full-state digest. No imported position stream supplies simulator state.

Admission compiles the recorded build, reconstructs the source-derived spawn, repeats every command and checks the terminal result and physical-state digest. Only a completely admitted immutable tape may be exported or played. The dedicated local `proving-replay.html` viewer supports Play/Pause, Restart, chase/high cameras and accepted-tick seek. Verification and seeking yield in batches of at most **120 accepted calls** and discard cancelled candidates. Playback never looks up the live garage or replaces the recorded build with newly installed parts.

Historical Replay Theatre v2–v6 and their admission rules remain separate and unchanged. The viewer rejects a diagnostic Proving Grounds receipt as a recording. Historical Theatre rejects v7 rather than reinterpreting it. Wrong source, altered identity, invented result, truncated input and unsupported schemas reject before playback. A stopped benchmark records honest non-completion; no player stop can replace a naturally terminal physical result. Matching-source reproducibility is demonstrated in the tested runtime, without a cross-browser bit-exact claim.

### Save, evidence and repair boundaries

There is **no ownership schema change or new E migration**. Current version 2 Garage/Vault state, owned IDs, four bays, balances, per-car inventory, existing 64 KiB import/export bounds, coordinated whole-state persistence and legacy backup remain in force. Actual modifications survive reload, validated export/import, selection changes and WebGL restoration because owned driving reads the accepted saved build.

The separate per-tab session key `circuit-overdrive.workshop-evidence.v1` holds at most **12 recordings / 4 MiB UTF-8**. It is untrusted, disposable test evidence, not another active garage or an ownership export. Retention and ownership are not described as a multi-key atomic operation. Cache quota/read/write failure cannot install a part, deduct money, create income or invalidate an already accepted physical result. Files remain the independent recovery path for recordings. Imported cache labels do not grant trusted stock status without reconstruction and stock-build identity checks.

All supported owned condition is pristine. The shop displays **No repairs required.** It offers no fabricated bill or repair transaction. Persistent owned damage remains deferred until a reviewed impact-energy-to-damage adapter exists; neither benchmarks nor unrelated Derby matches invent a repairable event. No race rewards, career income or championship vehicle replacement is added.

## Changed source and resource scope

New runtime modules are `src/machine-shop.js`, `src/workshop-evidence.js`, `src/proving-replay.js`, `src/proving-replay-page.js`, plus the dedicated `proving-replay.html` page. Existing changes are confined to workshop/presentation integration in `src/garage-parts-ui.js`, `src/garage-ui.js`, `src/garage.css`, `src/garage-geometry.js`, `src/garage-scene.js`, `src/proving-ground-scene.js`, `src/proving-ground-page.js` and `proving-ground.html`. Packaging and offline instructions add the local module/page closure; browser orchestration retains the existing seven-worker matrix and all historical suites while adding the Machine Shop journey to the lifecycle worker.

No competitive racing recipe, simulation, driver-command adapter, historical replay implementation, transaction authority, save format or vendor module changes. The six stock mechanical recipes and existing part mappings remain authoritative.

The showroom retains six base model packs and at most eighteen additional style variants, evicting invisible variants within the existing **149-mesh bound**. Resource tests exercise repeated model/paint/tyre/exhaust switching, reuse and disposal without unbounded retained buffers. Proving-ground and replay geometry remain retained and follow accepted physical state. These are resource-correctness checks, not native GPU timing evidence. Native frame intervals, full upgraded-workload profiling, heap/audio endurance and final release certification remain F.

## Executed checks and measured results

[Evidence index and receipts](evidence/co-014e/README.md) identify the exact commands, source, environment, screenshots, JSON downloads and retained hashes. Functional browser evidence uses Chrome **158.0.8127.36 / ANGLE SwiftShader** on Linux. It does not certify a native GPU or 60 FPS target.

| Check | Expected / actual |
| --- | --- |
| `node --test tests/*.test.mjs` | **539/539 passed**, zero failures, cancellations or skips. |
| Final Machine Shop browser | **11 scenarios passed**, zero errors, final tested runtime above. Actual purchases/fitting, stock/current measurements, nine sections, JSON round-trip, original-build playback, seek/restart/camera/reduced motion, context restoration, hostile-file rejection and in-flight stale-tab cancellation. |
| Existing Garage browser | **23 scenarios passed** on the final source, including ownership, storage faults, controller/touch safety and context restoration. |
| Existing Parts Counter browser | **8 scenarios passed** on the final source; physical fitting, costs, inventory, failed saves and preserved identity remain covered. |
| Existing Proving Grounds browser | **13 scenarios passed** on the final source, including all six free stock admissions, four benchmarks, actual engine/gearbox purchases, held-input safety, real context recovery, touch cancellation, controller lifecycle and stale admission. |
| Focused workshop/evidence tests | Existing transaction-sourced preview, same-model independence, rejected combinations, no preview payment, paint physical equality, bounded temporary cache, failure recovery, unadmitted-tape rejection and stock-label spoof rejection executed; included in final suite receipt. |
| Replay/visual tests | Full reconstruction and tamper/source rejection, bounded seek/cancellation, original recorded builds, accepted procedural styling and renderer resource bounds executed; final counts belong to the complete-suite log. |
| Direct published v1.3.0 parity | **45,225 accepted ticks matched** directly against published v1.3.0 at the exact final runtime. The full suite also passed its historical comparison. |
| `python3 tests/test_offline_release.py` | Passed independent archive/source/allowlist/tamper checks. |
| `bash tests/browser-pages-shards.sh` | Passed suite invocation, retained evidence and failure propagation with all seven workers and historical coverage preserved. |
| Standalone / HTTP | Fresh **118-file** package; all served bytes and MIME types verified under `/Circuit-Overdrive/`. |
| Fresh offline build and independent verification | Passed for `f580e9091da2c1bb188a89b0882f7d89460c8e70`; ZIP SHA-256 **`21588f6aea62ef9b0cf9305270a6c4d4575f931366ea749dddd4542ea7619996`**. |

The final production browser measures Cinder Two's normal-frame, 900-call reference acceleration at **8.105224814834376 s stock** and **7.6026815230975355 s with the actually purchased street engine**. Both use the same accepted full-throttle tape; the engine-only v7 file preserves its original exact mechanical configuration and 900 accepted ticks. The live garage is subsequently fitted with different mechanical parts and paint, yet imported playback still reconstructs the original engine-only build and result. All categories are fitted through real confirmations; the final all-fitted save retains `car-000001`, pristine condition and 360 credits, then a disclosed paid second-tab refit leaves 350. Verification and playback themselves do not alter ownership or money.

The unchanged Proving Grounds regression also measures the actually installed engine plus short gearbox at **7.5824830186320336 s**, with accepted motion and matching command tape. Other benchmark rows are displayed only after their actual tests reconstruct. Braking, slalom and handling use the declared feedback policy and may have different accepted commands across builds. Those values are not presented as controlled part-only comparisons or independently optimized performance ceilings.

## Owner play-test

1. Serve the source-stamped standalone package over loopback. Open The Garage, create or explicitly migrate it, purchase Cinder Two and select its bay. Check model, owned ID, credits, accepted configuration and **No repairs required.**
2. Inspect Engine bay and its actual torque curve. Preview a street engine and inspect acquisition/fitting cost, then cancel. Confirm the save, parts and appearance remain unchanged.
3. Drive at the Proving Grounds, Load a stock acceleration reference test, explicitly arm and finish. Return, purchase/confirm the street rebuild, then repeat using Current saved build. Check the same owned ID and measured difference.
4. Save the finished engine-only v7 recording. Run stock/current/proposed comparisons for all four tests, return to the shop and select **Verify measured tests**. Inspect values, original build/source identities and driver policies.
5. Fit intake, exhaust, gearbox/final drive, tyres, suspension and steering using their named sections and quantized setup controls. Change paint. Observe accepted original rim/exhaust/panel styling without a claimed cosmetic performance gain.
6. Reload, change inspected cars/cameras and perform validated garage JSON export/import. Confirm the same per-car parts, settings, inventory, credits and owned ID remain. Select another car and check that its own configuration is independent.
7. Open **Watch a proving recording** and import the earlier engine-only v7 file after the live car has different gearing and paint. Play/Pause, seek to a midpoint and the end, change camera and Restart. Confirm the original recorded build and accepted result remain attributable to that file.
8. Try a mismatched-source recording or diagnostic receipt and confirm rejection. During evidence verification, fit paint from a second real Garage tab; stale verification must cancel, keep controls disabled during conflict and require explicit Reload before a fresh verification.

Stop for owner review. E's completed workshop/playback slice does not substitute for F's native certification, final exact-source release checks or the owner's manual publication gate.
