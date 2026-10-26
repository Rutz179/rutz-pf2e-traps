import { t } from "./util.mjs";
import { hidePreview, showPreview } from "./draw.mjs";

/* ======================================================================== *
 * Picking a square on the map: the next left click on the board sets it
 * (a yellow square follows the pointer); right click or Esc cancels.
 * ======================================================================== */

let active = null;

export function cancelPlacing() {
  active?.stop(true);
}

/** Resolve with { i, j } of the clicked square, or null when cancelled. */
export function pickSquare() {
  cancelPlacing();
  if (!canvas?.ready || !canvas.grid || canvas.grid.type === 0) { ui.notifications.warn(t("Place.NoGrid")); return Promise.resolve(null); }
  const view = canvas.app.view;
  return new Promise(resolve => {
    const cellAt = ev => {
      const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
      return canvas.grid.getOffset(p);
    };
    const move = ev => showPreview(cellAt(ev));
    // On the document, capturing: it runs before the board's own handlers, so the click selects nothing.
    const down = ev => {
      if (ev.target !== view) return;
      if (ev.button === 2) { ev.preventDefault(); ev.stopPropagation(); return stop(true); }
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const cell = cellAt(ev);
      stop(false);
      resolve(cell);
    };
    const key = ev => { if (ev.key === "Escape") stop(true); };
    const menu = ev => ev.preventDefault();
    function stop(cancel) {
      view.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", down, true);
      view.removeEventListener("contextmenu", menu);
      document.removeEventListener("keydown", key, true);
      document.body.classList.remove("rpt-placing");
      hidePreview();
      active = null;
      if (cancel) resolve(null);
    }
    view.addEventListener("pointermove", move);
    document.addEventListener("pointerdown", down, true);
    view.addEventListener("contextmenu", menu);
    document.addEventListener("keydown", key, true);
    document.body.classList.add("rpt-placing");
    active = { stop };
    ui.notifications.info(t("Place.Hint"));
  });
}
