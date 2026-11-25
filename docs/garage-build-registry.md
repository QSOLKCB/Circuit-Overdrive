# CO-014B — Owned builds and save migration

Each accepted owned car now has exactly `ownedVehicleId`, `modelId`, `build`
and `condition`. The ID remains the same when a build is assigned. Current
garage schema is **version 2 / machine-shop-v1 / catalogue revision 1**; all
four bay positions, credits, allocator, active selection and revision retain
their published meanings and bounds. Current-only admission is in `garage.js`.
Every build passes the [Build Forge](vehicle-builds.md) compiler before its
owned record is admitted. Recipes and source digests are derived, not saved as
user-supplied physics. Copies are deeply immutable and independent per car,
including duplicate catalogue models and intentionally shared caller objects.

B supports stock parts only. Purchases allocate an independent rules-1 stock
build. The condition record is exactly `{version:1,status:'pristine'}`. There
is no accepted persistent owned-car impact source yet; damage, wear, repair
bills and unsupported condition fields reject. Parts, tuning, installation,
physical testing, repair authority and new replay integration remain C–F.

## Deliberate same-slot transition

The migration design keeps **one active save key and one exclusive Web Lock**,
both named `circuit-overdrive.garage.v1`. The key name is retained for old/new
tab coordination; it does not imply the content remains schema 1. There is no
second active slot, key-copy sequence or claim that multiple keys are atomic.

Published storage has `{version:1,generation,sequence,garage:<v1>}`. The new
envelope has exactly `{version:2,generation,sequence,garage:<v2>,legacyBackup}`.
`legacyBackup` is null or a strictly validated canonical **v1 garage**, never
raw executable content, an arbitrary string, another envelope or a raw recipe.
It retains the first legacy ownership converted in this storage lifetime.
Ordinary transactions, reset and whole-state imports retain that backup.
The current garage and the backup can deliberately differ after later edits.
The backup is inert recovery data, not another active garage or extra inventory.

The new loader accepts explicitly supported v1/v2 envelopes. Loading v1 shows
**MIGRATION REQUIRED** with the actual validated legacy ownership still visible.
It does not write, award credits, construct an accepted v2 state or offer a
silent reset. Ordinary mutations/import/reset are blocked until migration.
Inspection and legacy export remain available. The prominent **Review garage
upgrade** action opens the existing explicit confirmation, with safe Cancel
focus and the original-save download available before commitment.

`prepareMigration()` validates a pure `migrateLegacyGarage` proposal. The pure
transition preserves exact credits, all owned/model IDs, all bay positions,
nextVehicleId, activeVehicleId, revision and catalogue revision; each car gets
an independent validated stock build and pristine condition. It does not spend
or reward money and **does not advance the garage revision**. Only the schema
changes. Migration can preserve an exhausted car allocator or garage revision.

Confirmation consumes its owner-bound, single-use ticket, then requests the
existing exclusive non-queued Web Lock. Inside its synchronous callback:

1. Check lifecycle epoch and the exact raw snapshot reviewed by the player.
2. Read and compare the **entire** current raw value; reject any difference.
3. Revalidate the v1 envelope and reapply the pure migration to its actual state.
4. Preserve generation, increment storage sequence once and embed the validated
   original ownership backup in the complete v2 envelope.
5. Validate and serialize the entire bounded envelope, perform one `setItem`,
   and require exact read-back before publishing the current state.

This is one whole-key storage replacement coordinated among cooperating tabs,
not an `fsync`, backup against disk loss or protection against deliberate edits.
Sequence exhaustion rejects migration; it never wraps or resets generation.
Repeating a completed migration rejects `migration-not-required`; a repeated
ticket rejects, and a competing migrator conflicts. No action automatically
rebases or retries after lock contention, stale state or persistence failure.

If the write fails or read-back is uncertain, the old accepted view stays
visible and further writes require explicit reload. Reload performs no write:
it discovers either intact v1 ownership or the complete v2 migration with its
backup. It never rolls back a possibly successful conversion. A corrupt or
unsupported save is left untouched; only an explicitly confirmed reset or valid
whole-state replacement after successful observation can recover such content.

## Old tabs and recovery boundaries

A v1.3.0 tab uses the same key and lock. Its previously prepared buy/reset/import
compares the complete old raw string, so a committed migration makes that
confirmation stale even if its storage event was delayed or missed. Conversely,
an old tab that buys a car after the migration review causes the new migration
ticket to conflict; explicit reload then includes that newly owned car.
Tests execute the exact published old vault code rather than a simplified mock.

An obsolete runtime **freshly loading** v2 treats it as unsupported. Its explicit
corrupt-save reset/import recovery can still replace the key after a new user
confirmation. This deliberate destructive old-client action cannot be prevented
by code that the old runtime has never loaded. Close obsolete game tabs before
conversion, keep an exported backup and use the current game afterward. This
limitation is distinct from obsolete pending confirmations, which fail closed.
No claim is made that a fresh explicitly confirmed old-client reset is blocked.

**Export original legacy backup** downloads canonical v1 ownership JSON both
before conversion and after successful reload. It does not restore an old raw
envelope. Reimporting such a file uses explicit current whole-state replacement,
with the current storage generation and an advanced sequence. Thus it cannot
restore an old raw value and revive an obsolete ticket (the ABA case). Exports
remain per-origin local files; browser eviction/user deletion can still remove
the only stored envelope and its embedded backup.

## Import/export and bounds

`validateGarage` and `parseGarage` admit current state only; neither lazily
upgrades ownership. `parseGarageImport(text)` explicitly accepts current v2 or
the supported published v1 format, returning an immutable `{state,legacy}`
proposal. Legacy files receive stock builds with every ownership/money field
preserved. The Vault publishes that replacement only after confirmation and
verified persistence. Imported credits/cars never merge with the current save.
If no prior embedded backup exists, a legacy import retains that source data.
Unknown fields, IDs, versions, builds, tuning, conditions, capacity, counters,
credits and malformed bounded JSON reject before any replacement is offered.

All JSON files and storage envelopes retain the **64 KiB UTF-8** limit, checked
before parsing. The maximum supported B garage is **1,604 bytes** (four
Evening Line cars, maximum-width counters/IDs and balances). Its complete
envelope plus maximum canonical v1 backup is **2,102 bytes**. Even a valid legacy
input padded to 64 KiB converts to the bounded canonical representation rather
than embedding all padding. Tests pin these measurements. No arbitrary byte-limit
increase or user-controlled upgrade price is introduced.

The exact published v1 registry source body is retained in `garage-legacy.js`,
with explicit legacy aliases appended. Six immutable published files and
eighteen source-derived save fixtures live in `tests/fixtures/garage-v1/`, with
source SHA and SHA-256 provenance. Ordinary fixtures originate in the old
2,400-credit economy; counter maxima are explicitly synthetic boundary inputs.
They remain outside the production allowlist. The production legacy validator
and compiler are reachable dependencies, bringing the runtime from 103 to 105
files. Existing race, championship, controller, vendor and v2–v6 replay authority
does not change. The seven-worker browser structure remains intact; its existing
Garage suite gains a real file-control legacy import/backup regression.

## Verification and owner review

Run the unchanged commands in the repository and the focused suites:

```sh
node --experimental-test-isolation=none --test tests/garage-*.test.mjs
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
```

For the real cross-version journey, serve a source-stamped v1.3.0 package and
the current package under different paths on the **same origin**. With existing
Chrome/Playwright configured, run:

```sh
node tests/browser-garage-migration.mjs http://127.0.0.1:8766/Circuit-Overdrive/ --legacy=http://127.0.0.1:8766/legacy/
```

The test buys four Cinder Two cars through published controls, selects the
fourth, cancels then confirms conversion in the current UI, checks every saved
identity/economy field, rejects an actual old-tab pending sale, reloads, exports
and imports both supported formats and exercises persistence faults. Delayed
storage notifications and storage failures are explicitly synthetic service
conditions; no owned inventory or installed part is injected. See the
[B acceptance record](co-014b-acceptance.md) for executed evidence and exact SHAs.
Owner approval and merge of B precede work on C.
