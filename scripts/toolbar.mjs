/*
 * The Rutz modules' shared toolbar group (left toolbar: "러츠 툴킷"): every Rutz module adds its buttons here, so the token column keeps Foundry's own tools.
 * Whichever module runs first makes the group; the same file is in every Rutz module, so any works alone.
 */

const GROUP = "rutzToolkit";
// The group's resting tool: a plain tool, so opening the group never fires a button; same name as the HUD's, so the group has one whoever made it.
const HOME = "pkhHome";

/** The group's resting tool: picking it uses no tool (it is not a second toolkit). */
function homeTitle() {
  const key = "PKH.Toolkit.Home";
  if (game.i18n.has?.(key)) return game.i18n.localize(key);
  return game.i18n.lang === "ko" ? "도구 고르기 (아무것도 하지 않음)" : "Pick a tool (does nothing)";
}

function groupTitle() {
  const key = "PKH.Toolkit.Title";
  if (game.i18n.has?.(key)) return game.i18n.localize(key);
  return game.i18n.lang === "ko" ? "러츠 툴킷" : "Rutz toolkit";
}

/** A scene-control button: v13+ calls onChange (giving onClick too ran it twice). */
export function toolButton(name, title, icon, order, fn, visible = true) {
  const run = (game.release?.generation ?? 13) >= 13 ? { onChange: () => fn() } : { onClick: () => fn() };
  return { name, title, icon, order, button: true, visible: !!visible, ...run };
}

/** Put these buttons in the Rutz group (made here when no other Rutz module has made it yet). */
export function addRutzTools(controls, tools) {
  tools = tools.filter(Boolean);
  if (!tools.length) return;
  if (Array.isArray(controls)) {          // v12: no shared group there, so the token controls
    controls.find(c => c.name === "token")?.tools.push(...tools.filter(tl => tl.visible !== false));
    return;
  }
  if (!controls[GROUP]) {
    const title = groupTitle();
    controls[GROUP] = {
      name: GROUP, title, icon: "fa-solid fa-toolbox", order: Object.keys(controls).length,
      visible: true, activeTool: HOME,
      tools: { [HOME]: { name: HOME, title: homeTitle(), icon: "fa-solid fa-arrow-pointer", order: 0, onChange: () => {} } }
    };
  }
  const group = controls[GROUP];
  group.tools ??= {};
  for (const tool of tools) group.tools[tool.name] = tool;
}

/** Draw the toolbar again: a button was shown or hidden. */
let timer = 0;
export function refreshTools() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { ui.controls?.render?.({ reset: true }); } catch (_) { /* the toolbar isn't up yet */ }
  }, 60);
}
