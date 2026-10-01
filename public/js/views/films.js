import { html, str, esc, raw, runtime, dayShort, time, poster, icons } from "../format.js";
import { kindOf, KIND_LABEL, wishButtons, patchList } from "./shared.js";

const SORTS = {
  tittel: (a, b) => a.title.localeCompare(b.title, "nn"),
  interesse: (a, b) => b.interested - a.interested,
  kortast: (a, b) => (a.runtime || 999) - (b.runtime || 999),
  forste: (a, b, ctx) => first(ctx, a).localeCompare(first(ctx, b)),
};
const first = (ctx, f) => ctx.showsByFilm.get(f.id)?.[0]?.start ?? "9";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const haystack = new WeakMap();
const searchText = (f) => {
  if (!haystack.has(f))
    haystack.set(f, norm([f.title, f.originalTitle, ...f.directors, ...f.cast, ...f.countries, ...f.categories, f.oneliner].join(" ")));
  return haystack.get(f);
};

export function render(ctx, el) {
  if (!el.querySelector(".toolbar")) el.innerHTML = str(toolbar(ctx));
  const list = filtered(ctx);
  el.querySelector("#result-count").textContent =
    list.length === ctx.data.films.length ? `${list.length} filmar` : `Viser ${list.length} av ${ctx.data.films.length} filmar`;
  const grid = el.querySelector(".grid");
  patchList(grid, list.map((f) => ({ key: f.id, html: str(card(ctx, f)) })));
  el.querySelector(".empty").hidden = list.length > 0;
}

function filtered(ctx) {
  const { q, cat, day, show, sort } = ctx.ui;
  const terms = norm(q).split(/\s+/).filter(Boolean);
  return ctx.data.films
    .filter((f) => {
      if (terms.length && !terms.every((t) => searchText(f).includes(t))) return false;
      if (cat && !f.categories.includes(cat) && kindOf(f) !== cat) return false;
      if (day && !(ctx.showsByFilm.get(f.id) || []).some((s) => s.start.startsWith(day))) return false;
      const w = ctx.wishOf(f.id);
      if (show === "onske" && !w) return false;
      if (show === "must" && w !== "must") return false;
      if (show === "maybe" && w !== "maybe") return false;
      if (show === "umerka" && w) return false;
      if (show === "plan" && !ctx.planByFilm.has(f.id)) return false;
      if (show === "utanfor" && !ctx.unplacedByFilm.has(f.id)) return false;
      return true;
    })
    .sort((a, b) => SORTS[sort](a, b, ctx) || a.title.localeCompare(b.title, "nn"));
}

function toolbar(ctx) {
  const counts = new Map();
  for (const f of ctx.data.films) for (const c of f.categories) counts.set(c, (counts.get(c) || 0) + 1);
  const cats = [...counts].sort((a, b) => b[1] - a[1]);
  return html`
    <div class="toolbar" role="search">
      <label class="sr-only" for="q">Søk</label>
      <input id="q" class="search" type="search" data-ui="q" placeholder="Søk i tittel, regi, skodespelarar, land …" autocomplete="off" value="${ctx.ui.q}">
      <label class="sr-only" for="f-cat">Seksjon</label>
      <select id="f-cat" class="select" data-ui="cat">
        <option value="">Alle seksjonar</option>
        <optgroup label="Type">
          ${Object.entries(KIND_LABEL).map(([k, l]) => html`<option value="${k}" ${ctx.ui.cat === k ? "selected" : ""}>${l}</option>`)}
        </optgroup>
        <optgroup label="Seksjon">
          ${cats.map(([c, n]) => html`<option value="${c}" ${ctx.ui.cat === c ? "selected" : ""}>${c} (${n})</option>`)}
        </optgroup>
      </select>
      <label class="sr-only" for="f-day">Dag</label>
      <select id="f-day" class="select" data-ui="day">
        <option value="">Alle dagar</option>
        ${ctx.days.map((d) => html`<option value="${d}" ${ctx.ui.day === d ? "selected" : ""}>${dayShort(d)} okt</option>`)}
      </select>
      <label class="sr-only" for="f-show">Vis</label>
      <select id="f-show" class="select" data-ui="show">
        ${[["", "Alle filmar"], ["onske", "Ønskelista"], ["must", "Må sjå"], ["maybe", "Kanskje"], ["umerka", "Ikkje merka"], ["plan", "I planen"], ["utanfor", "Får ikkje plass"]]
          .map(([v, l]) => html`<option value="${v}" ${ctx.ui.show === v ? "selected" : ""}>${l}</option>`)}
      </select>
      <label class="sr-only" for="f-sort">Sorter</label>
      <select id="f-sort" class="select" data-ui="sort">
        ${[["tittel", "A–Å"], ["interesse", "Mest interesse"], ["forste", "Første visning"], ["kortast", "Kortast"]]
          .map(([v, l]) => html`<option value="${v}" ${ctx.ui.sort === v ? "selected" : ""}>${l}</option>`)}
      </select>
    </div>
    <p class="result-count" id="result-count"></p>
    <div class="grid"></div>
    <p class="empty" hidden>Ingen filmar passar søket.</p>`;
}

function card(ctx, f) {
  const shows = ctx.showsByFilm.get(f.id) || [];
  const planned = ctx.planByFilm.get(f.id) || [];
  const hasTicket = planned.some((p) => p.ticket);
  const kind = kindOf(f);
  const meta = [f.year, runtime(f.runtime), f.countries.join(", ")].filter(Boolean).join(" · ");
  return html`
    <article class="card" data-key="${f.id}">
      <button class="card__poster" data-act="open" data-film="${f.id}" aria-label="Opne ${f.title}" tabindex="-1">
        ${f.poster ? html`<img src="${poster(f.poster, 360)}" alt="" loading="lazy" decoding="async">` : ""}
        ${planned.length ? html`<span class="stamp ${hasTicket ? "stamp--ticket" : ""}">${raw(hasTicket ? icons.ticket : "")}${hasTicket ? "Billett" : "I planen"}</span>` : ""}
      </button>
      <h2 class="card__title"><button data-act="open" data-film="${f.id}">${f.title}</button></h2>
      ${f.originalTitle && f.originalTitle !== f.title ? html`<div class="card__orig">${f.originalTitle}</div>` : ""}
      <div class="card__meta">${meta}${f.directors.length ? html`<br>Regi: ${f.directors.join(", ")}` : ""}</div>
      ${f.oneliner ? html`<p class="card__line">${f.oneliner}</p>` : ""}
      <div class="card__tags">
        <span class="tag tag--kind kind-${kind}">${KIND_LABEL[kind]}</span>
        ${f.categories.filter((c) => !/^(internasjonal|norsk) (fiksjon|dokumentar)$/i.test(c)).map((c) => html`<span class="tag">${c}</span>`)}
      </div>
      <div class="card__shows">${shows.length ? showsLine(ctx, shows, planned) : raw("<i>Ingen visningar lagt ut</i>")}</div>
      <div class="card__foot">
        ${wishButtons(ctx, f.id)}
        ${f.interested ? html`<span class="mono muted" title="Interesserte på biff.no">${f.interested} interesserte</span>` : ""}
      </div>
    </article>`;
}

function showsLine(ctx, shows, planned) {
  const ids = new Set(planned.map((p) => p.id));
  return raw(
    shows
      .map((s) => {
        let t = `${esc(dayShort(s.start))} ${time(s.start)}`;
        if (ids.has(s.id)) t = `<b>${t}</b>`;
        else if (ctx.markOf(s.id) === "skip" || ctx.isPast(s)) t = `<s>${t}</s>`;
        else if (ctx.soldOut(s)) t = `<s title="Utseld">${t}</s>`;
        return t;
      })
      .join(" · "),
  );
}
