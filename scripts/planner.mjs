import { MID, esc, levelDC, partyMembers, setting, t } from "./util.mjs";
import { giveBack, phaseOf, request, takeOne, trapsOf } from "./store.mjs";
import { itemDC, kindOf, partyKit, trapDC } from "./kit.mjs";
import { pickSquare } from "./place.mjs";
import { peek, peeking, redraw, setHighlight } from "./draw.mjs";

/* ======================================================================== *
 * 함정 설치 창.
 * Players: what the party carries (snares, traps, poisons, caltrops — every
 * pack, with the DC it will have), and the traps already set on this scene.
 * "설치" → click a square on the map → one is taken from the pack and the
 * trap is set (only the players' screens show it). "회수" picks it back up.
 * By default traps can be set only while the GM has opened the trap-setting
 * time (setting). "다 깔았어요" tells the GM how many — not where.
 *
 * GM: open/close the players' time, peek at their traps (a few seconds),
 * clear them; and set the GM's own traps — drop an item or a hazard on the
 * window (or just type a name and a DC), then click a square.
 * ======================================================================== */

const uid = () => foundry.utils.randomID();

function cellLabel(tp) {
  return t("Cell", { col: tp.j + 1, row: tp.i + 1 });
}

export class TrapPlanner extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["rpt-app"],
    window: { icon: "fa-solid fa-dharmachakra", resizable: true },
    position: { width: 860, height: 600 }
  };

  constructor(mode = "pc") {
    super({ id: `rpt-planner-${mode}`, window: { title: t(mode === "gm" ? "Gm.Title" : "Pc.Title") } });
    this.mode = mode;
    this.draft = { name: "", dc: "", img: "icons/svg/trap.svg", desc: "", level: Math.max(1, Math.round(partyLevel())), uuid: null, kind: "custom" };
  }

  async _renderHTML() {
    return this.mode === "gm" ? this.gmHtml() : this.pcHtml();
  }

  /* ---------------- players ---------------- */

  canPlace() {
    const ph = phaseOf();
    return !setting("requirePhase", true) || !!ph?.open;
  }

  pcHtml() {
    const open = this.canPlace();
    const kit = partyKit();
    const mine = trapsOf().filter(tp => tp.side === "pc");
    const kitRows = kit.map(k => {
      const own = k.actor.isOwner;
      return `<li class="${own ? "" : "other"}"><img src="${esc(k.item.img)}" alt="">
        <div class="nm"><b>${esc(k.item.name)}</b> <small>×${k.item.system?.quantity ?? 1}</small><br><small>${esc(k.actor.name)} · ${t(`Kind.${k.kind}`)}</small></div>
        <span class="dc" data-tooltip="${esc(t("DcTip", { base: k.base ?? "—", level: k.byLevel }))}">DC ${k.dc}${k.base && k.base !== k.dc ? ` <small>(${k.base})</small>` : ""}</span>
        <button type="button" data-a="place" data-actor="${k.actor.id}" data-item="${k.item.id}" ${open ? "" : "disabled"}><i class="fa-solid fa-location-crosshairs"></i> ${t("Pc.Place")}</button></li>`;
    }).join("");
    const placed = mine.map(tp => this.placedRow(tp, "pc")).join("");
    return `<div class="rpt pc">
      <div class="status ${open ? "open" : ""}"><i class="fa-solid ${open ? "fa-lock-open" : "fa-lock"}"></i> ${t(open ? "Pc.Open" : "Pc.Closed")}
        <span class="sp"></span><small>${t("Pc.Secret")}</small></div>
      <div class="cols">
        <section><h3>${t("Pc.Kit")}</h3><ul class="list">${kitRows || `<li class="empty">${t("Pc.NoKit")}</li>`}</ul>
          <p class="hint">${t("Pc.KitHint", { bonus: setting("dcBonus", 2) })}</p></section>
        <section><h3>${t("Pc.Placed", { n: mine.length })}</h3><ul class="list">${placed || `<li class="empty">${t("Pc.NonePlaced")}</li>`}</ul></section>
      </div>
      <footer><span class="sp"></span><button type="button" data-a="done" class="primary"><i class="fa-solid fa-check"></i> ${t("Pc.Done")}</button></footer></div>`;
  }

  placedRow(tp, side) {
    const setter = game.actors.get(tp.owner);
    const state = tp.armed ? `<span class="st armed">${t("St.Armed")}</span>` : `<span class="st sprung">${t("St.Sprung", { name: esc(tp.sprung?.by ?? "?") })}</span>`;
    const canTake = side === "gm" || setter?.isOwner || game.user.isGM;
    return `<li data-id="${tp.id}"><img src="${esc(tp.img)}" alt="">
      <div class="nm"><b>${esc(tp.name)}</b> ${state}<br><small>${cellLabel(tp)} · DC ${tp.dc}${setter ? ` · ${esc(setter.name)}` : ""}</small></div>
      <button type="button" data-a="look" data-tooltip="${esc(t("Look"))}"><i class="fa-solid fa-eye"></i></button>
      ${side === "gm" && !tp.armed ? `<button type="button" data-a="rearm" data-tooltip="${esc(t("Pop.Rearm"))}"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
      ${tp.armed && side === "pc" && canTake ? `<button type="button" data-a="pickup" data-tooltip="${esc(t("Pc.PickupHint"))}"><i class="fa-solid fa-hand"></i> ${t("Pc.Pickup")}</button>` : ""}
      ${!tp.armed || side === "gm" ? `<button type="button" data-a="remove" data-tooltip="${esc(t("Remove"))}"><i class="fa-solid fa-trash"></i></button>` : ""}</li>`;
  }

  /* ---------------- GM ---------------- */

  gmHtml() {
    const ph = phaseOf();
    const all = trapsOf();
    const pcs = all.filter(tp => tp.side === "pc");
    const gms = all.filter(tp => tp.side === "gm");
    const d = this.draft;
    return `<div class="rpt gm">
      <div class="status ${ph?.open ? "open" : ""}">
        <i class="fa-solid fa-users"></i> ${t(ph?.open ? "Gm.PhaseOpen" : "Gm.PhaseClosed")}
        <button type="button" data-a="phase">${t(ph?.open ? "Gm.Close" : "Gm.Open")}</button>
        <span class="sp"></span>
        <span>${t("Gm.PcCount", { n: pcs.filter(x => x.armed).length, sprung: pcs.filter(x => !x.armed).length })}</span>
        <button type="button" data-a="peek" class="${peeking() ? "on" : ""}" data-tooltip="${esc(t("Gm.PeekHint", { s: setting("peekSeconds", 10) }))}"><i class="fa-solid fa-user-secret"></i> ${t("Gm.Peek")}</button>
        <button type="button" data-a="clear-pc" data-tooltip="${esc(t("Gm.ClearPcHint"))}"><i class="fa-solid fa-broom"></i></button>
      </div>
      <div class="cols">
        <section class="make drop">
          <h3>${t("Gm.Make")}</h3>
          <p class="hint">${t("Gm.Drop")}</p>
          <div class="draft"><img src="${esc(d.img)}" alt="">
            <div class="fields">
              <label>${t("Gm.Name")} <input type="text" data-d="name" value="${esc(d.name)}" placeholder="${esc(t("Gm.NameHint"))}"></label>
              <label>${t("Gm.Level")} <input type="number" data-d="level" value="${d.level}" class="n"></label>
              <label>DC <input type="number" data-d="dc" value="${esc(d.dc)}" class="n" placeholder="${levelDC(d.level) + (Number(setting("dcBonus", 2)) || 0)}"></label>
            </div></div>
          <label class="desc">${t("Gm.Desc")}<textarea data-d="desc" rows="5" placeholder="${esc(t("Gm.DescHint"))}">${esc(d.desc)}</textarea></label>
          <div class="row"><button type="button" data-a="gm-place" class="primary"><i class="fa-solid fa-location-crosshairs"></i> ${t("Gm.Place")}</button>
            <button type="button" data-a="gm-reset"><i class="fa-solid fa-eraser"></i></button></div>
        </section>
        <section><h3>${t("Gm.List", { n: gms.length })}</h3><ul class="list">${gms.map(tp => this.placedRow(tp, "gm")).join("") || `<li class="empty">${t("Gm.None")}</li>`}</ul>
          <div class="row"><button type="button" data-a="clear-gm"><i class="fa-solid fa-broom"></i> ${t("Gm.ClearGm")}</button></div></section>
      </div></div>`;
  }

  /* ---------------- wiring ---------------- */

  _replaceHTML(result, content) {
    content.innerHTML = result;
    if (this._wired === content) return;
    this._wired = content;
    content.addEventListener("click", ev => this.onClick(ev));
    content.addEventListener("change", ev => this.onChange(ev));
    content.addEventListener("dragover", ev => ev.preventDefault());
    content.addEventListener("drop", ev => this.onDrop(ev));
    content.addEventListener("pointerover", ev => { const id = ev.target.closest("[data-id]")?.dataset.id; if (id !== this._hl) { this._hl = id; setHighlight(id ?? null); } });
  }

  async onClick(ev) {
    const el = ev.target.closest("[data-a]");
    if (!el || el.disabled) return;
    ev.preventDefault();
    const id = el.closest("[data-id]")?.dataset.id;
    const tp = id ? trapsOf().find(x => x.id === id) : null;
    switch (el.dataset.a) {
      case "place": return this.placeItem(game.actors.get(el.dataset.actor)?.items.get(el.dataset.item));
      case "look": if (tp) { const c = canvas.grid.getCenterPoint({ i: tp.i, j: tp.j }); canvas.animatePan({ x: c.x, y: c.y }); setHighlight(tp.id); } return;
      case "pickup": return this.pickup(tp);
      case "remove": if (tp) await request({ op: "remove", id: tp.id }); return;
      case "rearm": if (tp) await request({ op: "update", id: tp.id, patch: { armed: true, sprung: null } }); return;
      case "done": {
        const n = trapsOf().filter(x => x.side === "pc" && x.armed).length;
        await ChatMessage.create({ content: `<div class="rpt-card note"><i class="fa-solid fa-dharmachakra"></i> ${t("Pc.DoneLine", { name: esc(game.user.name), n })}</div>`, whisper: game.users.filter(u => u.isGM).map(u => u.id) });
        return this.close();
      }
      case "phase": return request({ op: "phase", open: !phaseOf()?.open });
      case "peek": peek(); this.render(); setTimeout(() => this.rendered && this.render(), (Number(setting("peekSeconds", 10)) || 10) * 1000 + 100);
        if (setting("peekNotice", false)) ChatMessage.create({ content: `<div class="rpt-card note"><i class="fa-solid fa-user-secret"></i> ${t("Gm.PeekLine")}</div>` });
        return;
      case "clear-pc": case "clear-gm": {
        const side = el.dataset.a === "clear-pc" ? "pc" : "gm";
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Gm.ClearTitle") }, content: `<p>${t(side === "pc" ? "Gm.ClearPcAsk" : "Gm.ClearGmAsk")}</p>`, rejectClose: false }).catch(() => false);
        if (ok) await request({ op: "clear", side });
        return;
      }
      case "gm-place": return this.placeGm();
      case "gm-reset": this.draft = { name: "", dc: "", img: "icons/svg/trap.svg", desc: "", level: Math.max(1, Math.round(partyLevel())), uuid: null, kind: "custom" }; return this.render();
    }
  }

  onChange(ev) {
    const k = ev.target.dataset.d;
    if (!k) return;
    this.draft[k] = k === "level" ? Math.max(0, Number(ev.target.value) || 0) : ev.target.value;
    if (k === "level") this.render();
  }

  /** GM: an item or a hazard dropped on the window fills the draft. */
  async onDrop(ev) {
    if (this.mode !== "gm") return;
    ev.preventDefault();
    let data;
    try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (_) { return; }
    const doc = data?.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    if (!doc) return;
    const level = Number(doc.system?.level?.value ?? doc.system?.details?.level?.value ?? doc.level ?? this.draft.level) || this.draft.level;
    const desc = doc.system?.description?.value ?? doc.system?.details?.description ?? "";
    const base = itemDC({ system: { description: { value: desc } } });
    this.draft = { name: doc.name, img: doc.img, desc, level, dc: base ?? "", uuid: doc.uuid, kind: doc.documentName === "Item" ? kindOf(doc) ?? "custom" : "hazard" };
    this.render();
  }

  /* ---------------- setting a trap ---------------- */

  async placeItem(item) {
    if (!item || !this.canPlace()) return;
    this.minimize?.();
    const cell = await pickSquare();
    this.maximize?.();
    if (!cell) return;
    if (trapsOf().some(x => x.side === "pc" && x.armed && x.i === cell.i && x.j === cell.j)) return ui.notifications.warn(t("Place.Taken"));
    const actor = item.actor;
    const { dc, base } = trapDC(item, actor?.level ?? 1);
    const copy = item.toObject();
    delete copy._id;
    copy.system.quantity = 1;
    const trap = {
      id: uid(), side: "pc", i: cell.i, j: cell.j, name: item.name, img: item.img, uuid: item.uuid, level: Number(item.system?.level?.value ?? 0),
      dc, dcBase: base, kind: kindOf(item), desc: item.system?.description?.value ?? "", item: copy, owner: actor?.id ?? null,
      armed: true, sprung: null, at: game.time?.worldTime ?? 0
    };
    await takeOne(item);
    await request({ op: "add", trap });
    ui.notifications.info(t("Place.Done", { name: item.name, cell: cellLabel(trap) }));
  }

  async pickup(tp) {
    if (!tp?.armed) return;
    const actor = game.actors.get(tp.owner);
    await request({ op: "remove", id: tp.id });
    if (actor && tp.item) {
      if (actor.isOwner) await giveBack(actor, tp.item);
      else request({ op: "give", actorId: actor.id, source: tp.item });
    }
  }

  async placeGm() {
    const d = this.draft;
    if (!d.name.trim()) return ui.notifications.warn(t("Gm.NeedName"));
    this.minimize?.();
    const cell = await pickSquare();
    this.maximize?.();
    if (!cell) return;
    const dc = Number(d.dc) || levelDC(d.level) + (Number(setting("dcBonus", 2)) || 0);
    await request({ op: "add", trap: {
      id: uid(), side: "gm", i: cell.i, j: cell.j, name: d.name.trim(), img: d.img || "icons/svg/trap.svg", uuid: d.uuid, level: d.level,
      dc, dcBase: Number(d.dc) || null, kind: d.kind ?? "custom", desc: d.desc, owner: null, armed: true, sprung: null, at: game.time?.worldTime ?? 0
    } });
  }

  async _onClose(options) {
    setHighlight(null);
    return super._onClose?.(options);
  }
}

function partyLevel() {
  const pcs = partyMembers();
  return pcs.length ? pcs.reduce((n, a) => n + (a.level ?? 1), 0) / pcs.length : 1;
}

export function openPlanner(mode = game.user.isGM ? "gm" : "pc") {
  if (mode === "gm" && !game.user.isGM) mode = "pc";
  const id = `rpt-planner-${mode}`;
  const open = foundry.applications.instances.get(id);
  if (open) { open.render(true); open.bringToFront?.(); return open; }
  const app = new TrapPlanner(mode);
  app.render(true);
  return app;
}

export function refreshPlanners() {
  for (const id of ["rpt-planner-pc", "rpt-planner-gm"]) foundry.applications.instances.get(id)?.render();
  redraw();
}
