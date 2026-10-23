import { setting } from "./util.mjs";
import { isTrapItem, itemDC, kindOf, levelDC, levelOf, partyMembers } from "./systems.mjs";

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

export { isTrapItem, itemDC, kindOf, withDC } from "./systems.mjs";
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

/** Every trap item the party carries: [{ actor, item, kind, dc, base, byLevel }]. */
export function partyKit(actors = partyMembers()) {
  const out = [];
  for (const actor of actors) {
    for (const item of actor.items) {
      if (!isTrapItem(item)) continue;
      out.push({ actor, item, kind: kindOf(item), ...trapDC(item, levelOf(actor)) });
    }
  }
  return out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.item.name.localeCompare(b.item.name));
}
