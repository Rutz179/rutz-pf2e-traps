import { levelDC, partyMembers, setting } from "./util.mjs";

/* ======================================================================== *
 * What the party can set: snares, traps, poisons and caltrops in their packs.
 *
 * The DC. A snare or poison keeps the DC of its own (low) item level, while
 * the monsters it is set for are usually higher level than the party — so a
 * trap from the shop barely matters. Setting dcMode:
 *   item   the item's own DC
 *   level  the DC for the setter's level (GM Core) + a bonus (setting, +2)
 *   best   whichever is higher (default)
 * The description shown when it springs carries the new DC (its @Check
 * buttons too), so the save is rolled against it.
 * ======================================================================== */

const KINDS = ["snare", "trap", "poison"];

export function kindOf(item) {
  const traits = item?.system?.traits?.value ?? [];
  const slug = String(item?.system?.slug ?? "").toLowerCase();
  if (traits.includes("snare")) return "snare";
  if (traits.includes("trap") || slug === "caltrops" || /caltrops|마름쇠/i.test(item?.name ?? "")) return "trap";
  if (traits.includes("poison")) return "poison";
  return null;
}

export function isTrapItem(item) {
  return item?.type === "consumable" && !!kindOf(item) && (item.system?.quantity ?? 1) > 0;
}

/** The DC written in the item (a @Check's dc, else "DC 17" in the text), or null. */
export function itemDC(item) {
  const text = String(item?.system?.description?.value ?? item?.desc ?? "");
  const m = /@Check\[[^\]]*?\bdc:(\d+)/i.exec(text) ?? /\bDC\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

/** { dc, base, byLevel } for an item set by a character of this level. */
export function trapDC(item, level) {
  const base = itemDC(item);
  const byLevel = levelDC(level) + (Number(setting("dcBonus", 2)) || 0);
  const mode = setting("dcMode", "best");
  let dc = base ?? byLevel;
  if (mode === "level") dc = byLevel;
  else if (mode === "best") dc = Math.max(base ?? 0, byLevel);
  return { dc, base, byLevel };
}

/** The description with its DCs changed to the trap's (so @Check buttons roll against it). */
export function withDC(html, dc) {
  return String(html ?? "")
    .replace(/(@Check\[[^\]]*?\bdc:)(\d+)/gi, `$1${dc}`)
    .replace(/\bDC\s*(\d+)/g, `DC ${dc}`);
}

/** Every trap item the party carries: [{ actor, item, kind, dc, base, byLevel }]. */
export function partyKit(actors = partyMembers()) {
  const out = [];
  for (const actor of actors) {
    for (const item of actor.items) {
      if (!isTrapItem(item)) continue;
      out.push({ actor, item, kind: kindOf(item), ...trapDC(item, actor.level) });
    }
  }
  return out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.item.name.localeCompare(b.item.name));
}
