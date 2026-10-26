import { MID, esc, isKeeper, isPlayerSide, setting, t } from "./util.mjs";
import { request, trapsOf } from "./store.mjs";
import { firstTrapOnPath } from "./path.mjs";
import { withDC } from "./kit.mjs";

/* ======================================================================== *
 * Stepping on a trap. Only the active GM's client watches (it can move any
 * token and nobody sees it read the players' traps) — on every scene, not only
 * the one the GM is looking at:
 *   a token moves → the cells it crossed (start → each waypoint → end)
 *   → the first armed trap of the other side on that path
 *   → the token stops on the trap's square, the trap is sprung (not armed),
 *     and the GM gets a window with the trap like a used item: description
 *     with the DC, who stepped on it, who set it — and buttons to tell the
 *     table (or only the GM), re-arm it, or clear it away.
 * Who sets a trap off (settings): the players' traps — creatures not on the
 * players' side (or everyone); the GM's — the players' side (or everyone).
 * ======================================================================== */

const STOP = `${MID}Stop`;
const where = new Map(); // token id → { x, y } before this move

export function snapshot(scene = canvas?.scene) {
  where.clear();
  for (const tk of scene?.tokens ?? []) where.set(tk.id, { x: tk.x, y: tk.y });
}

function hits(trap, actor, token = null) {
  if (!trap.armed) return false;
  const ours = isPlayerSide(actor, token);
  if (trap.side === "pc") return setting("pcHits", "enemies") === "all" || !ours;
  return setting("gmHits", "pcs") === "all" || ours;
}

const handled = new Map(); // token id → time the move hook took care of it

/** Look along a path of top-left points; spring the first trap on it. */
/** The scene's own grid (v12+), so a move counts even while the GM is looking at another scene. */
function gridOf(scene) {
  if (typeof scene?.grid?.getOffset === "function") return scene.grid;
  return scene?.id === canvas?.scene?.id ? canvas?.grid ?? null : null;
}

async function checkPath(doc, pts) {
  const grid = gridOf(doc.parent);
  if (!isKeeper() || !grid || grid.type === 0) return;
  const all = trapsOf(doc.parent).filter(tp => tp.armed);
  if (!all.length) return;
  pts = pts.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map(p => ({ x: p.x, y: p.y }))
    .filter((p, n, a) => n === 0 || p.x !== a[n - 1].x || p.y !== a[n - 1].y);
  const traps = all.filter(tp => hits(tp, doc.actor, doc));
  const trap = traps.length ? firstTrapOnPath(pts, doc.width ?? 1, doc.height ?? 1, grid, traps) : null;
  if (trap) return spring(doc, trap, grid);
  // The GM's own trap let this one pass (who sets it off is a setting): say so, to the GM only.
  // (Players' traps stay silent — the GM isn't meant to know where they are.)
  const passed = firstTrapOnPath(pts, doc.width ?? 1, doc.height ?? 1, grid, all.filter(tp => tp.side === "gm"));
  if (passed) {
    const key = `${passed.id}:${doc.id}`;
    if (Date.now() - (told.get(key) ?? 0) > 60000) {
      told.set(key, Date.now());
      ui.notifications.info(t("Passed", { name: doc.name, trap: passed.name, who: t(setting("gmHits", "pcs") === "all" ? "Settings.All" : "Settings.Pcs") }));
    }
  }
}
const told = new Map(); // "trap:token" → when the GM was told it walked past

/**
 * v13's move hook: where the token started, every square it went through and where it ends.
 * (The document may still hold the start while the token animates, so this is the reliable one.)
 */
export async function onTokenMove(doc, movement, operation) {
  if (operation?.[STOP] || !movement) return;
  const origin = movement.origin ?? where.get(doc.id);
  const dest = movement.destination ?? movement.passed?.waypoints?.at?.(-1);
  if (!origin || !dest) return;
  handled.set(doc.id, Date.now());
  where.set(doc.id, { x: dest.x, y: dest.y });
  const passed = movement.passed?.waypoints ?? [];
  await checkPath(doc, [origin, ...passed, dest]);
}

/** updateToken — for a move the move hook didn't see (older Foundry, or a plain x/y change). */
export async function onTokenMoved(doc, changes, options) {
  const moved = "x" in changes || "y" in changes;
  if (!moved) return;
  // The destination is what the change says (the document can lag behind while the token animates).
  const to = { x: changes.x ?? doc._source?.x ?? doc.x, y: changes.y ?? doc._source?.y ?? doc.y };
  const before = where.get(doc.id) ?? to;
  where.set(doc.id, to);
  if (options?.[STOP] || Date.now() - (handled.get(doc.id) ?? 0) < 1500) return;
  await checkPath(doc, [before, to]);
}

async function spring(doc, trap, grid = gridOf(doc.parent)) {
  const tl = grid.getTopLeftPoint({ i: trap.i, j: trap.j });
  where.set(doc.id, { x: tl.x, y: tl.y });
  // v13: stop what is left of the move before setting the token on the trap.
  try { await doc.stopMovement?.(); } catch (_) { /* older Foundry */ }
  await request({ op: "update", sceneId: doc.parent.id, id: trap.id, patch: { armed: false, sprung: { by: doc.name, token: doc.id, at: game.time?.worldTime ?? 0 } } });
  // Stop on the trap's square (after the move's own animation has a moment to start).
  setTimeout(() => doc.update({ x: tl.x, y: tl.y }, { [STOP]: true }).catch(() => null), 150);
  new TrapPopup({ ...trap, armed: false, sprung: { by: doc.name, token: doc.id } }, doc).render(true);
}

/* ---------------- the GM's window ---------------- */

export class TrapPopup extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["rpt-popup"],
    window: { icon: "fa-solid fa-burst", resizable: true },
    position: { width: 520, height: "auto" }
  };

  constructor(trap, tokenDoc) {
    super({ id: `rpt-popup-${trap.id}`, window: { title: t("Pop.Title", { name: trap.name }) } });
    this.trap = trap;
    this.tokenDoc = tokenDoc;
  }

  async _renderHTML() {
    const tp = this.trap;
    const setter = game.actors.get(tp.owner);
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const desc = await TE.enrichHTML(withDC(tp.desc, tp.dc), { async: true });
    return `<div class="rpt-pop ${tp.side}">
      <header><img src="${esc(tp.img)}" alt=""><div><h2>${esc(tp.name)}</h2>
        <p><span class="side ${tp.side}">${t(tp.side === "pc" ? "Side.pc" : "Side.gm")}</span> ${t(`Kind.${tp.kind ?? "custom"}`)} · ${t("Level", { n: tp.level ?? 0 })}
        · <b>DC ${tp.dc}</b>${tp.dcBase && tp.dcBase !== tp.dc ? ` <small>(${t("Pop.Base", { n: tp.dcBase })})</small>` : ""}</p></div></header>
      <p class="who"><i class="fa-solid fa-shoe-prints"></i> ${t("Pop.Stepped", { name: esc(this.tokenDoc?.name ?? tp.sprung?.by ?? "?") })}${setter ? ` · ${t("Pop.SetBy", { name: esc(setter.name) })}` : ""}</p>
      <div class="desc">${desc || `<p class="dim">${t("Pop.NoDesc")}</p>`}</div>
      <footer>
        <button type="button" data-a="public"><i class="fa-solid fa-bullhorn"></i> ${t("Pop.Public")}</button>
        <button type="button" data-a="gm"><i class="fa-solid fa-user-secret"></i> ${t("Pop.GmOnly")}</button>
        <button type="button" data-a="select"><i class="fa-solid fa-crosshairs"></i> ${t("Pop.Select")}</button>
        <span class="sp"></span>
        <button type="button" data-a="rearm" data-tooltip="${esc(t("Pop.RearmHint"))}"><i class="fa-solid fa-rotate-left"></i> ${t("Pop.Rearm")}</button>
        <button type="button" data-a="clear"><i class="fa-solid fa-broom"></i> ${t("Pop.Clear")}</button>
      </footer></div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    if (this._wired === content) return;
    this._wired = content;
    content.addEventListener("click", ev => this.onClick(ev));
  }

  async onClick(ev) {
    const a = ev.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    ev.preventDefault();
    const tp = this.trap;
    if (a === "public" || a === "gm") return postCard(tp, this.tokenDoc, a === "gm");
    if (a === "select") { const tok = this.tokenDoc?.object; tok?.control({ releaseOthers: true }); if (tok) canvas.animatePan({ x: tok.center.x, y: tok.center.y }); return; }
    if (a === "rearm") { await request({ op: "update", sceneId: this.tokenDoc?.parent?.id, id: tp.id, patch: { armed: true, sprung: null } }); return this.close(); }
    if (a === "clear") { await request({ op: "remove", sceneId: this.tokenDoc?.parent?.id, id: tp.id }); return this.close(); }
  }
}

/** The trap as a chat card (like an item used), for everyone or only the GM. */
export async function postCard(tp, tokenDoc, gmOnly = false) {
  const setter = game.actors.get(tp.owner);
  const content = `<div class="rpt-card ${tp.side}"><header><img src="${esc(tp.img)}" alt=""><div><b>${esc(tp.name)}</b>
      <small>${t(tp.side === "pc" ? "Side.pc" : "Side.gm")} · ${t(`Kind.${tp.kind ?? "custom"}`)} · DC ${tp.dc}</small></div></header>
    <p class="who"><i class="fa-solid fa-burst"></i> ${t("Card.Sprung", { name: esc(tokenDoc?.name ?? tp.sprung?.by ?? "?") })}${setter && tp.side === "pc" ? ` · ${t("Pop.SetBy", { name: esc(setter.name) })}` : ""}</p>
    <div class="desc">${withDC(tp.desc, tp.dc)}</div></div>`;
  return ChatMessage.create({
    content, speaker: { alias: t("Title") },
    whisper: gmOnly ? game.users.filter(u => u.isGM).map(u => u.id) : []
  });
}
