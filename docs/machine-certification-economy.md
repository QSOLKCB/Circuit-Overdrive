# CO-014F — Economy and legacy ownership certification

The [complete economy receipt](evidence/co-014f/economy.json) records an executed run at source **`6eb0d1da9a5209b875bd064da97e74d08d6ecef2`**, using Node **v22.18.0**, Linux x64. Its declared source paths matched the committed revision (`workingTreeMatchesHead: true`), and the receipt retains their SHA-256 values. The 12,307-byte UTF-8 receipt is preserved without transformation; SHA-256 **`d394c829317c6a1eda0cc17aa7c19321cbea2d7b1937570f1ffa30fb036467bb`**.

This is development certification of the pure economic transitions, compiler admission and storage failure rules. It is not evidence that a browser was granted money, that a player earned rewards, or that a release has been approved. Native browser journeys, physical measurements and final owner acceptance have separate receipts.

## Independent generated ledger

`scripts/certify-machine-economy.mjs` executes **1,024 deterministic sequences of 24 operations**, checking the complete independent journal after every operation. Reviewed fictional purchase/resale prices, part prices and fitting costs are authored independently of the production quote and transaction helpers. The journal independently owns four ordered bay IDs, each car's model, installed parts, inventory and setup, the active ID, serial allocation, revision, cash and expenditure/sale totals.

| Executed observation | Count |
| --- | ---: |
| Operations | 24,576 |
| Accepted transitions | 12,796 |
| Rejected transitions | 11,780 |
| Accepted installations | 7,797 |
| Refits of previously acquired parts | 68 |
| Setup changes on the same fitted part | 75 |
| Rejected repeats of an accepted intent's obsolete revision | 7,797 |
| Rejected fresh-revision fits of an unchanged configuration | 7,797 |
| Sequences starting at the published 2,400-credit balance | 514 |
| Explicit synthetic 100,000-credit validator fixtures | 510 |

The synthetic opening fixtures permit premium vehicles and complete part coverage without adding any game income mechanism. They exist only in the development runner, never in a live browser save or a race-reward path. Every synthetic-rich sequence first buys two independently identified cars of the same model. All six models receive accepted fitting coverage in all nine slots; per-model/per-slot counts are retained in the receipt. The generated rejection counts include insufficient credits (3,563), unchanged fittings (585), invalid requests (1,192), unowned vehicles (4,562) and stale revisions (1,878).

After each attempted operation the runner checks unchanged input, exact accepted receipt settlement, the complete owned state against the independent journal, nonnegative bounded credits, unique bay IDs, active selection, serial history, pristine condition, save round-trip and deterministic repeated compilation of every owned build. Cash must equal opening funds minus vehicle/part/labor spending plus ordinary sale proceeds. The liquidation value of owned stock models plus cash cannot increase through any generated transition. Upgrades receive no resale refund. The journal's deterministic SHA-256 is **`cd925aab27dc663c9493f02ee60d537468d5c6414bfde62a8972832871c1bf19`**.

The six new focused tests in `tests/machine-economy-certification.test.mjs` also exercise cases beyond that generator's accepted-operation distribution:

- A Rivet Eight with competition engine and ducted intake rejects a flow exhaust that would exceed 550 Nm. No credits or exhaust inventory change, and the second same-model owned car remains unchanged. Selling the upgraded car returns the ordinary 1,080-credit model resale value, with no part refund and no ID reuse.
- Two tabs prepare fittings for **different owned cars** from the same whole-state revision. The second stale confirmation rejects after the first commits; explicit reload permits its fresh confirmation. Both cars retain independent installed parts and inventories, and each accepted bill settles once.
- An installation persists its whole paid state and then the storage service throws. Confirmation reports `write-failed`, the unverified proposal is not published to the Vault view, and further installation requires explicit reload. Reload discovers the paired 270-credit payment and street engine. It performs no automatic rollback or repeated write; both the old confirmation and a fresh unchanged fitting reject, preventing duplicate payment or a free part.

The last case deliberately models uncertain persistence completion. A failure report is not proof that the storage service wrote nothing. Recovery observes and validates the existing whole envelope rather than overwriting it speculatively.

## Published ownership and migration

The receipt independently compares all six immutable legacy JavaScript fixture files with their actual Git blobs at published v1.3.0 **`1c745a90258d0f6cb968935f773354cff702b276`**, as well as checking the fixture provenance SHA-256 values. These are the original validator, catalogue/data, transaction and Vault closure; they are not rewritten mocks. `tests/fixtures/garage-v1/` remains unchanged.

All **eighteen** source-derived ownership fixtures pass published validation, deliberate current migration and validated import/export. The fixture set covers empty ownership, every single stock model, four full bays, duplicate catalogue models with distinct IDs, sold-ID gaps, each active bay, exhausted revision/serial combinations and maximum-width valid fields. Synthetic counter boundaries are labelled in the receipt. Migration preserves exact credits, next serial, active ID, revision, catalogue references, owned IDs and four bay positions. It assigns each retained car its corresponding valid stock build and pristine condition, with no economic transaction or reward. The old ownership remains recoverable in the validated legacy backup.

The existing migration/Vault tests remain part of the full repository checks. They cover stale old-tab confirmations, quota failure, dropped writes, interrupted read-back, storage throwing after a write, exhausted Vault sequence, unsupported/corrupt legacy data, malformed backups and explicit legacy/current imports. Unreadable legacy data is not automatically erased. Reload performs no automatic rollback, repeat migration or persistence write; a migration already present after an uncertain result is discovered rather than applied again. Exhausted garage counters are preserved without wraparound, while an exhausted storage sequence cannot advance. These are retained coverage, not newly implemented migration behavior.

## Unchanged storage bounds and repair boundary

The bound measurement uses complete finite inventories, longest compatible fitted IDs, signed maximum-width tuning, four long-model owned IDs, maximum counters and credits, and a recoverable legacy backup. Each measured configuration compiles and validates.

| Data | Largest measured UTF-8 state | Existing limit |
| --- | ---: | ---: |
| Per-car build | 708 bytes | 2,048 bytes |
| Four-car Garage JSON | 3,444 bytes | 65,536 bytes |
| Coordinated Vault envelope including legacy backup | 3,942 bytes | 65,536 bytes |

No Garage or Vault limit is increased. V7 recordings and temporary workshop evidence have separate declared limits and are not another active ownership save. This work adds no multi-key atomicity claim.

The only supported owned condition remains pristine. A repair request is unsupported and rejects without changing credits or condition; the shop correctly displays **No repairs required.** This certification does not claim a repairable damage path or a performance-restoring repair. No benchmark, unrelated Derby result or generated test operation invents such damage, and no racing winnings or career income are added.

Reproduce from the declared source with `node scripts/certify-machine-economy.mjs`; run the focused cases with `node --test tests/machine-economy-certification.test.mjs`. The full repository test run also retains the original migration, transaction, installation, bounds and Vault fault suites. Final native profiling, post-merge CI/Pages checks and publication remain separate owner-controlled gates.
