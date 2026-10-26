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

// Level DCs, the party, which side a token is on: per game system (systems.mjs).
export { isPlayerSide, levelDC, partyMembers } from "./systems.mjs";
