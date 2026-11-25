// SPDX-License-Identifier: Apache-2.0
import {createGarageUI} from './garage-ui.js';
import {createGarageScene} from './garage-scene.js';

// Presentation-only adapter. Ownership remains in the vault; the showroom has
// no race, command, damage, reward or replay authority.
export function createGarageExperience({host, viewport, canvas, status, boundary, changed, leave}) {
  let scene = null, dirty = true, lost = false, failed = false, pixelRatio = 1;
  const ui = createGarageUI(host, {
    onPreview() { dirty = true; },
    onCamera() {
      dirty = true;
      if (matchMedia('(max-width: 720px)').matches) viewport.scrollIntoView({block:'start',behavior:'instant'});
    },
    onBoundary:boundary,
    onClose:close
  });
  const resize = new ResizeObserver(() => { dirty = true; });
  resize.observe(canvas);
  function disposeScene() {
    scene?.dispose();
    scene = null;
  }
  function graphicsMessage(message) {
    status.textContent = message;
    status.hidden = !message;
  }
  function close() {
    if (ui.close() === false) return;
    viewport.hidden = true;
    disposeScene();
    failed = false;
    boundary();
    changed();
    leave();
  }
  function contextLost(event) {
    event.preventDefault();
    lost = true;
    dirty = true;
    graphicsMessage('Showroom graphics interrupted. Your saved cars are safe; restoring the view…');
  }
  function contextRestored() {
    disposeScene();
    lost = failed = false;
    dirty = true;
  }
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  return {
    get visible() { return ui.visible; },
    open() {
      viewport.hidden = false;
      dirty = true;
      failed = false;
      ui.open();
      changed();
    },
    close,
    back:() => ui.back(),
    navigate:action => ui.navigate(action),
    render(ratio = 1) {
      if (!ui.visible || lost || failed) return;
      if (pixelRatio !== ratio) { pixelRatio = ratio; disposeScene(); dirty = true; }
      if (!dirty) return;
      try {
        scene ??= createGarageScene(canvas,pixelRatio);
        const {state,modelId,ownedVehicleId,camera} = ui.presentation;
        scene.draw({garage:state,modelId,ownedVehicleId,camera});
        dirty = false;
        graphicsMessage('');
      } catch {
        disposeScene();
        failed = true;
        graphicsMessage('Showroom graphics unavailable. Catalogue and saved ownership still work. Enable WebGL, then reopen The Garage to retry.');
      }
    },
    dispose() {
      ui.dispose();
      resize.disconnect();
      disposeScene();
      canvas.removeEventListener('webglcontextlost',contextLost);
      canvas.removeEventListener('webglcontextrestored',contextRestored);
    }
  };
}
