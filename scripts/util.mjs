export const MID = "rutz-pf2e-traps";
export const SOCKET = `module.${MID}`;

export function t(key, data) {
  const k = `RPT.${key}`;
  return data ? game.i18n.format(k, data) : game.i18n.localize(k);
}
export const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
export function setting(key, fallback = null) {
  try { return game.settings.get(MID, key); } catch (_) { return fallback; }
}
export const isKeeper = () => game.users.activeGM?.id === game.user.id;

/* PF2e level-based DCs (GM Core). */
const LEVEL_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
export function levelDC(level) {
  return LEVEL_DC[Math.max(0, Math.min(25, Math.round(Number(level) || 0)))];
}

/** Player characters of the party (PF2e party actor first, else every player-owned character). */
export function partyMembers() {
  const party = game.actors.party ?? game.actors.find(a => a.type === "party");
  const members = party?.members?.filter(a => a?.type === "character") ?? [];
  if (members.length) return members;
  return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
}

/** Does this token's actor stand with the players? */
export const isPlayerSide = actor => !!actor && (actor.hasPlayerOwner || actor.alliance === "party");
