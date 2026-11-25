# CO-013C — Save Vault

The vault commits the accepted B transactions to browser-native local storage. It is implemented in `src/garage-vault.js`, with strict storage-envelope admission in `src/garage-vault-format.js`. The development fixture exercises it through actual browser buttons, downloads and file inputs. CO-013D connects it to the [production garage menu, file controls and showroom](garage-player-guide.md). v1.3.0 remains a candidate.

## Storage and coordination

The sole garage key and exclusive lock name are both `circuit-overdrive.garage.v1`. Championship (`circuit-overdrive.woc.v1`), settings and controller profiles are separate and never written by the vault. The [HTML storage specification](https://html.spec.whatwg.org/multipage/webstorage.html) warns authors against assuming a storage locking mechanism. C uses an explicit [Web Locks exclusive request](https://www.w3.org/TR/web-locks/) to coordinate cooperating contexts in the same origin/storage partition.

Every mutation requests `{mode:'exclusive', ifAvailable:true}`. Contention returns `lock-busy` immediately instead of building an unbounded wait queue. The caller must deliberately prepare and confirm again; no action is automatically retried or rebased. Inside the acquired lock, the callback is synchronous and performs:

1. Check the confirmation's owner/lifecycle and previous raw value.
2. Read the current slot and compare its **entire string** with that observed value.
3. Validate the stored envelope and current garage. Reapply the prepared B transaction against this state, or use the fully validated import/reset preview.
4. Construct a complete new envelope and serialize it canonically.
5. Write the single slot and confirm exact read-back before acknowledging success.

The accepted inventory/credits are published only after successful write/read-back. User observers receive immutable snapshots and cannot change the state attached to a returned receipt, even by reentering `load()`. Exceptions in observers do not undo a commit. All operations preserve the B money/ownership invariants.

This is coordination among this application's cooperating tabs, not protection from other same-origin code that deliberately ignores its lock. Browser storage acknowledgement is not an `fsync`, backup or guarantee against user deletion, browser eviction, disk failure or malicious local edits. No anti-cheat, authentication or financial-ledger claim is made.

## Storage envelope and replacement history

The storage-only envelope has exactly these fields:

```json
{"version":1,"generation":"0123456789abcdef0123456789abcdef","sequence":0,"garage":{"version":1,"edition":"after-hours-v1","catalogRevision":1,"credits":2400,"nextVehicleId":1,"activeVehicleId":null,"bays":[null,null,null,null],"revision":0}}
```

`generation` is a 128-bit nonce from `crypto.getRandomValues`, represented by 32 lowercase hexadecimal characters, created for a new slot or explicit recovery of malformed stored data. It identifies a storage lifetime. It is not an owned-car ID, simulation input, security signature or proof of human ownership. Car IDs still use the registry's bounded monotonic serial scheme. Missing nonce generation fails creation/recovery closed.

`sequence` is an integer 0–99,999,999. Every subsequent write increments it, including importing identical JSON or resetting an already-empty garage. Import preserves the imported garage's own revision and allocator, while advancing the local storage sequence. This prevents the apparent A→B→A situation in which an old tab's observed garage data becomes equal again after a whole-state replacement. A stale confirmation still differs from the complete envelope string. Exhaustion rejects all writes; it does not wrap, reset the sequence or silently clear the slot.

Stored envelope and imported JSON bounds are independently 64 KiB in UTF-8, checked before parsing. Storage-envelope admission rejects unsupported version/generation, unsafe counters, missing/extra/accessor fields and invalid nested ownership. One observed raw string is retained for comparison, including a corrupt value, so recovery cannot silently replace a change another tab made after the corruption was observed. The browser's existing storage quota bounds that retained raw slot; it is not exported as trusted garage data.

## Session and confirmation API

`createGarageVault()` uses browser `localStorage`, `navigator.locks`, cryptographic random bytes and the window storage event target. Injected capabilities are optional test seams, not save-controlled fields. Construction does not read or write storage. `load()` explicitly reads it and never grants starting credits automatically. An absent slot has no garage until a confirmed reset/import. Corrupt stored data stays untouched until a confirmed complete replacement.

`vault.view` is a frozen `{status, reason, state, busy}` snapshot. `state` is the last loaded or confirmed complete garage, never a proposal. Preparation methods return `{accepted:true, ticket, preview, backup}` or a rejection. `preview` contains the proposed type/state/receipt. `backup` contains the prior canonical garage JSON when one exists. D must offer this export before whole-state replacement where practical.

- `prepareTransaction(action)` admits and copies the exact B request, including its original expected revision.
- `prepareImport(text)` validates the whole bounded file before offering a replacement. Imported credits/inventory replace the old state; they never merge or add.
- `prepareReset()` proposes a new empty 2,400-credit garage under the documented recovery policy.
- `confirm(ticket)` commits only the exact owner-bound object returned by a successful preparation. Tickets cannot be reconstructed from JSON, borrowed across vaults or reused. It returns `{accepted:true,state,receipt}` only after confirmed storage success, otherwise `{accepted:false,reason}`.
- `cancel()` discards the outstanding confirmation. Only one pending ticket is retained. A new preparation, invalid import, reload, storage conflict or disposal invalidates it too.
- `exportSave()` returns `{accepted:true,text}` for the last confirmed/loaded snapshot, or `no-garage`. The text is the existing version 1 canonical garage schema, without storage generation/sequence, executable content or external paths.
- `dispose()` unregisters the storage listener and invalidates confirmations. A callback that already committed before disposal is truthfully acknowledged, but no further observer notification or mutation is allowed.

A ticket is consumed before awaiting lock acquisition. Its lifecycle and observation are checked again inside the callback, so a load/conflict/disposal while acquiring cannot apply it to a different state. Production UI must also guard asynchronous file reads against cancellation/navigation/reload before calling `prepareImport`. The development fixture uses a local read-generation token and checks file size **before** reading, then calls the bounded production parser. Canonical JSON output can be downloaded using a Blob URL which must subsequently be revoked; the fixture exercises that path.

## Status and recovery

| Status | Meaning and next action |
| --- | --- |
| `SAVED` | A valid slot was loaded or a write/read-back succeeded |
| `UNSAVED` | Not loaded, no saved garage, corrupt input, pending commitment, lock contention or an exhausted resource; inspect `reason` |
| `STORAGE UNAVAILABLE` | Storage/coordination could not be used reliably; prior confirmed state is retained after a write failure |
| `CONFLICT` | Another observed value replaced this session's snapshot; load explicitly before preparing another action |
| `IMPORT REJECTED` | File admission failed; current stored/confirmed garage remains unchanged |

After `write-failed` or `verification-failed`, further mutations require explicit reload. A failed read-back might follow a successful write, so C never rolls storage back or automatically retries that transaction. Reload discovers whether the whole purchase exists, avoiding a duplicate charge/allocation. Quota and denied access failures cannot optimistically award a car. A missing Web Locks implementation fails closed, with no weak localStorage spinlock or unlabelled memory-only downgrade.

Storage events are invalidation hints, not trusted new save data. The listener filters by key/storage area and reads the actual current value. This avoids false conflicts from delayed old events after reload. It marks a stale session `CONFLICT` and invalidates its pending ticket while preserving the old displayed state. It never silently installs newer state under an old confirmation. The locked raw-value comparison still rejects stale writes if an event was delayed or missed.

Read failure requires reload. Malformed or unsupported stored content permits explicit reset or valid import after successful observation and confirmation. Opening/revisiting, failed import, insufficient funds and storage failure never top up money. Export of a valid current snapshot remains available during conflict or a write failure, and may represent an older local view; reloading explicitly reconciles it.

## Browser boundary and verification

Persistent mutation requires Web Locks and accessible localStorage in the same origin/storage partition. Creation/recovery also requires `crypto.getRandomValues`. Use the established offline loopback server or HTTPS static hosting. Changing scheme, host, port or browser profile changes the storage location; there is no cloud synchronisation. Denied/private-mode storage and unavailable APIs fail closed. `file://` launch is not the game's supported offline delivery path.

Run Node admission/protocol tests with:

```sh
node --test tests/garage-vault.test.mjs
```

For actual two-tab checks, serve this checkout and run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/path/to/chrome \
node tests/browser-garage-vault.mjs http://127.0.0.1:8000/
```

`tests/fixtures/garage-vault.html` is explicitly a development test adapter. It invokes the actual vault module through buttons and real File/Blob APIs. Tests cover accepted purchases, another tab's stale confirmation, reload/reconciliation, sale visibility, canonical download/import, rejected files, identical-data replacement, quota/denial and interrupted read-back. Fault injection replaces browser services to exercise errors; it does not fabricate garage state or transaction results. The development fixture remains outside the shipped asset allowlist. D packages the complete garage runtime dependency closure through the production menu. Existing protected CI/workflows and racing authority remain unchanged.

The [C acceptance record](co-013c-acceptance.md) identifies executed commands, exact source and browser, screenshot/JSON receipts and their limits. No native GPU performance or full showroom journey is claimed in C. Owner review of C precedes D.
