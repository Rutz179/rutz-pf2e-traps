import { MID, setting } from "./util.mjs";
import { trapsOf } from "./store.mjs";

/* ======================================================================== *
 * Markers on the map — drawn on this screen only, never shared:
 *   players see the players' traps (red; grey once sprung) — setting/toggle
 *   the GM sees the GM's traps (purple), and the players' only while
 *   peeking (몰래 보기, a few seconds, nobody is told unless the setting says so)
 * ======================================================================== */

let layer = null;
let peekUntil = 0;
let peekTimer = null;
let hidden = false;
let highlight = null;

const COLOR = { pc: 0xd0453a, gm: 0x8a4fff, sprung: 0x7a7a7a, preview: 0xffcf5a };

export const peeking = () => Date.now() < peekUntil;
export function setHidden(v) { hidden = !!v; redraw(); }
export const markersHidden = () => hidden;

/** GM: show the players' traps for a few seconds. */
export function peek(seconds = Number(setting("peekSeconds", 10)) || 10) {
  peekUntil = Date.now() + seconds * 1000;
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => { peekUntil = 0; redraw(); }, seconds * 1000 + 50);
  redraw();
}

/** Which traps this screen may show. */
export function visibleTraps(scene = canvas?.scene) {
  const all = trapsOf(scene);
  if (game.user.isGM) return all.filter(tp => tp.side === "gm" || peeking());
  if (hidden || setting("showMarkers", true) === false) return [];
  return all.filter(tp => tp.side === "pc");
}

function container() {
  if (layer && !layer.destroyed && layer.parent) return layer;
  layer = new PIXI.Container();
  layer.name = "rutz-pf2e-traps";
  layer.eventMode = "none";
  (canvas.interface ?? canvas.stage).addChild(layer);
  return layer;
}

const loadTex = src => (foundry.canvas?.loadTexture ?? globalThis.loadTexture)?.(src).catch?.(() => null) ?? Promise.resolve(null);

export async function redraw() {
  if (!canvas?.ready || !canvas.grid || canvas.grid.type === 0) return;
  const c = container();
  c.removeChildren().forEach(ch => ch.destroy({ children: true }));
  const s = canvas.grid.size;
  for (const tp of visibleTraps()) {
    const center = canvas.grid.getCenterPoint({ i: tp.i, j: tp.j });
    const g = new PIXI.Graphics();
    const color = tp.armed ? COLOR[tp.side] : COLOR.sprung;
    const peekMark = game.user.isGM && tp.side === "pc";
    g.lineStyle(Math.max(2, s * 0.04), color, 0.95).beginFill(0x000000, 0.35).drawCircle(0, 0, s * 0.34).endFill();
    if (peekMark) g.lineStyle(2, 0xffffff, 0.8).drawCircle(0, 0, s * 0.42);
    if (highlight === tp.id) g.lineStyle(3, COLOR.preview, 1).drawCircle(0, 0, s * 0.46);
    g.position.set(center.x, center.y);
    g.alpha = tp.armed ? 0.9 : 0.55;
    c.addChild(g);
    const tex = tp.img ? await loadTex(tp.img) : null;
    if (tex && !g.destroyed) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = sp.height = s * 0.46;
      sp.alpha = tp.armed ? 1 : 0.5;
      g.addChild(sp);
    }
  }
}

export function setHighlight(id) {
  highlight = id;
  redraw();
}

/** A square showing where a click would set the trap. */
let preview = null;
export function showPreview(cell) {
  const c = container();
  if (!preview || preview.destroyed) { preview = new PIXI.Graphics(); c.addChild(preview); }
  preview.clear();
  if (!cell) return;
  const tl = canvas.grid.getTopLeftPoint(cell);
  const s = canvas.grid.size;
  preview.lineStyle(3, COLOR.preview, 1).beginFill(COLOR.preview, 0.18).drawRect(tl.x + 2, tl.y + 2, s - 4, s - 4).endFill();
  if (!preview.parent) c.addChild(preview);
}
export function hidePreview() {
  preview?.clear();
}
