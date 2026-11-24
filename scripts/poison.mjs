import { MID, esc, isKeeper, setting, t } from "./util.mjs";
import { isPF2e, itemDC, kindOf, levelOf, partyMembers } from "./systems.mjs";
import { trapDC } from "./kit.mjs";

/*
 * Poisons the players carry: like a shop trap, a poison keeps its own low DC while monsters are higher level.
 * Tuning (GM's client, setting poisonTune): a player character's poison gets its DC rewritten in the item by the trap rule (dcMode / dcBonus); the original text stays in a flag and returns when the setting is off or the poison leaves the players. poisonHalf (PF2e house rule) adds a line: a successful save still takes half the stage 1 damage.
 * Coating (PF2e, poisonCoat): an injury poison asks which weapon it goes on; the next hitting Strike brings up its card, a critical failure wastes it, it dries at the end of the owner's next turn.
 */

const FLAG = "poison";
const COAT = "coat";

/** A poison item (PF2e: the poison category, not every item with the poison trait). */
export function isPoisonItem(item) {
  if (!item || item.type !== "consumable") return false;
  if (isPF2e()) return item.system?.category === "poison";
  return kindOf(item) === "poison";
}

const isInjury = item => (item?.system?.traits?.value ?? []).includes("injury");

function isPc(actor) {
  if (actor?.type !== "character") return false;
  return actor.hasPlayerOwner || partyMembers().some(a => a.id === actor.id);
}

/** The item's own text, before tuning. */
export function origDesc(item) {
  return item?.flags?.[MID]?.[FLAG]?.orig ?? item?.system?.description?.value ?? "";
}

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };

/** Only the DCs that were the item's own number change (a flat check's DC 5 stays). */
function retune(html, from, to) {
  if (!from || !to || from === to) return html;
  const same = n => Number(n) === from;
  return String(html ?? "")
    .replace(/(@Check\[[^\]]*?\bdc:)(\d+)/gi, (m, a, n) => same(n) ? `${a}${to}` : m)
    .replace(/(\[\[\/(?:save|check|skill)[^\]]*?\bdc=)(\d+)/gi, (m, a, n) => same(n) ? `${a}${to}` : m)
    .replace(/(\[\[\/(?:save|check)\s+[a-z]+\s+)(\d+)/gi, (m, a, n) => same(n) ? `${a}${to}` : m)
    .replace(/\bDC\s*(\d+)/g, (m, n) => same(n) ? `DC ${to}` : m);
}

/** The first damage of the poison (its stage 1): "1d6[poison]" or null. */
function firstDamage(html) {
  const m = /@Damage\[((?:[^[\]]|\[[^\]]*\])*)\]/i.exec(String(html ?? ""));
  return m ? m[1] : null;
}

function houseLine(orig) {
  if (!isPF2e() || !setting("poisonHalf", true)) return "";
  const dmg = firstDamage(orig);
  if (!dmg) return "";
  return `<p class="rpt-house"><strong>${t("Poison.HalfTitle")}</strong> ${t("Poison.HalfText")} @Damage[${dmg}]</p>`;
}

function stripHouse(html) {
  const title = t("Poison.HalfTitle").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html ?? "")
    .replace(/<p class="rpt-house">[\s\S]*?<\/p>/g, "")
    .replace(new RegExp(`<p>\\s*<strong>${title}</strong>[\\s\\S]*?</p>`, "g"), "");
}

/** Bring one item in line with the settings (tune it, or give it its text back). */
export async function tune(item) {
  if (!isPoisonItem(item) || !item.parent) return;
  const flag = item.flags?.[MID]?.[FLAG];
  const cur = item.system?.description?.value ?? "";
  let orig = flag?.orig ?? cur;
  // edited by hand since it was tuned: that text (with its own DC put back) is the original now
  if (flag && hash(cur) !== flag.sig) orig = retune(stripHouse(cur), flag.dc, flag.base);
  const want = setting("poisonTune", true) && isPc(item.parent);
  if (!want) {
    if (flag) await item.update({ "system.description.value": orig, [`flags.${MID}.-=${FLAG}`]: null }, { [MID]: true });
    return;
  }
  const plain = { system: { description: { value: orig } } };
  const base = itemDC(plain);
  const dc = base ? trapDC(plain, levelOf(item.parent)).dc : null;
  const out = retune(orig, base, dc) + houseLine(orig);
  if (flag && out === cur && flag.dc === dc) return;
  if (!flag && out === cur) return;
  await item.update({ "system.description.value": out, [`flags.${MID}.${FLAG}`]: { orig, base, dc, sig: hash(out) } }, { [MID]: true });
}

async function tuneActor(actor) {
  for (const item of actor?.items ?? []) if (isPoisonItem(item)) await tune(item).catch(err => console.warn(`${MID} | poison`, err));
}

let busy = Promise.resolve();
/** Every poison in the world: player characters' tuned, the rest given their text back. */
export function tuneAll() {
  if (!isKeeper()) return busy;
  busy = busy.then(async () => {
    for (const actor of game.actors) await tuneActor(actor);
    for (const item of game.items) if (item.flags?.[MID]?.[FLAG]) await item.update({ "system.description.value": item.flags[MID][FLAG].orig, [`flags.${MID}.-=${FLAG}`]: null }, { [MID]: true }).catch(() => null);
  });
  return busy;
}

/* coating a weapon (PF2e) */

function weaponsOf(actor) {
  const list = actor.items.filter(i => i.type === "weapon" || i.type === "melee");
  const held = w => (w.system?.equipped?.carryType === "held" ? 0 : w.isEquipped ? 1 : 2);
  return list.sort((a, b) => held(a) - held(b) || a.name.localeCompare(b.name));
}

/** Which weapon gets this poison: the weapon, "plain" (use it without coating), or null (cancelled). */
async function pickWeapon(poison, weapons) {
  const opts = weapons.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
  const DialogV2 = foundry.applications.api.DialogV2;
  const res = await DialogV2.wait({
    window: { title: t("Coat.Title"), icon: "fa-solid fa-flask-vial" },
    content: `<p>${esc(t("Coat.Pick", { poison: poison.name }))}</p><select name="weapon" style="width:100%">${opts}</select>`,
    buttons: [
      { action: "coat", label: t("Coat.Apply"), icon: "fa-solid fa-droplet", default: true, callback: (ev, button) => button.form.elements.weapon.value },
      { action: "plain", label: t("Coat.Plain") }
    ],
    rejectClose: false
  }).catch(() => null);
  if (!res) return null;
  if (res === "plain") return "plain";
  return weapons.find(w => w.id === res) ?? null;
}

async function coat(weapon, snap) {
  const actor = weapon.actor;
  const c = game.combat;
  const inFight = c?.started && c.combatants.some(x => x.actor?.id === actor.id);
  await weapon.setFlag(MID, COAT, { ...snap, combat: inFight ? c.id : null, round: inFight ? c.round : null });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="rpt-card poison"><header><img src="${esc(snap.img)}" alt=""><div><b>${esc(t("Coat.Applied", { weapon: weapon.name }))}</b>
      <small>${esc(snap.name)} · DC ${snap.dc ?? "—"}</small></div></header><p class="note">${t("Coat.Rule")}</p></div>`
  });
}

function wrapConsume() {
  const cls = CONFIG.PF2E?.Item?.documentClasses?.consumable;
  const proto = cls?.prototype;
  if (!proto?.consume || proto.consume[MID]) return;
  const original = proto.consume;
  const wrapped = async function (...args) {
    if (!setting("poisonCoat", true) || !isPoisonItem(this) || !isInjury(this) || !this.actor) return original.apply(this, args);
    const weapons = weaponsOf(this.actor);
    if (!weapons.length) return original.apply(this, args);
    const pick = await pickWeapon(this, weapons);
    if (pick === null) return;
    const snap = { name: this.name, img: this.img, desc: this.system?.description?.value ?? "", dc: itemDC(this), uuid: this.uuid };
    await original.apply(this, args);
    if (pick !== "plain") await coat(pick, snap).catch(err => console.warn(`${MID} | coat`, err));
  };
  wrapped[MID] = true;
  proto.consume = wrapped;
}

/** A Strike landed (or not) with a coated weapon: the poison goes in, is wasted, or waits. */
async function onAttack(msg) {
  if ((msg.author ?? msg.user)?.id !== game.user.id) return;
  const ctx = msg.flags?.pf2e?.context;
  if (ctx?.type !== "attack-roll") return;
  const uuid = msg.flags?.pf2e?.origin?.uuid;
  const weapon = uuid ? fromUuidSync(uuid) : null;
  const c = weapon?.getFlag?.(MID, COAT);
  if (!c) return;
  const outcome = ctx.outcome;
  const speaker = ChatMessage.getSpeaker({ actor: weapon.actor });
  if (outcome === "success" || outcome === "criticalSuccess") {
    await weapon.unsetFlag(MID, COAT);
    const target = ctx.target?.token ? fromUuidSync(ctx.target.token) : null;
    const who = target?.name ?? (ctx.target?.actor ? fromUuidSync(ctx.target.actor)?.name : null) ?? "?";
    return ChatMessage.create({
      speaker,
      content: `<div class="rpt-card poison"><header><img src="${esc(c.img)}" alt=""><div><b>${esc(c.name)}</b>
        <small>${esc(weapon.name)} · DC ${c.dc ?? "—"}</small></div></header>
        <p class="who"><i class="fa-solid fa-droplet"></i> ${esc(t("Coat.Hit", { target: who }))}</p>
        <div class="desc">${c.desc}</div></div>`
    });
  }
  if (outcome === "criticalFailure") {
    await weapon.unsetFlag(MID, COAT);
    return ChatMessage.create({ speaker, content: `<div class="rpt-card note">${esc(t("Coat.Wasted", { weapon: weapon.name, poison: c.name }))}</div>` });
  }
  if (!outcome) ui.notifications.info(t("Coat.NoTarget", { poison: c.name }));
}

/** The owner's next turn is over: the poison on their weapons has dried. */
async function onTurnEnd(combat, prior) {
  if (!isKeeper() || !prior?.combatantId) return;
  const actor = combat.combatants.get(prior.combatantId)?.actor;
  for (const w of actor?.items ?? []) {
    const c = w.getFlag?.(MID, COAT);
    if (!c || c.combat !== combat.id || !((prior.round ?? 0) > (c.round ?? 0))) continue;
    await w.unsetFlag(MID, COAT);
    const owners = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: owners, content: `<div class="rpt-card note">${esc(t("Coat.Dried", { weapon: w.name, poison: c.name }))}</div>` });
  }
}

async function onCombatEnd(combat) {
  if (!isKeeper()) return;
  for (const cb of combat.combatants) {
    for (const w of cb.actor?.items ?? []) if (w.getFlag?.(MID, COAT)?.combat === combat.id) await w.unsetFlag(MID, COAT).catch(() => null);
  }
}

/* wiring */

export function registerPoisonSettings(s) {
  const retuneAll = () => tuneAll();
  s("poisonTune", { name: t("Settings.PoisonTune"), hint: t("Settings.PoisonTuneHint"), type: Boolean, default: true, onChange: retuneAll });
  if (isPF2e()) {
    s("poisonHalf", { name: t("Settings.PoisonHalf"), hint: t("Settings.PoisonHalfHint"), type: Boolean, default: true, onChange: retuneAll });
    s("poisonCoat", { name: t("Settings.PoisonCoat"), hint: t("Settings.PoisonCoatHint"), type: Boolean, default: true });
  }
}

export function initPoisons() {
  if (isPF2e()) {
    wrapConsume();
    Hooks.on("createChatMessage", msg => { onAttack(msg).catch(err => console.warn(`${MID} | coat`, err)); });
    Hooks.on("combatTurnChange", (combat, prior) => { onTurnEnd(combat, prior).catch(err => console.warn(`${MID} | coat`, err)); });
    Hooks.on("deleteCombat", combat => { onCombatEnd(combat).catch(() => null); });
  }
  const one = item => { if (isKeeper() && isPoisonItem(item)) busy = busy.then(() => tune(item)).catch(err => console.warn(`${MID} | poison`, err)); };
  Hooks.on("createItem", one);
  Hooks.on("updateItem", (item, changes, options) => {
    if (options?.[MID] || !foundry.utils.hasProperty(changes, "system.description.value")) return;
    one(item);
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (!isKeeper()) return;
    if (!foundry.utils.hasProperty(changes, "system.details.level") && !("ownership" in changes)) return;
    busy = busy.then(() => tuneActor(actor));
  });
  tuneAll();
}
