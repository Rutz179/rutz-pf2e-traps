import { MID, esc, t } from "./util.mjs";

/*
 * The module's settings window. Foundry's list holds one button (registerMenu); every setting is config: false and has a row here, under a few headings in one scrolling column.
 * A row is drawn only for a setting that is registered (poisonHalf / poisonCoat are PF2e only); players see only client-scope rows. A change saves at once through game.settings.set, so the setting's onChange runs.
 */

/** [heading, [keys]]: every registered setting is in exactly one row. */
export const LAYOUT = [
  ["dc", ["dcMode", "dcBonus"]],
  ["place", ["requirePhase", "playerTool", "showMarkers"]],
  ["spring", ["pcHits", "gmHits", "peekSeconds", "peekNotice"]],
  ["poison", ["poisonTune", "poisonHalf", "poisonCoat"]]
];

/** Settings with no row (none: each one is something the GM chooses). */
export const INTERNAL = [];

function registered(key, all = game.settings.settings) {
  return all?.get?.(`${MID}.${key}`) ?? null;
}

/** How a setting is edited: a toggle, a select or a number box. */
export function kindOf(cfg) {
  if (cfg?.choices && Object.keys(cfg.choices).length) return "select";
  if (cfg?.type === Boolean) return "bool";
  if (cfg?.type === Number) return "number";
  return "text";
}

/** What the window shows: [{ id, rows: [{ key, name, hint, kind, choices, range, value, client }] }]; gm: the viewer is a GM (else only client rows). */
export function settingsView({ all = game.settings.settings, get = k => game.settings.get(MID, k), gm = game.user?.isGM } = {}) {
  const out = [];
  for (const [id, keys] of LAYOUT) {
    const rows = [];
    for (const key of keys) {
      const cfg = registered(key, all);
      if (!cfg || (!gm && cfg.scope !== "client")) continue;
      let value;
      try { value = get(key); } catch (_) { value = cfg.default; }
      // the same hint as the row above (pcHits / gmHits) is shown once
      const hint = cfg.hint && cfg.hint !== rows.at(-1)?.fullHint ? cfg.hint : "";
      rows.push({ key, name: cfg.name ?? key, hint, fullHint: cfg.hint ?? "", kind: kindOf(cfg), choices: cfg.choices ?? null, range: cfg.range ?? null, value, client: cfg.scope === "client" });
    }
    if (rows.length) out.push({ id, rows });
  }
  return out;
}

/** A form value back to the setting's type: numbers kept in their range and step, choices only from the list. */
export function parseValue(cfg, raw) {
  const kind = kindOf(cfg);
  if (kind === "bool") return raw === true || raw === "true" || raw === "on";
  if (kind === "select") return Object.hasOwn(cfg.choices, String(raw)) ? String(raw) : cfg.default;
  if (kind === "number") {
    let n = Number(raw);
    if (raw === "" || raw === null || !Number.isFinite(n)) return cfg.default;
    const r = cfg.range;
    if (r) {
      if (Number.isFinite(r.step) && r.step > 0) n = Math.round((n - (r.min ?? 0)) / r.step) * r.step + (r.min ?? 0);
      n = Math.max(r.min ?? -Infinity, Math.min(r.max ?? Infinity, n));
    }
    return n;
  }
  return String(raw ?? "");
}

/** Save one row (the setting's own onChange runs). Returns the value saved. */
export async function saveRow(key, raw, { all = game.settings.settings } = {}) {
  const cfg = registered(key, all);
  if (!cfg) return undefined;
  const value = parseValue(cfg, raw);
  await game.settings.set(MID, key, value);
  return value;
}

function inputHtml(r) {
  const key = `data-key="${esc(r.key)}"`;
  if (r.kind === "bool") return `<input type="checkbox" ${key} ${r.value ? "checked" : ""}>`;
  if (r.kind === "select") return `<select ${key}>${Object.entries(r.choices).map(([k, l]) => `<option value="${esc(k)}" ${String(r.value) === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  if (r.kind === "number") {
    const g = r.range ?? {};
    return `<input type="number" ${key} value="${esc(r.value)}"${Number.isFinite(g.min) ? ` min="${g.min}"` : ""}${Number.isFinite(g.max) ? ` max="${g.max}"` : ""} step="${Number.isFinite(g.step) ? g.step : "any"}">`;
  }
  return `<input type="text" ${key} value="${esc(r.value)}">`;
}

export function settingsHtml(view) {
  if (!view.length) return `<div class="rpt-set"><p class="hint">${t("Settings.Nothing")}</p></div>`;
  const body = view.map(s => `<section><h4>${t(`Settings.Section.${s.id}`)}</h4>
    ${s.rows.map(r => `<div class="srow"><div class="tx"><b>${esc(r.name)}${r.client ? ` <small class="tag">${t("Settings.ClientTag")}</small>` : ""}</b>${r.hint ? `<small>${esc(r.hint)}</small>` : ""}</div><div class="in">${inputHtml(r)}</div></div>`).join("")}</section>`).join("");
  return `<div class="rpt-set"><div class="body">${body}</div></div>`;
}

export class TrapSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "rpt-settings", classes: ["rpt-app", "rpt-settings-win"], window: { title: "RPT.Settings.Window", icon: "fa-solid fa-sliders", resizable: true }, position: { width: 520, height: 560 } };

  constructor(options = {}) {
    // Foundry makes a new one for each click on the menu button: the open one comes forward instead.
    const open = foundry.applications.instances?.get?.("rpt-settings");
    if (open) { open.bringToFront?.(); return open; }
    // A player has one row: a smaller window.
    super(game.user?.isGM ? options : foundry.utils.mergeObject({ position: { width: 420, height: "auto" } }, options));
  }

  async _renderHTML() {
    return settingsHtml(settingsView());
  }

  _replaceHTML(result, content) {
    const top = content.querySelector(".body")?.scrollTop ?? 0;
    content.innerHTML = result;
    if (top) content.querySelector(".body").scrollTop = top;
  }

  _onFirstRender() {
    this.element.querySelector(".window-content").addEventListener("change", async ev => {
      const el = ev.target;
      const key = el.dataset?.key;
      if (!key) return;
      const v = await saveRow(key, el.type === "checkbox" ? el.checked : el.value);
      // a number out of its range: the box shows what was kept
      if (el.type === "number" && v !== undefined && String(v) !== el.value) el.value = v;
    });
  }
}

/** The one entry in Foundry's list. Players may open it too (showMarkers is theirs). */
export function registerSettingsMenu() {
  const client = LAYOUT.flatMap(([, k]) => k).some(k => registered(k)?.scope === "client");
  game.settings.registerMenu(MID, "config", {
    name: t("Settings.Menu"), label: t("Settings.MenuLabel"), hint: t("Settings.MenuHint"),
    icon: "fa-solid fa-sliders", type: TrapSettings, restricted: !client
  });
}
