import { MID, SOCKET, isKeeper } from "./util.mjs";

/* ======================================================================== *
 * Where the traps live: the scene (flags.rutz-pf2e-traps.data), one list per
 * scene:  { id, side: "pc"|"gm", i, j, name, img, uuid, level, dc, dcBase,
 *           kind, desc, item (a copy, to give back), owner (actor id),
 *           by (user id), armed, sprung: { by, at } | null, at }
 * The list is scrambled (not plain JSON), so it doesn't sit there in the
 * clear for a glance at the scene's data. It is a curtain, not a lock:
 * Foundry gives every client the scene, and a GM who digs can read it.
 *
 * Players can't write a scene, so every change goes to the active GM's
 * client by socket ("the keeper"), which writes without showing anything.
 * ======================================================================== */

const KEY = "data";

function shuffleKey(scene) {
  const s = String(scene?.id ?? "rutz");
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 251;
  return h + 3;
}

export function encode(list, scene) {
  const k = shuffleKey(scene);
  const bin = unescape(encodeURIComponent(JSON.stringify(list)));
  let out = "";
  for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) ^ ((k + i * 7) & 0xff));
  return btoa(out).split("").reverse().join("");
}

export function decode(text, scene) {
  if (!text) return [];
  try {
    const k = shuffleKey(scene);
    const bin = atob(String(text).split("").reverse().join(""));
    let out = "";
    for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) ^ ((k + i * 7) & 0xff));
    const list = JSON.parse(decodeURIComponent(escape(out)));
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/** Every trap on a scene (both sides — who may *see* which is draw.mjs's business). */
export function trapsOf(scene = canvas?.scene) {
  return decode(scene?.getFlag?.(MID, KEY), scene);
}

/** The players' trap-setting time on this scene: { open, by, at } or null. */
export function phaseOf(scene = canvas?.scene) {
  return scene?.getFlag?.(MID, "phase") ?? null;
}

/* ---------------- changes (the keeper writes) ---------------- */

let chain = Promise.resolve();

/** Ask the keeper for a change: { op: "add"|"update"|"remove"|"clear"|"phase"|"give"|"take", sceneId, … } */
export function request(msg) {
  const data = { ...msg, sceneId: msg.sceneId ?? canvas?.scene?.id, from: game.user.id };
  if (isKeeper()) return handle(data);
  if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("RPT.NoGM")); return null; }
  game.socket.emit(SOCKET, { type: "op", data });
  return null;
}

/** On the keeper's client: apply a change. */
export function handle(msg) {
  if (!isKeeper() || !msg?.op) return null;
  chain = chain.then(() => apply(msg)).catch(err => console.error(`${MID} |`, err));
  return chain;
}

async function apply(msg) {
  const scene = game.scenes.get(msg.sceneId);
  // A player may only touch the players' traps (and only set, update or pick up theirs).
  const player = !game.users.get(msg.from)?.isGM;
  if (player) {
    if (["clear", "phase"].includes(msg.op)) return;
    if (msg.op === "add" && msg.trap?.side !== "pc") return;
    if (["update", "remove"].includes(msg.op) && trapsOf(scene).find(x => x.id === msg.id)?.side !== "pc") return;
  }
  if (msg.op === "give" || msg.op === "take") return items(msg);
  if (!scene) return;
  if (msg.op === "phase") return scene.setFlag(MID, "phase", msg.open ? { open: true, by: msg.from, at: Date.now() } : null);
  let list = trapsOf(scene);
  if (msg.op === "add" && msg.trap) list.push({ ...msg.trap, by: msg.from });
  if (msg.op === "update") list = list.map(x => (x.id === msg.id ? { ...x, ...msg.patch } : x));
  if (msg.op === "remove") list = list.filter(x => x.id !== msg.id);
  if (msg.op === "clear") list = list.filter(x => msg.side && x.side !== msg.side);
  await scene.setFlag(MID, KEY, encode(list, scene));
}

/* An item change for a character the asking player doesn't own (a trap from a friend's pack). */
async function items(msg) {
  const actor = game.actors.get(msg.actorId);
  if (!actor) return;
  if (msg.op === "take") {
    const item = actor.items.get(msg.itemId);
    if (!item) return;
    const q = (item.system?.quantity ?? 1) - 1;
    if (q > 0) await item.update({ "system.quantity": q });
    else await item.delete();
  }
  if (msg.op === "give" && msg.source) await giveBack(actor, msg.source);
}

/** Put a picked-up trap back in a pack (onto a stack of the same item when there is one). */
export async function giveBack(actor, source) {
  const same = actor.items.find(i => i.type === source.type && i.name === source.name && (i.system?.slug ?? null) === (source.system?.slug ?? null));
  if (same) return same.update({ "system.quantity": (same.system?.quantity ?? 0) + 1 });
  const src = foundry.utils.deepClone(source);
  delete src._id;
  src.system = { ...(src.system ?? {}), quantity: 1 };
  return actor.createEmbeddedDocuments("Item", [src]);
}

/** Take one of an item out of a pack (the player's own, or by the keeper). */
export async function takeOne(item) {
  if (item.isOwner) {
    const q = (item.system?.quantity ?? 1) - 1;
    return q > 0 ? item.update({ "system.quantity": q }) : item.delete();
  }
  return request({ op: "take", actorId: item.actor?.id, itemId: item.id });
}
