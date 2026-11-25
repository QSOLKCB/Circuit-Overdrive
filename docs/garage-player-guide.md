# Street Rod — After Hours Motor Works

Open **The Garage** from the game menu to inspect six original models and manage four owned-car bays. The garage is an offline collection with fictional integer credits. It does not change the car, physics, damage, replay or results of any racing mode. The Parts Counter offers bounded mechanical fitting and setup for a selected owned car. Repairs, race rewards and a playable owned-car facility remain later milestones.

## Keep an existing garage

A v1.3.0 save opens with **MIGRATION REQUIRED** and its actual cars still visible. Choose **Review garage upgrade**, export the original save if desired, then confirm. Every owned ID, bay, credit, selection and serial counter is preserved; each car receives its own validated stock build and pristine condition. Cancel leaves the save untouched. The new game blocks purchases, sales, reset and imports until this conversion is confirmed and saved.

Afterward, **Export garage JSON** downloads the current build-aware save. **Export original legacy backup** downloads the retained original ownership separately. Both current and published legacy JSON files can be imported through explicit whole-state replacement. Close obsolete game tabs before conversion: their pending confirmations fail, but a freshly reviewed reset in an old game can deliberately replace unsupported data. Keep an exported backup. [Exact migration and recovery contract](garage-build-registry.md)

## Your first car

1. On a first visit, **Create Your Garage** appears near the top of the garage controls and focuses **Create garage**. Choose it, review the four empty bays and 2,400-credit starting balance, then choose **Confirm new garage**. Opening the menu alone never creates credits or replaces a save.
2. After **SAVED**, the setup prompt disappears and focus moves to the selected model’s enabled **Buy** button (or catalogue selection if it is unaffordable). The message announces your 2,400 credits. Select a model in **Original catalogue**. Inspect its stock finish, description, purchase price and resale value. Use **Front quarter**, **Side**, **Rear quarter** or **Four bays** to change the showroom camera. On a small screen, **View showroom** brings the vehicle back into view above the controls.
3. Choose **Buy**, review the exact price, new vehicle identity, destination bay and remaining balance, then confirm. The car appears as owned only after the complete save succeeds.
4. Select an occupied bay to inspect that particular owned vehicle. Two cars can share a model, but each has its own persistent identity. Choose **Make active** and confirm to save your collection selection.
5. Reload the page and reopen The Garage. With the same browser profile and site address, the saved balance, cars, bay positions and active vehicle remain unchanged.

The Cinder Two costs 600 credits. Confirming its purchase leaves 1,800 credits and puts `car-000001` in Bay 1; a browser reload retains both. Four can fill all four bays using the initial balance. A full garage cannot buy a fifth vehicle. A model that costs more than the remaining balance cannot be bought. Catalogue inspection remains available without ownership or usable storage.

## Fit parts to an owned car

Select an occupied bay. The **Parts Counter** identifies that owned car and its installed parts. Choose a slot and part, then any supported setup steps. Review the acquisition/fitting cost and select **Review fitting**. The confirmation names the exact car, part, setup and resulting balance. Confirm fitting to save; Cancel leaves the build and balance unchanged.

Acquired parts belong to that car. Refitting an owned mechanical part costs 20 credits; new parts also cost their catalogue price. Setup changes cost 10 credits. Paint fitting costs 10 plus acquisition if needed. An unchanged part/setup cannot charge again. Parts/labor receive no sale refund. Paint changes original panel colours and adds no horsepower or grip. Saved builds and inventories survive reload and validated export/import. They do not replace established racing vehicles. [Physical effects and exact prices](vehicle-parts.md)

## Sales and recovery

Select an occupied bay and choose **Sell**. The confirmation identifies the exact owned car, proceeds and resulting balance. Sales return 60% of the catalogue purchase price, using integer arithmetic. A Cinder Two sells for 360 credits; repeated buying and selling does not create profit. Selling the active car selects the first remaining occupied bay. Selling the last car leaves a valid empty garage with no active vehicle.

If you have no cars or cannot afford another purchase, you can still inspect the entire catalogue. **Reset garage** offers an explicit replacement with four empty bays and 2,400 credits. This discards the old collection and balance; it is a new garage, not an income source or a repair. Export your current garage before confirming if you want to keep it. Returning to the menu or revisiting the garage never tops up credits.

## Save vault

**Export garage JSON** downloads the complete validated snapshot. Keep a backup outside browser storage. The file contains inert ownership data, not executable code, vehicle recipes or authentication. The player controls the local file; strict validation protects program invariants, not against deliberate local edits.

Choose a file through **Import garage JSON**. Files are limited to 64 KiB and the complete schema and inventory are checked before any replacement is offered. A valid file opens a confirmation showing the balance and owned identities that would replace the current garage. **Export current garage first** is available on replacement confirmations. Import replaces the whole state; it never adds imported credits or vehicles to the current save. Cancel leaves the existing save intact. **Cancel file read**, Back, reload and navigation also invalidate an unfinished file read.

Invalid, corrupt, oversized or unsupported files show **IMPORT REJECTED** and preserve the existing save. Importing a valid backup is also available when the currently stored data is corrupt. No automatic reset replaces unreadable data.

| Status | What to do |
| --- | --- |
| MIGRATION REQUIRED | Review the garage upgrade; export the original first if desired. No cars or credits change on load. |
| SAVED | The browser confirmed the saved snapshot. Export a backup for safekeeping. |
| UNSAVED | Read the message: this may be an empty/corrupt slot, a save in progress or a rejected attempt. |
| STORAGE UNAVAILABLE | Restore browser storage/coordination support, then use Reload saved garage. Inspection remains available. |
| CONFLICT | Another tab changed the save. Reload saved garage before reviewing a new action. |
| IMPORT REJECTED | Choose a valid file. Existing ownership has not been replaced. |

Two tabs can inspect the same garage. After one commits a purchase or sale, the other must reload before writing. An old confirmation cannot overwrite newer ownership; actions are never silently retried against another balance. A failed write does not award a free vehicle. If a write completed but verification failed, reload discovers the actual whole saved state before any retry.

Storage is local to the browser profile and exact origin (scheme, host and port). Use HTTPS hosting or the supported offline loopback server, with accessible localStorage and Web Locks. A different port, browser or profile has a separate save. Storage denial, unavailable coordination and exhausted limits fail closed. There is no cloud synchronisation, and browser eviction or deletion can remove local saves. The championship and settings use separate keys.

## Controls and presentation

Use ordinary buttons with keyboard Tab/Shift+Tab and Enter/Space, touch or the configured controller's menu navigation. Confirmations initially focus **Cancel**. A held activation key cannot carry across a focus or confirmation transition to make a purchase. Back/Escape cancels a confirmation or pending file read before leaving the garage. While a save is committing, wait for its result before navigating away.

The workshop and vehicle silhouettes are original procedural WebGL geometry. Vehicles display their catalogue stock finish; cosmetic size and body style are not claims about horsepower or racing performance. The four-bay view displays only accepted owned vehicles. The separate inspection platform can show an available catalogue vehicle without granting ownership.

Camera changes are immediate and there is no automatic showroom motion. A lost graphics context rebuilds the showroom while keeping the vault independent. If WebGL is unavailable, the textual catalogue, confirmations and save controls remain usable; reopen the garage after restoring graphics support to retry the view.

CO-013D delivers the usable garage experience. [CO-013E acceptance](co-013-acceptance.md) records the executed certification and remaining owner release gates. v1.3.0 remains a candidate until owner sign-off.


## First-visit correction — CO-013-UX-001

The owner's first play-through found that disabled Buy controls were visible
while the prerequisite Create action was buried below the catalogue and bays.
The introductory panel now puts confirmed creation before camera/catalogue
controls. Opening or cancelling setup never allocates credits. A saved garage
hides the first-visit prompt; reopening it does not reset the collection or
force focus back to setup. The Save vault retains its Create/Reset management
action.

Unreadable or unsupported storage shows **Recover your garage**, with explicit
backup import or review of a new-garage replacement. Storage denial and missing
Web Locks show the capability explanation; conflicts require explicit reload.
These states never advertise an uncommitted purchase. Save-in-progress controls
remain disabled. Focus and scroll changes occur on opening or successful
creation, rather than on each status/render update, and use immediate movement
for reduced-motion preferences. On narrow screens the first action is brought
into view; **View showroom** still returns to the preview above the panel.

The actual packaged browser suite (`tests/browser-garage.mjs`) retains all
CO-013E scenarios and adds first-visit visibility, setup cancellation, committed
creation, focused first purchase, four desktop/responsive widths, stale scroll
reopening, busy setup and failed creation/read-back recovery. It observes real
storage and accepted UI actions; injected storage/lock faults are labelled.
[Source-bound screenshots and executed results](evidence/co-013-ux-001/README.md) accompany the correction PR.
