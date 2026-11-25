# CO-014B — Build Registry owner-review record

PR B extends accepted ownership with independent stock builds and an explicit
verified v1.3.0 migration. Parts installation and the playable facility remain
C–F. No owner approval, merge, release, tag or publication is performed by the
implementation agent.

## Exact sources and changes

| Item | Exact source |
| --- | --- |
| Owner-merged PR A / B base / main at inspection | `eb3b11d50ec2c92f026455d0790a79214f525242` |
| Tested B implementation | `1f7fd70e49032dfa9a21166468571fcde63d9f08` |
| Published legacy v1.3.0 | `1c745a90258d0f6cb968935f773354cff702b276` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

The subsequent evidence commit adds only documentation/receipts. All source-bound
measurements identify the tested implementation above. The isolated worktree
began clean at the verified A merge; the user's original main checkout remains
untouched.

Production changes are `garage.js`, the source-derived `garage-legacy.js`,
`garage-transactions.js`, `garage-vault-format.js`, `garage-vault.js`,
`garage-ui.js` and the explicit package allowlist. The registry/vault/transaction
tests adapt their schema expectations while preserving coverage and the
65,536-operation independent ledger. New files add strict build-registry tests,
35 migration tests, an immutable published-source fixture closure and a real
old/current production-UI browser journey. The existing Garage browser test
gains a legacy file-control import regression within its existing CI lane.
README, roadmap, player guide and contracts explain the transition.

## Authority and preservation

The [registry and migration contract](garage-build-registry.md) specifies exact
schema, units/physical compiler boundary, old/new tab coordination, import and
backup rules. Current garage v2 owns exactly one independent compiled stock
build and versioned pristine-only condition per stable owned ID. No raw recipes,
arbitrary parts/tuning, fabricated damage, repair bills or part prices enter a
save. Same-model cars own distinct deeply frozen copies.

Expected: migration adds those records while preserving exact credits, owned
IDs, model IDs, all four bay positions, selection, allocator and garage revision.
Actual: eighteen source-derived fixtures, including empty, all six single
models, full bays, duplicate models, sold-ID gaps, every active bay and exhausted
counters preserve all those fields. Synthetic boundary inputs are labelled.
The original published validators, transactions and vault are retained byte for
byte and pinned by source SHA and SHA-256 hashes.

One existing key and lock remain `circuit-overdrive.garage.v1`. Conversion is
explicit, single-use and revalidated under that exclusive lock. One whole v2
envelope contains the new accepted garage and its canonical legacy backup.
Generation is preserved, storage sequence increments once, and garage revision
stays exact. Neither load, proposal, cancellation nor rejected confirmation
writes or rewards. Verified write/read-back precedes publication. Unknown write
completion requires explicit reload, with no rollback or automatic retry.

Current stock saves measure at most **1,604 bytes**; complete storage with the
maximum retained canonical legacy backup measures **2,102 bytes**. Both remain
under the unchanged **64 KiB UTF-8** bound. Valid 64 KiB padded old inputs
canonicalize safely. Invalid and unknown-schema content is not automatically
erased. Backup export never restores an old raw envelope or revives stale tickets.

## Actual browser journey

The new runner loads an independently packaged exact v1.3.0 runtime and the
current package at different paths on one browser origin. It creates a garage,
buys four Cinder Two cars and selects the fourth using actual published controls.
The current game shows those actual legacy cars read-only, permits export and
cancel, and commits only after **Confirm garage upgrade**.

After migration, IDs `car-000001` through `car-000004` remain in their original
bays, credits remain **0**, allocator remains **5**, active ID remains
`car-000004` and garage revision remains **5**. Envelope generation is identical
and sequence advances from **5 to 6**. Each car has its own accepted stock build
and pristine condition; the embedded/exported original exactly matches the old
garage. Reload does not write or remigrate.

An actual old-tab pending sale conflicts after conversion even when its storage
event is deliberately suppressed. Separate genuine old-file imports set up
quota/read-back fault cases through native file controls. Quota leaves original
storage intact; uncertain read-back leaves the old UI snapshot until reload
discovers the complete committed conversion. Both recovery paths commit once.
Current/legacy exports and imports round-trip without merging balances or cars;
an invalid engine part import rejects without a write.

Service faults and missed notifications are synthetic and disclosed; owned
inventory and valid transition outcomes are never injected. See the
[evidence index](evidence/co-014b/README.md) and exact
[verification record](evidence/co-014b/verification.json).

## Executed checks

| Check | Actual result |
| --- | --- |
| `node --test tests/*.test.mjs` | 429 passed, 0 failed; 278.107 s |
| Focused Garage suite | 96 passed, including 10 new registry and 35 migration tests |
| Independent generated transaction ledger | All 65,536 operations retained |
| Historical v1.0.0 full-state comparison, in complete suite | 45,225 matching ticks |
| Direct published v1.3.0 comparison | 45,225 matching ticks |
| Actual old/current browser migration | 6 scenarios, zero errors or external requests |
| Expanded production Garage browser suite | 23 scenarios and 17 rejected imports passed |
| Packaged game browser smoke | Passed, including WebGL/audio failure paths |
| Offline reproduction unit test | 1 passed |
| Seven-worker orchestration/failure propagation | Passed |
| Standalone/offline package | 105 runtime files byte-equal; independent ZIP rebuild matched |

The separately retained stock receipts reproduce Cinder Two's 8.105 s 0–100
km/h and the other five accepted stock outcomes with no physical recipe change.
Full receipts declare threshold policy, source, rules, commands, ticks and limits.

## Physical, replay, resource and delivery boundaries

This PR changes ownership admission, not the physical stock specifications.
The six stock recipes and Build Forge compiler remain unchanged from A; the
same fixed-step support, acceleration, shifting, braking, steering and contact
tests run in the complete suite. Source-bound stock measurement receipts are
retained for this implementation. No upgrade or improved performance is claimed.

Established racing, championship, command, damage and vendor authority remains
unchanged. Published v2–v6 replay formats and source admission remain unchanged.
No new replay contract is introduced. Historical and direct published-v1.3.0
full-state comparisons retain the 45,225-tick workload each.

The runtime is **105 files**, adding the reachable compiler and legacy validator
to the explicit local allowlist. Fresh standalone bytes match the independently
verified offline ZIP. The existing seven-worker browser architecture and its
historical coverage remain intact; orchestration tests and the existing Garage
entrypoint retain their role. Full matrix and post-merge/public checks remain
owner/CI gates.

Software Chrome 158 checks native ES modules, real browser storage/file/Web Locks,
graphics restoration and input lifecycle. Eight catalogue cycles retain **42**
live buffers with no switching uploads; closed/restored lifecycle accounting
ends at **0** retained buffers. These are actual bounded resource observations,
not native GPU/frame-time or upgraded-facility certification. Native physical
workload profiling belongs to D/F and cannot inherit old showroom timings.

## Owner review and limitations

The new loader blocks ordinary mutations until known legacy ownership is
converted. Old pending confirmations fail closed. A **fresh explicit reset or
import in an obsolete runtime** can still deliberately overwrite unsupported
current content; new code cannot change an already loaded old implementation.
Close obsolete tabs and export backups. The current ownership export omits
embedded storage history; export the original legacy backup separately when
moving both snapshots to another browser/origin. Browser deletion or eviction
can remove the single envelope and its backup.

1. Inspect the exact migration protocol and fixture provenance, including the
   old-runtime destructive recovery boundary and uncertain-write behavior.
2. Run `node --experimental-test-isolation=none --test tests/garage-*.test.mjs`.
3. Open an old/current same-origin pair using the documented browser runner,
   or buy four cars in v1.3.0 and review/cancel/confirm the new Garage prompt.
4. Compare all IDs, bay positions, balance, active selection, allocator and
   revision. Export current and original files, reload, and reimport deliberately.
5. Inspect the independent old-tab and failure-path receipts; verify no upgrade,
   damage or fictional earnings were granted.
6. Review and accept/request changes to B. Owner merge and retargeting precede C.
