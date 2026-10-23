import { MID, SOCKET, isKeeper, setting, t } from "./util.mjs";
import { handle, phaseOf } from "./store.mjs";
import { onTokenMove, onTokenMoved, snapshot } from "./trigger.mjs";
import { markersHidden, peek, redraw, setHidden } from "./draw.mjs";
import { openPlanner, refreshPlanners } from "./planner.mjs";
import { partyKit } from "./kit.mjs";

/* ======================================================================== *
 * Rutz's Traps (PF2e · D&D 5e · any system).
 * Token controls (left toolbar):
 *   players  함정 설치 (the planner) · 함정 표시 (show/hide your markers)
 *   GM       함정 (GM's planner: the players' trap-setting time, GM traps) · 몰래 보기
 * game.rutzTraps = { open, peek, kit }
 * ======================================================================== */

function registerSettings() {
  const s = (key, data) => game.settings.register(MID, key, { scope: "world", config: true, ...data });
  s("dcMode", { name: t("Settings.DcMode"), hint: t("Settings.DcModeHint"), type: String, default: "best",
    choices: { best: t("Settings.DcBest"), level: t("Settings.DcLevel"), item: t("Settings.DcItem") }, onChange: () => refreshPlanners() });
  s("dcBonus", { name: t("Settings.DcBonus"), hint: t("Settings.DcBonusHint"), type: Number, default: 2, range: { min: -2, max: 6, step: 1 }, onChange: () => refreshPlanners() });
  s("requirePhase", { name: t("Settings.Phase"), hint: t("Settings.PhaseHint"), type: Boolean, default: true, onChange: () => refreshPlanners() });
  s("pcHits", { name: t("Settings.PcHits"), hint: t("Settings.PcHitsHint"), type: String, default: "enemies", choices: { enemies: t("Settings.Enemies"), all: t("Settings.All") } });
  s("gmHits", { name: t("Settings.GmHits"), hint: t("Settings.GmHitsHint"), type: String, default: "pcs", choices: { pcs: t("Settings.Pcs"), all: t("Settings.All") } });
  s("peekSeconds", { name: t("Settings.PeekSeconds"), type: Number, default: 10, range: { min: 3, max: 60, step: 1 } });
  s("peekNotice", { name: t("Settings.PeekNotice"), hint: t("Settings.PeekNoticeHint"), type: Boolean, default: false });
  game.settings.register(MID, "showMarkers", { name: t("Settings.Markers"), hint: t("Settings.MarkersHint"), scope: "client", config: true, type: Boolean, default: true, onChange: () => redraw() });
}

/* A scene-control button: v13+ calls onChange (giving onClick too ran it twice). */
const handler = fn => (game.release?.generation ?? 13) >= 13 ? { onChange: fn } : { onClick: fn };

function addTools(controls) {
  const gm = game.user.isGM;
  const tools = gm
    ? [{ name: "rpt-planner", title: "RPT.Tool.Gm", icon: "fa-solid fa-dharmachakra", button: true, order: 96, visible: true, ...handler(() => openPlanner("gm")) },
       { name: "rpt-peek", title: "RPT.Tool.Peek", icon: "fa-solid fa-user-secret", button: true, order: 97, visible: true, ...handler(() => peek()) }]
    : [{ name: "rpt-planner", title: "RPT.Tool.Pc", icon: "fa-solid fa-dharmachakra", button: true, order: 96, visible: true, ...handler(() => openPlanner("pc")) },
       { name: "rpt-markers", title: "RPT.Tool.Markers", icon: "fa-solid fa-eye-slash", button: true, order: 97, visible: true,
         ...handler(() => { setHidden(!markersHidden()); ui.notifications.info(t(markersHidden() ? "Tool.Hidden" : "Tool.Shown")); }) }];
  if (Array.isArray(controls)) controls.find(c => c.name === "token")?.tools.push(...tools);
  else { const tk = controls.tokens ?? controls.token; if (tk?.tools) for (const tool of tools) tk.tools[tool.name] = tool; }
}

/* The players' trap-setting time opened or closed. */
const lastPhase = new Map();
function phaseChanged(scene) {
  const open = !!phaseOf(scene)?.open;
  const was = lastPhase.get(scene.id) ?? false;
  lastPhase.set(scene.id, open);
  if (open === was || scene.id !== canvas?.scene?.id) return;
  if (game.user.isGM) return ui.notifications.info(t(open ? "Phase.GmOpen" : "Phase.GmClosed"));
  ui.notifications.info(t(open ? "Phase.Open" : "Phase.Closed"));
  if (open) openPlanner("pc");
}

Hooks.once("init", registerSettings);
Hooks.on("getSceneControlButtons", addTools);

Hooks.once("ready", () => {
  // Any system: PF2e and D&D 5e have their DC rules and trap items (systems.mjs), others use the generic ones.
  game.socket.on(SOCKET, msg => { if (msg?.type === "op" && isKeeper()) handle(msg.data); });
  Hooks.on("canvasReady", () => {
    snapshot();
    if (canvas.scene) lastPhase.set(canvas.scene.id, !!phaseOf(canvas.scene)?.open);
    redraw();
  });
  Hooks.on("createToken", doc => snapshot(doc.parent));
  Hooks.on("moveToken", (doc, movement, operation) => onTokenMove(doc, movement, operation));
  Hooks.on("updateToken", (doc, changes, options) => onTokenMoved(doc, changes, options));
  Hooks.on("updateScene", (scene, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${MID}`) && !Object.keys(changes).some(k => k.startsWith(`flags.${MID}`))) return;
    if (scene.id === canvas?.scene?.id) refreshPlanners();
    phaseChanged(scene);
  });
  // The pack changed (a trap used up, picked back up): the planner's list follows.
  const kitChanged = item => { if (item?.parent?.type === "character") foundry.applications.instances.get("rpt-planner-pc")?.render(); };
  Hooks.on("updateItem", kitChanged);
  Hooks.on("createItem", kitChanged);
  Hooks.on("deleteItem", kitChanged);
  if (canvas?.ready) { snapshot(); lastPhase.set(canvas.scene?.id, !!phaseOf()?.open); redraw(); }
  game.rutzTraps = { open: openPlanner, peek, kit: partyKit };
});
