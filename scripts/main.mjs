import { MID, SOCKET, isKeeper, setting, t } from "./util.mjs";
import { handle, phaseOf } from "./store.mjs";
import { onTokenMove, onTokenMoved, snapshot } from "./trigger.mjs";
import { peek, redraw } from "./draw.mjs";
import { openPlanner, refreshPlanners } from "./planner.mjs";
import { partyKit } from "./kit.mjs";
import { addRutzTools, refreshTools, toolButton } from "./toolbar.mjs";
import { initPoisons, registerPoisonSettings, tuneAll } from "./poison.mjs";
import { registerSettingsMenu } from "./settings.mjs";

/*
 * Rutz's Traps (PF2e · D&D 5e · any system): buttons in the Rutz toolkit group. Players get 함정 설치 (the planner) while the trap-setting time is open, always with "플레이어에게 버튼 보이기", or when "설치는 GM이 연 시간에만" is off; the GM gets 함정 and 몰래 보기.
 * A player's own traps are always marked on the map. game.rutzTraps = { open, peek, kit }
 */

function registerSettings() {
  const s = (key, data) => game.settings.register(MID, key, { scope: "world", config: false, ...data });
  s("dcMode", { name: t("Settings.DcMode"), hint: t("Settings.DcModeHint"), type: String, default: "best",
    choices: { best: t("Settings.DcBest"), level: t("Settings.DcLevel"), item: t("Settings.DcItem") }, onChange: () => { refreshPlanners(); tuneAll(); } });
  s("dcBonus", { name: t("Settings.DcBonus"), hint: t("Settings.DcBonusHint"), type: Number, default: 2, range: { min: -2, max: 6, step: 1 }, onChange: () => { refreshPlanners(); tuneAll(); } });
  registerPoisonSettings(s);
  s("requirePhase", { name: t("Settings.Phase"), hint: t("Settings.PhaseHint"), type: Boolean, default: true, onChange: () => { refreshPlanners(); refreshTools(); } });
  s("pcHits", { name: t("Settings.PcHits"), hint: t("Settings.PcHitsHint"), type: String, default: "enemies", choices: { enemies: t("Settings.Enemies"), all: t("Settings.All") } });
  s("gmHits", { name: t("Settings.GmHits"), hint: t("Settings.GmHitsHint"), type: String, default: "pcs", choices: { pcs: t("Settings.Pcs"), all: t("Settings.All") } });
  s("peekSeconds", { name: t("Settings.PeekSeconds"), hint: t("Settings.PeekSecondsHint"), type: Number, default: 10, range: { min: 3, max: 60, step: 1 } });
  s("peekNotice", { name: t("Settings.PeekNotice"), hint: t("Settings.PeekNoticeHint"), type: Boolean, default: false });
  s("playerTool", { name: t("Settings.PlayerTool"), hint: t("Settings.PlayerToolHint"), type: Boolean, default: false, onChange: () => refreshTools() });
  game.settings.register(MID, "showMarkers", { name: t("Settings.Markers"), hint: t("Settings.MarkersHint"), scope: "client", config: false, type: Boolean, default: true, onChange: () => redraw() });
  registerSettingsMenu();
}

function addTools(controls) {
  const tools = game.user.isGM
    ? [toolButton("rpt-planner", "RPT.Tool.Gm", "fa-solid fa-dharmachakra", 32, () => openPlanner("gm")),
       toolButton("rpt-peek", "RPT.Tool.Peek", "fa-solid fa-user-secret", 33, () => peek())]
    : [toolButton("rpt-planner", "RPT.Tool.Pc", "fa-solid fa-dharmachakra", 32, () => openPlanner("pc"),
        setting("playerTool", false) || !setting("requirePhase", true) || !!phaseOf(canvas?.scene)?.open)];
  addRutzTools(controls, tools);
}

/* The players' trap-setting time opened or closed. */
const lastPhase = new Map();
function phaseChanged(scene) {
  const open = !!phaseOf(scene)?.open;
  const was = lastPhase.get(scene.id) ?? false;
  lastPhase.set(scene.id, open);
  if (open === was || scene.id !== canvas?.scene?.id) return;
  refreshTools();
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
    if (!game.user.isGM) refreshTools();
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
  initPoisons();
  game.rutzTraps = { open: openPlanner, peek, kit: partyKit, tunePoisons: tuneAll };
});
