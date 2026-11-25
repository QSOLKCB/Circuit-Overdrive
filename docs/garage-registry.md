# CO-013A — The Vehicle Registry

After Hours Motor Works begins with an original catalogue and a pure ownership schema. CO-013A merged as PR #55. [CO-013B](garage-transactions.md) now supplies pure purchase/sale/selection authority against this unchanged schema. Storage and the playable showroom remain owner-reviewed stages C and D. Stage E certifies the complete experience. v1.3.0 remains a candidate.

## Original catalogue, revision 1

| Model ID | Display name | Cosmetic body style | Stock finish | Fictional credits |
| --- | --- | --- | --- | --- |
| `cinder-two` | Cinder Two | Starter coupe, square nose and cream roof | Kiln Red | 600 |
| `lilt` | Lilt | Compact hatchback, upright tail and belt stripe | Mint Wire | 900 |
| `evening-line` | Evening Line | Grand tourer, sweeping roof and copper side band | Deep Hour | 1,400 |
| `rivet-eight` | Rivet Eight | Broad muscle silhouette and raised bonnet centre | Furnace Ochre | 1,800 |
| `yardhand` | Yardhand | Utility pickup, square cab and open bed | Workshop Teal | 1,200 |
| `glass-comet` | Glass Comet | Premium sports coupe, wedge nose and broad canopy | Violet Current | 2,400 |

These are original cosmetic designs. Prices do not measure horsepower, grip, acceleration, speed or collision strength. No garage model is connected to an existing racing recipe. Mechanical damage remains inside its originating Crash Lab or Derby event. The `visualModel` identifiers reserve six bounded presentation styles for D; they are not executable paths or claims that the showroom already renders them.

`src/garage-catalog.js` validates and deeply freezes the six records, including each nested `finish`. Each has exactly `modelId`, `displayName`, `description`, `bodyStyle`, `finish`, `purchasePrice`, `resalePolicy`, `visualModel` and `catalogRevision`. `finish` has exactly `name`, `body` and `accent`. Colours are lowercase `#rrggbb`. Names and finish names are 1–48 printable ASCII characters; descriptions are 1–240, with no leading/trailing whitespace or angle brackets. Model IDs are 1–48 lowercase identifier characters starting with a letter. IDs and display names are unique. Body-style/presentation pairs are an explicit finite mapping, with no URL, module loader or script support.

Authored catalogue admission allows 6–24 models and requires at least one affordable starter. Passing `validateGarageCatalogue` does not register arbitrary user models. `garageModel` and ownership admission resolve only the built-in revision. Adding models or changing accepted prices requires a catalogue revision and explicit compatibility review. Future Forge definitions need a separately reviewed format.

The `stock-60-v1` resale contract is `floor(purchasePrice * 3 / 5)` from the immutable catalogue, using integer operands within the safe range. B implements and tests sales. No resale claim is read from an owned-car record. A 600-credit starter allows four legitimate purchases from the 2,400-credit initial balance. Every catalogue model is individually affordable from that balance. Actual earning, repairs and upgrades belong to later milestones.

## Ownership schema, version 1

Canonical empty state, including property order:

```json
{"version":1,"edition":"after-hours-v1","catalogRevision":1,"credits":2400,"nextVehicleId":1,"activeVehicleId":null,"bays":[null,null,null,null],"revision":0}
```

| Field | Admission contract |
| --- | --- |
| `version` | Exactly `1` |
| `edition` | Exactly `after-hours-v1` |
| `catalogRevision` | Exactly `1` |
| `credits` | Integer 0–99,999,999 |
| `nextVehicleId` | Integer 1–1,000,000, with the final value marking exhaustion |
| `activeVehicleId` | Existing owned ID when occupied; exactly `null` when empty |
| `bays` | Exactly four explicit slots, in persistent bay order |
| `revision` | Integer 0–99,999,999 |

Each occupied bay contains exactly `{"ownedVehicleId":"car-000001","modelId":"cinder-two"}`. There is no parallel inventory that could leave an inaccessible vehicle. Empty slots contain `null`; selling must leave the slot empty rather than shift the other bays. Multiple instances of a model are valid, but each owned ID can appear only once. IDs are `car-` followed by six digits representing serials 1–999,999. Every present ID must be less than `nextVehicleId`. Gaps represent previous allocation history and remain valid, even in an empty garage. `vehicleId` formats an admitted serial without allocating it.

The allocator must never move backwards on a transaction, even after the last car sells. At 1,000,000, future purchases must reject identity exhaustion. At maximum revision, future mutations must reject revision exhaustion rather than wrap. These are transition obligations for B. A snapshot validator cannot prove historical monotonicity or previously committed payments. It checks structural invariants without inventing transaction history. A confirmed reset or import in C is an explicit whole-garage replacement, not a source of additional cash within the existing state.

`createGarage()` returns a fresh immutable empty state with 2,400 credits and no free car. It is a constructor, not an implicit top-up on entering a future menu. B/C must implement the documented explicit reset/recovery path. There is no current browser storage access, reset UI, persistence claim or commitment protocol.

## Data boundary

`validateGarage(value)` accepts plain or null-prototype records and ordinary dense arrays, then returns a new canonical deeply frozen copy. It rejects missing/extra fields, symbol keys, nonenumerable properties, accessor-backed fields, exotic prototypes, sparse arrays, invalid IDs, unknown models and fractional, negative, non-finite or unsafe numbers, including negative zero. `src/garage-data.js` reads own property descriptors so validation never calls input getters, iterators or `toJSON`. Caller objects are neither frozen nor mutated, and no accepted nested record aliases them.

`serializeGarage(value)` validates before emitting deterministic compact JSON. Record insertion order does not change output; bay order intentionally does. `parseGarage(text)` checks both character length and UTF-8 bytes against 65,536 before JSON parsing, then applies complete schema validation. Unsupported formats fail clearly. All functions throw `TypeError`, `RangeError` or JSON `SyntaxError` on invalid admission. They never silently repair input or substitute a new funded garage. B will add explicit accepted/rejected transaction results.

The import boundary is inert JSON text. JavaScript Proxies or a compromised execution realm are not an untrusted-code sandbox. Locally edited saves can still describe any structurally valid garage; this format authenticates neither ownership nor an economic history. No checksum or signature claim is made. C must validate a complete replacement before confirmation and coordinate persistence under an exclusive lock with a comparison against the last observed stored value.

## Separation and provenance

Published baseline and inspected main are both `e12665b04609f40d452084a37264756a23d730da` (v1.2.0). VANILLAJS stays at `9d95d74b355ec17add32db0b55f0f71130f9c004`. The pinned vehicle, collision, math and LitRenderer source contracts were inspected. This registry needs no engine imports or new dependencies. Existing championship, replay v2–v6, input, physics and damage source remains unchanged.

The current STREET-RACER reference was inspected at [`03c038c401b3dada8646aa0c5791617d09683b00`](https://github.com/QSOLKCB/STREET-RACER/tree/03c038c401b3dada8646aa0c5791617d09683b00), including `js/catalog.js`, `js/core.js`, `js/ui.js`, `js/app.js`, `LICENSE` and `docs/PROVENANCE.md`. Its original code is Apache-2.0. The four-bay limit, modest starting credits, bounded integer money, separate model/instance identity and monotonic allocator informed this independently written implementation. No donor source, vehicle names, driving recipes, career rewards, rendering, dependencies or assets were copied. Its shallow catalogue freezing, permissive unknown-field admission and best-effort post-action storage are not suitable garage transaction guarantees.

The existing championship uses `circuit-overdrive.woc.v1`, Web Locks and a compare-against-last-observed storage value. C must use a separate key and preserve championship/settings/profile saves. Garage compatibility is schema/catalogue-based; it does not relax exact-source replay or championship rules.

The static package requires all allowlisted files to be reachable from `index.html`. These pure modules have no browser importer yet and intentionally stay outside that allowlist in A. D must include the complete new dependency closure when connecting the UI. This PR's shipped runtime remains byte-identical to published v1.2.0 before normal source stamping.

## Review

Run `node --test tests/garage-registry.test.mjs` and inspect the catalogue and canonical JSON above. The [A acceptance record](co-013a-acceptance.md) lists its executed checks. The [B contract](garage-transactions.md) defines the reviewed transition and retry boundary. Browser purchases, stale-tab safety, showroom rendering and native performance remain later acceptance gates.
