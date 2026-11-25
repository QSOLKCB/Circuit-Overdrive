# CO-014C — Parts Counter contract

The Parts Counter adds purchasable mechanical parts, bounded setup and original
paint to the accepted garage. It does not install garage cars into established
races. A playable owned-car facility, production benchmark comparison and new
recordings remain D/E; complete native certification remains F.

## Builds, owned inventory and backwards admission

Garage and Vault remain version 2 in the same coordinated key. The accepted
rules-1 stock build format, all six canonical recipes and recorded B identities
remain exact. Loading, rendering, exporting or importing such a build does not
silently convert it or charge credits. New purchases and v1.3.0 migration still
receive independent rules-1 stock builds. Both rules 1 and 2 are admitted.

Only a confirmed installation changes that owned car to build **rules 2**. Its
exact fields are `format`, `version`, `rulesVersion`, `parts`, `tuning`,
`inventory`. Format/version remain `circuit-overdrive.vehicle-build` / 1.
Parts are the nine established slots. Tuning has exactly five integer step
fields: `finalDrive`, `spring`, `damper`, `travel`, `steering`. Inventory has
exactly nine arrays of known slot-specific part IDs, including stock/factory
and the installed part. Arrays are bounded by the finite catalogue, unique,
sorted canonically and owned by this car. No general mod loader, executable
configuration or raw recipe is admitted. Per-car copies remain deeply frozen.

Inventory records acquired parts, not performance. Installed `buildDigest`
binds rules, parts and tuning but excludes uninstalled inventory; changing only
inventory leaves the recipe and installed digest unchanged. `canonicalBuild`
still includes the full persisted inventory. `recipeDigest` binds the accepted
rules, full validated recipe, exact game source and immutable engine revision.
Existing rules-1 digest preimages and results remain unchanged. Paint changes
installed visual identity without changing the complete physical recipe.

The pure `stockUpgradeBuild` helper constructs data only. It is not proof of
payment, installation or ownership. The compiler resolves and validates the
complete combination before any accepted installation state is returned.

## Authored catalogue and integer costs

`vehicle-parts.js` owns catalogue revision 1. All parts are original arcade
specifications; no real engine/tyre branding, horsepower badge or commercial
vehicle claim is made. Stock/factory parts have zero acquisition price and are
always retained by the car. The following are **part prices before fitting**:

| Slot | Choices and fictional credit prices |
| --- | --- |
| Engine | Stock 0; street rebuild 250; performance 550; competition 950 |
| Intake | Stock 0; ducted intake 80 |
| Exhaust | Stock 0; free-flow exhaust 100 |
| Gearbox | Balanced stock 0; short 160; long 160 |
| Final drive | Stock 0; adjustable 120 |
| Tyres | Stock 0; touring 140; performance 220; economy 90 |
| Suspension | Stock 0; adjustable 180 |
| Steering | Stock 0; quick 100 |
| Paint | Factory 0; Oxide Ember / Seafoam Wire / Midnight Alloy 60 each |

Changing a mechanical part costs **20 fitting credits**, plus acquisition price
only if this car does not already own it. Changing paint costs **10 fitting
credits**, plus acquisition if needed. Adjusting the currently fitted supported
setup costs **10 setup credits**, with no acquisition price. An identical part
and setup reject `already-fitted` with no charge or revision change. A return to
stock is an owned-part refit, not a refund. Parts cannot transfer between cars.
Sale returns the existing stock-model 60% value only, with no parts/labor refund.

After a real 600-credit Cinder Two purchase, 1,800 credits remain. The entry
configuration covering all nine slots (street, duct, flow, short, adjustable
final drive, performance tyres, adjustable suspension, quick steering and one
paint) costs **1,440 including fitting**, leaving **360**. No race income is
invented. Expensive-car owners may lack funds; rejection, catalogue inspection,
export and explicit reset retain their documented meanings. Free hypothetical
compiler tests award nothing; player-facing practice/comparisons belong to D.

## Mechanical effects and units

All engine curves retain five points at **850 / 2200 / 4200 / 5800 / 6800 RPM**,
idle 850, redline 6800 and 40 Nm engine braking. Starting curves for all six
models are in the [stock contract](vehicle-builds.md). Each installed part adds
the following **Nm at those points**, not a stack of display multipliers:

| Part | Additive torque at the five RPM points |
| --- | --- |
| Street engine | 18 / 28 / 32 / 28 / 18 |
| Performance engine | 35 / 60 / 70 / 60 / 35 |
| Competition engine | 50 / 80 / 90 / 90 / 55 |
| Ducted intake | 2 / 6 / 9 / 12 / 7 |
| Free-flow exhaust | 3 / 5 / 10 / 13 / 8 |

Cinder stock is **105 / 175 / 210 / 185 / 130 Nm**; the street engine alone is
**123 / 203 / 242 / 213 / 148**; street + intake + exhaust is
**128 / 214 / 261 / 238 / 163**. Only the selected engine contributes its delta.
Combined peak torque must remain within the game's approved **550 Nm** envelope.
Rivet competition + intake reaches 549 Nm; adding exhaust would reach 559 Nm
and rejects without payment or installation. This is an explicit game-owned
combination bound, not a universal real-world engine limit or vendor change.

| Mechanical setup | Supported physical fields |
| --- | --- |
| Short gearbox | Ratios 3.45 / 2.3 / 1.65 / 1.25 / 1.0 |
| Long gearbox | Ratios 2.8 / 1.8 / 1.3 / 1.0 / .75 |
| Adjustable final drive | Model stock ratio + .2 + .1 × step, step −4…4 |
| Touring tyres | Grip +.04; velocity cornering stiffness +250 Ns/m; rolling coefficient −.002 |
| Performance tyres | Grip +.18; velocity cornering stiffness +850 Ns/m; rolling coefficient +.001 |
| Economy tyres | Grip −.12; velocity cornering stiffness −400 Ns/m; rolling coefficient −.003 |
| Adjustable spring | Round(stock N/m × 1.10 × (1 + .1 × spring step)), step −2…2 |
| Adjustable damper | Round(stock Ns/m × 1.05 × (1 + .1 × damper step)), step −2…2 |
| Adjustable travel | Stock rest length and travel each +.01 m + .01 m × travel step, step −2…2 |
| Quick steering | Stock maximum angle +.02 rad + .02 × step; stock rate +.4 rad/s + .1 × step, step −2…2 |

Nonzero tuning requires the corresponding adjustable/quick part. A request may
change tuning only in its selected slot; suspension owns its three settings.
All finite values, descending ratios, supported chassis dimensions and wheel
geometry still pass the pinned `validateVehicle`. Combined suspension must
support static weight within **75% of travel**, with travel no greater than rest
length. Torque/RPM interpolation, wheel-force multiplication, friction-circle
limits, resistance, steering response, support and damping use the actual
published solver equations documented in the stock contract. No extra impulse,
stabilization, hidden steering force, engine-brake buff or vendor edit is added.

The gearbox changes wheel torque, accepted RPM and shift speeds. Tyres change
solved lateral/longitudinal forces. Suspension changes actual loads, compression
and heave over a declared bump. Steering changes wheel response and physical yaw.
Trade-offs and traction limits matter; a more expensive part is not assigned an
invented speed rating. Long gearing does not promise faster acceleration.

## Whole-state installation protocol

`transactGarageInstallation(state, action)` is pure. The exact inert action is
`{type:'install',ownedVehicleId,slot,partId,tuning,expectedRevision}`. It admits
the owned car, request and known part, checks revision/counters, restricts setup
to the selected slot, computes catalogue acquisition/fitting cost, checks funds,
compiles the complete proposed build, and constructs the new validated state.
Only that car's build, credits and revision change. Owned/model IDs, other cars,
bay positions, condition, active ID and allocator remain intact. Failed compilation
cannot debit money; prices, costs and inventory grants cannot be supplied by an
action. The receipt identifies exact car, part, fitting/acquisition split,
old/new revision and balances. No replacement of an owned identity occurs.

`vault.prepareInstallation` copies the complete reviewed request into its
single-use owner-bound ticket. Confirmation uses the existing same-key Web Lock,
whole-raw-value comparison, lifecycle guard and reapplication to the actual
current state. It writes the complete garage/envelope including retained legacy
backup and acknowledges only exact read-back. Failed or uncertain persistence
never publishes a free part; explicit reload reconciles a possibly completed
whole write without rollback or retry. Stale tabs cannot rebase a reviewed fit.

The existing v2 slot/schema accepts both build rules. Older clients which only
understand rules 1 reject an upgraded save. Their pending confirmations conflict;
a fresh explicitly confirmed destructive recovery in an old runtime remains the
documented obsolete-client boundary. Close old tabs and export backups before
fitting. The v1.3.0 migration and original-backup protocol otherwise remain exact.

## Counter and original paint presentation

Select an owned bay to see its stable owned ID, installed parts, finite catalogue
choices, bounded setup selectors and acquisition/fitting quote. The confirmation
lists that exact car, part, accepted setup and balance. Cancel changes nothing.
Selectors support keyboard/touch; menu left/right cycles a focused select while
up/down moves focus. Neutral arming, held-input guards, focus/cancellation and
existing save-error controls remain in the shared Garage lifecycle.

Paint uses three original procedural palettes. Only RGB panel/accent values
change; positions, normals, original silhouettes, wheels and physical recipes
remain identical. The inspection copy follows the specifically selected owned
car's accepted paint; unowned catalogue previews retain factory finishes. Bay
copies use their own accepted builds. Proposed paint is not installed on review.
The retained scene caches at most six models × four finishes: **149 meshes**
including existing workshop/shadow meshes, below pinned high-profile limits.
Repeated visits reuse those handles; dispose/context reconstruction retains the
accepted save. No dynamic physical ride-height presentation is claimed by this
static showroom; accepted moving body/wheel transforms belong to D/E.

## Evidence and current limits

Controlled development runs use fixed 60 Hz calls, declared seed 0, identical
timed straight/corner/steering/bump commands and common starting poses. Braking
uses exact initial 100 km/h and a documented full-brake stop policy. Cinder
stock/street 0–100 is **8.105 / 7.603 s**; performance tyres reduce measured
braking distance **37.904 → 32.284 m**. All eight mechanical categories change
actual motion; paint leaves every recipe and motion field unchanged. Additional
engine grades, long gearing and tyre choices are measured separately, with two
finite supported compound setups on each original model. These are physical
receipts, not UI-generated performance badges or a drivable facility.

The independent installation ledger retains exact money/IDs/inventory over
1,024 generated sequences. Real browser fitting uses actual controls and actual
saved owned builds for separate before/after solver runs. Full scripts/commands,
source digests, screenshots, limits and owner steps are in
[C acceptance](co-014c-acceptance.md). The complete workshop, playable Proving
Grounds, repairs from accepted damage and build-bound playback remain D–F.
