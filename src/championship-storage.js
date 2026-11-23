// SPDX-License-Identifier: Apache-2.0
export const SLOT = 'circuit-overdrive.woc.v1';

// Compare the last observed slot under one origin-wide lock. A stale tab
// cannot overwrite a newer flag or resurrect a championship the player reset.
export function championshipStorage(getStorage, getLocks) {
  return {
    read() {
      try { return {available:true, text:getStorage().getItem(SLOT)}; }
      catch { return {available:false, text:null}; }
    },
    async write(previous, next) {
      try {
        return await getLocks().request(SLOT, () => {
          const storage = getStorage();
          if (storage.getItem(SLOT) !== previous) return 'conflict';
          storage.setItem(SLOT,next);
          return 'saved';
        });
      } catch { return 'unavailable'; }
    }
  };
}
