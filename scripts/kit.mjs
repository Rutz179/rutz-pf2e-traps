import { MID, setting, t } from "./util.mjs";
import { isTrapItem, itemDC, kindOf, levelDC, levelOf, partyMembers } from "./systems.mjs";

/*
 * What the party can set: snares, traps, poisons and caltrops in their packs.
 * DC (setting dcMode): item = the item's own, level = the setter's level DC (GM Core) + bonus, best = the higher (default). The sprung description carries the new DC, @Check buttons too.
 */

const KINDS = ["snare", "trap", "poison"];

export { isTrapItem, itemDC, kindOf, withDC } from "./systems.mjs";
/** The DC settings: { mode ("best" | "level" | "item"), bonus }. */
export function dcRule() {
  return { mode: setting("dcMode", "best"), bonus: Number(setting("dcBonus", 2)) || 0 };
}

/** The line under the party's kit: the DC rule the setting picks (any other mode counts as "item", as in trapDC). */
export function dcLine() {
  const { mode, bonus } = dcRule();
  const key = mode === "best" || mode === "level" ? mode : "item";
  return t(`Pc.KitHint.${key}`, { bonus: bonus ? ` ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}` : "" });
}

/** { dc, base, byLevel } for an item set by a character of this level. */
export function trapDC(item, level) {
  // a poison already tuned to its owner (poison.mjs): its own DC is in the text it was bought with
  const orig = item?.flags?.[MID]?.poison?.orig;
  const base = itemDC(orig ? { system: { description: { value: orig } } } : item);
  const { mode, bonus } = dcRule();
  const byLevel = levelDC(level) + bonus;
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
