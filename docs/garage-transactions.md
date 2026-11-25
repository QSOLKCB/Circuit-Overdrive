# CO-013B — Transaction Engine

The garage's pure transaction authority is `src/garage-transactions.js`. It uses the accepted [version 1 registry and catalogue](garage-registry.md) without schema changes. Every accepted result contains one complete new state and a small inspection receipt. No operation changes the caller's state or performs storage, rendering, network or racing work.

## Request and result

```js
import {createGarage} from './src/garage.js';
import {transactGarage} from './src/garage-transactions.js';

const previous = createGarage();
const intent = {type:'buy', targetId:'cinder-two', expectedRevision:0};
const result = transactGarage(previous, intent);
// result.accepted === true; result.state.credits === 1800
// result.state.bays[0].ownedVehicleId === 'car-000001'
// previous still has 2400 credits and four empty bays.
```

An action has exactly three enumerable own data fields. `type` is `buy`, `sell` or `select`. `targetId` is a nonempty string of at most 48 characters, resolved as a built-in model ID for purchases or an owned ID for sales/selections. `expectedRevision` is an integer 0–99,999,999 and must equal the admitted current state revision. Unknown fields, symbols, accessors, hidden fields, exotic prototypes and non-integer revisions reject without invoking caller code. Requests contain no price, resale value, discount, destination bay, replacement state or currency award.

Accepted results are deeply frozen and contain exactly `{accepted:true, state, receipt}`. The receipt has `type`, `fromRevision`, `toRevision`, `ownedVehicleId`, `modelId`, `bayIndex`, `creditsBefore`, `creditsAfter` and `creditDelta`. Bay indices are zero-based. Receipts are inspectable output; no API admits a receipt as a request or trusts one as proof of payment.

Rejected results contain exactly `{accepted:false, reason}`. They contain no new state or receipt. Every rejection preserves the input, including its revision and allocator. Query helpers `garageBalance(state)` and `garageResaleValue(modelId)` return integers and throw on invalid input. The latter quotes the immutable catalogue policy; it does not establish ownership or sell a car.

## Accepted transitions

**Buy.** Resolve the catalogue model, require a free bay and sufficient credits, and require an unexhausted serial. The lowest empty bay receives `car-NNNNNN` from `nextVehicleId`; the counter increments once. Subtract exactly the catalogue purchase price. An empty garage activates the purchase. Otherwise, preserve the existing active vehicle. Construct and validate the entire resulting inventory and balance together.

**Sell.** Require the exact owned ID. Derive proceeds from its model's immutable catalogue price. Check the credit bound before removing anything. Clear only its occupied bay; other cars retain their bay positions. Preserve the allocator. If the sold vehicle was active, activate the lowest occupied bay or use `null` when empty. Otherwise, preserve the current active ID.

**Select.** Require the exact owned ID and change only active selection and revision. Selecting the already active car is accepted and consumes a revision too. This makes the intent-consumption rule uniform. Credits, ownership, bay positions and the serial counter stay unchanged.

Every accepted transition increments `revision` by exactly one. At 99,999,999 all mutations reject. At allocator 1,000,000 purchases reject without wraparound; sale/selection can still operate. No transition reduces the serial, tops up funds, grants a practice car, alters a price or creates a race result.

## Valuation and money

Fictional credits remain integers from 0 to 99,999,999. `stock-60-v1` pays `floor(price * 3 / 5)`. The implementation calculates `scaled = price * 3`, removes `scaled % 5` and divides the resulting integer by five. Intermediate values are at most 299,999,997, safely below JavaScript's exact-integer bound. It does not use a floating percentage multiplier. At the current catalogue prices, rounding has no remainder.

| Model | Purchase | Resale | Loss per buy/sell cycle |
| --- | --- | --- | --- |
| Cinder Two | 600 | 360 | 240 |
| Lilt | 900 | 540 | 360 |
| Evening Line | 1,400 | 840 | 560 |
| Rivet Eight | 1,800 | 1,080 | 720 |
| Yardhand | 1,200 | 720 | 480 |
| Glass Comet | 2,400 | 1,440 | 960 |

Prices are bound to catalogue revision 1. There is no arbitrary accepted-purchase-price save field because this policy always resolves the fixed admitted catalogue revision. Future discounts, catalogue migrations, condition or upgrade valuation require separate contracts. Repeated trading cannot increase `credits + sum(resale of owned vehicles)`. A sale preserves that total; a purchase reduces it by the listed loss; selection leaves it unchanged.

## Retry, revision and commitment boundary

Keep the same request, including `expectedRevision`, when retrying. After an accepted transition is committed as the current state, that request rejects with `stale-revision`; it cannot allocate another ID or pay again. Two different actions prepared from the same revision compete for that revision. After one commits, the other must reject and be reconsidered by the player. Do not silently rewrite its expected revision after loading newer state.

Calling a pure function twice with the same original snapshot and action intentionally returns the same proposed next state and receipt. It does not represent two commits or create a second car. Passing a newly constructed valid request with the current revision represents a new action. A fresh request to sell an already absent car rejects with `vehicle-not-owned`.

`accepted:true` certifies the transition calculation, **not saved storage**. C must acquire exclusive coordination, compare the last observed stored value, validate the current state/revision, apply this transition, serialize the complete state, write successfully, and only then promote it to the committed UI. A failed write must leave the prior accepted inventory and credits displayed and available for retry. B exposes no persistent or optimistic UI that could award a car before that protocol exists.

Revision protection applies within one monotonic garage history. Reset/import can restore an earlier revision or identical canonical text, so revision equality alone does not identify a garage lifetime. C must invalidate outstanding confirmations and queued actions across whole-state replacement and provide a storage generation/comparison boundary that prevents an old tab or pre-replacement request being mistaken for a new intent. Missing reliable locks must fail closed or enter an explicitly labelled nonpersistent mode. This PR makes no cross-tab atomicity claim.

## Rejection order

The first applicable reason wins, consistently across runtimes:

| Order | Reason | Meaning |
| --- | --- | --- |
| 1 | `invalid-state` | Complete current snapshot failed registry admission |
| 2 | `invalid-request` | Action shape, type, target type/length or expected revision invalid |
| 3 | `stale-revision` | Expected revision differs from current revision |
| 4 | `revision-exhausted` | Current revision cannot increment safely within its bound |
| Buy 1 | `invalid-model` | Target is not a built-in catalogue model |
| Buy 2 | `garage-full` | No empty bay |
| Buy 3 | `insufficient-credits` | Balance cannot cover the catalogue price |
| Buy 4 | `vehicle-id-exhausted` | All instance serials have been allocated |
| Sell/select 1 | `invalid-vehicle-id` | Target is not `car-` plus six digits for a nonzero serial |
| Sell/select 2 | `vehicle-not-owned` | Formatted ID does not occupy a bay |
| Sell 3 | `credit-overflow` | Proceeds would exceed the credit bound |

## Solvency and recovery

An empty garage and a balance below the cheapest car remain valid, including zero credits. No visit, rejected purchase, sale or selection replenishes money. There are no race rewards in CO-013. The v1.3.0 recovery path is an explicitly confirmed **New garage** whole-state replacement using `createGarage()`, offered with an export of the existing state in C/D. This deliberately starts a new garage with 2,400 credits and no cars. It must never merge old vehicles or credits into the new garage, or run automatically on load failure. The transaction API rejects `reset` as an action; confirmation and durable replacement remain separate review work.

## Review and validation

Run `node --test tests/garage-registry.test.mjs tests/garage-transactions.test.mjs tests/garage-transaction-sequences.test.mjs`. The tests independently account for money, IDs, bays, selection and receipts over deterministic action sequences, including retries and rejected requests. Boundary fixtures with larger balances are labelled synthetic validator inputs; ordinary purchase paths start from the real 2,400-credit state. These are pure transaction checks. Storage failure, two-tab browser journeys and real Buy/Sell controls remain C–E.

The [B acceptance record](co-013b-acceptance.md) records exact source, commands, results and offline evidence. Existing racing, championship and replay authority is untouched; garage modules remain source-only until D connects the browser UI. VANILLAJS stays at `9d95d74b355ec17add32db0b55f0f71130f9c004`. The original STREET-RACER reference/provenance inspection is recorded in the registry contract; no donor code is copied for B. Owner review of B precedes C.
