/* ======================================================================== *
 * What differs between game systems: the level DC, which items are traps,
 * a character's level, and how DCs are written in descriptions.
 *
 *   pf2e / sf2e   GM Core level-based DCs; snare / trap / poison traits;
 *                 @Check[…|dc:N] buttons.
 *   dnd5e         8 + proficiency bonus + 3 (a trained setter's DC), so it climbs
 *                 with level like the DMG's setback → dangerous range; poisons
 *                 (consumable type "poison") and caltrops, ball bearings, hunting
 *                 traps, nets, snares; [[/save … dc=N]] enrichers.
 *   anything else 10 + half the level; items named like a trap.
 * The DC setting (+2 by default) is added on top in every system.
 * ======================================================================== */

const id = () => game.system?.id ?? "";
export const isPF2e = () => ["pf2e", "sf2e"].includes(id());
export const isDnd5e = () => id() === "dnd5e";

/* PF2e level-based DCs (GM Core). */
const PF2E_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];

/** The DC a trap set by a character of this level would have. */
export function levelDC(level) {
  const lv = Math.max(0, Math.round(Number(level) || 0));
  if (isPF2e()) return PF2E_DC[Math.min(25, lv)];
  if (isDnd5e()) return 8 + (2 + Math.floor((Math.max(1, lv) - 1) / 4)) + 3;
  return 10 + Math.floor(lv / 2);
}

/** A character's (or creature's) level: PF2e level, 5e class level or CR, else whatever the system calls it. */
export function levelOf(actor) {
  if (!actor) return 1;
  if (isPF2e()) return Number(actor.level ?? 1) || 1;
  const s = actor.system ?? {};
  const lv = s.details?.level?.value ?? s.details?.level ?? s.attributes?.level?.value ?? s.level?.value ?? s.level ?? s.details?.cr ?? actor.level;
  return Math.max(0, Number(lv) || 1);
}

/** An item's own level (PF2e items have one; 5e items don't). */
export function itemLevel(item) {
  return Number(item?.system?.level?.value ?? 0) || 0;
}

const TRAP_NAME = /caltrop|ball bearing|hunting trap|bear trap|snare|\bnet\b|trap|마름쇠|덫|함정|올무|그물/i;
const POISON_NAME = /poison|venom|toxin|독/i;

/** "snare" | "trap" | "poison" | null */
export function kindOf(item) {
  if (!item) return null;
  const name = String(item.name ?? "");
  if (isPF2e()) {
    const traits = item.system?.traits?.value ?? [];
    const slug = String(item.system?.slug ?? "").toLowerCase();
    if (traits.includes("snare")) return "snare";
    if (traits.includes("trap") || slug === "caltrops" || /caltrops|마름쇠/i.test(name)) return "trap";
    if (traits.includes("poison")) return "poison";
    return null;
  }
  const ident = String(item.system?.identifier ?? "");
  const sub = item.system?.type?.value ?? item.system?.consumableType ?? "";
  if (sub === "poison") return "poison";
  if (/snare|올무/i.test(`${ident} ${name}`)) return "snare";
  if (TRAP_NAME.test(`${ident} ${name}`)) return "trap";
  if (POISON_NAME.test(name) && item.type === "consumable") return "poison";
  return null;
}

/** Can this item be set as a trap from a pack? */
export function isTrapItem(item) {
  if (!item || !kindOf(item)) return false;
  const qty = Number(item.system?.quantity ?? 1);
  if (qty <= 0) return false;
  if (isPF2e()) return item.type === "consumable";
  return ["consumable", "loot", "equipment", "tool", "item", "gear"].includes(item.type);
}

/** The DC written in the item: @Check[…dc:N], [[/save … dc=N]], or "DC N". */
export function itemDC(item) {
  const text = String(item?.system?.description?.value ?? item?.desc ?? "");
  const m = /@Check\[[^\]]*?\bdc:(\d+)/i.exec(text) ?? /\[\[\/(?:save|check|skill)[^\]]*?\bdc=(\d+)/i.exec(text) ?? /\bDC\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

/** The description with its DCs changed to the trap's (so the roll buttons roll against it). */
export function withDC(html, dc) {
  return String(html ?? "")
    .replace(/(@Check\[[^\]]*?\bdc:)(\d+)/gi, `$1${dc}`)
    .replace(/(\[\[\/(?:save|check|skill)[^\]]*?\bdc=)(\d+)/gi, `$1${dc}`)
    .replace(/\bDC\s*(\d+)/g, `DC ${dc}`);
}

/** Player characters of the party: PF2e's party actor or 5e's group actor first, else every player-owned character. */
export function partyMembers() {
  const party = game.actors.party ?? game.actors.find(a => a.type === "party" || a.type === "group");
  const raw = party?.members ?? party?.system?.members ?? [];
  const members = [...raw].map(m => m?.actor ?? m).filter(a => a?.type === "character");
  if (members.length) return members;
  return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
}

/** Does this token stand with the players? (PF2e alliance, else ownership or a friendly token.) */
export function isPlayerSide(actor, token = null) {
  if (!actor) return false;
  if (actor.hasPlayerOwner) return true;
  if (isPF2e()) return actor.alliance === "party";
  const friendly = globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;
  return (token?.disposition ?? actor.prototypeToken?.disposition) === friendly;
}
