import { html, str, raw, time, dayLong, weekdayShort, dayNum, runtime, icons } from "../format.js";
import { kindOf, freshness } from "./shared.js";

const VENUE_ORDER = ["Cinemateket", "Tivoli", "Cornerteateret"];
const venueSort = (a, b) => {
  const ka = /^KP(\d+)$/.exec(a), kb = /^KP(\d+)$/.exec(b);
  if (ka && kb) return ka[1] - kb[1];
  if (ka || kb) return ka ? -1 : 1;
  const ia = VENUE_ORDER.indexOf(a), ib = VENUE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};
const mins = (iso) => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);

function defaultDay(ctx) {
  const today = ctx.now.slice(0, 10);
  return ctx.days.find((d) => d >= today && ctx.data.screenings.filter((s) => s.start.startsWith(d)).length > 5) ?? ctx.days[0];
}

export function render(ctx, el, r) {
  const day = ctx.days.includes(r.arg) ? r.arg : defaultDay(ctx);
  const shows = ctx.data.screenings.filter((s) => s.start.startsWith(day));
  const scroller = el.querySelector(".timeline");
  const keep = scroller && el.dataset.day === day ? { x: scroller.scrollLeft, y: scroller.scrollTop } : null;
  el.dataset.day = day;
  el.innerHTML = str(html`
    <nav class="days" aria-label="Dagar">
      ${ctx.days.map((d) => {
        const n = ctx.data.screenings.filter((s) => s.start.startsWith(d)).length;
        const mine = ctx.result.plan.filter((p) => ctx.show.get(p.id).start.startsWith(d)).length;
        return html`<a class="day" href="#/program/${d}" ${d === day ? raw('aria-current="page"') : ""}>
          <span class="day__wd">${weekdayShort(d)}</span><span class="day__d">${dayNum(d)}</span>
          <span class="day__n">${mine ? `${mine} av ${n}` : n}</span></a>`;
      })}
    </nav>
    <div class="program-head">
      <h1 class="h-day">${dayLong(day)}</h1>
      <div class="legend">
        <label class="check"><input type="checkbox" data-ui="onlyWish" ${ctx.ui.onlyWish ? "checked" : ""}> Uthev ønskelista</label>
        ${freshness(ctx)}
        <span class="legend__item"><i style="background:var(--ink)"></i>I planen</span>
        <span class="legend__item"><i style="background:var(--ticket)"></i>Billett</span>
        <span class="legend__item"><i style="box-shadow:inset 0 0 0 2px var(--accent)"></i>Må sjå</span>
        <span class="legend__item"><i style="box-shadow:inset 0 0 0 2px var(--maybe)"></i>Kanskje</span>
        <span class="legend__item"><i style="background:repeating-linear-gradient(-45deg,transparent 0 3px,var(--ink-3) 3px 5px)"></i>Utseld</span>
      </div>
    </div>
    ${shows.length ? timeline(ctx, day, shows) : html`<p class="empty">Ingen visningar denne dagen.</p>`}`);

  const sc = el.querySelector(".timeline");
  if (!sc) return;
  if (keep) {
    sc.scrollLeft = keep.x;
    sc.scrollTop = keep.y;
  } else {
    // Rull til no-streken eller første film i planen.
    const target = sc.querySelector(".tl__now") || sc.querySelector(".blk.is-plan");
    if (target) sc.scrollTop = Math.max(0, target.offsetTop - 80);
  }
}

function timeline(ctx, day, shows) {
  const venues = [...new Set(shows.map((s) => s.venue))].sort(venueSort);
  // Visningar som går over midnatt: rekn minutt frå starten av dagen.
  const endMin = (s) => mins(s.start) + Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000);
  const from = Math.floor(Math.min(...shows.map((s) => mins(s.start))) / 60) * 60;
  const to = Math.ceil(Math.max(...shows.map(endMin)) / 60) * 60;
  const hours = [];
  for (let h = from; h < to; h += 60) hours.push(h);
  const nowMin = ctx.now.startsWith(day) ? mins(ctx.now) : null;
  const nowLine = nowMin != null && nowMin >= from && nowMin <= to
    ? html`<div class="tl__now" style="top:calc(var(--ppm) * ${nowMin - from})"></div>` : "";
  const height = `calc(var(--ppm) * ${to - from})`;

  return html`
    <div class="timeline ${ctx.ui.onlyWish ? "only-wish" : ""}">
      <div class="tl" style="--cols:${venues.length}">
        <div class="tl__corner"></div>
        ${venues.map((v) => html`<div class="tl__venue" title="${v}">${v}</div>`)}
        <div class="tl__axis" style="height:${height}">
          ${hours.map((h) => html`<span class="tl__hour" style="top:calc(var(--ppm) * ${h - from})">${String((h / 60) % 24).padStart(2, "0")}</span>`)}
        </div>
        ${venues.map((v) => html`
          <div class="tl__col" style="height:${height}">
            ${nowLine}
            ${shows.filter((s) => s.venue === v).map((s) => block(ctx, s, from, endMin(s)))}
          </div>`)}
      </div>
    </div>`;
}

function block(ctx, s, from, end) {
  const f = ctx.film.get(s.film);
  const p = ctx.planBySid.get(s.id);
  const mark = ctx.markOf(s.id);
  const wish = ctx.wishOf(s.film);
  const cls = [
    p && (p.ticket ? "is-ticket" : "is-plan"),
    wish && `is-${wish}`,
    mark === "skip" && "is-skip",
    ctx.soldOut(s) && "is-soldout",
  ].filter(Boolean).join(" ");
  const flags = [
    p?.ticket ? icons.ticket : mark === "lock" ? icons.lock : "",
    wish === "must" ? icons.star : wish === "maybe" ? icons.half : "",
  ].join("");
  const extra = [runtime(f.runtime), ...s.notes, ctx.soldOut(s) ? "Utseld" : s.status].filter(Boolean).join(" · ");
  const start = mins(s.start);
  return html`
    <button class="blk ${cls}" data-act="open" data-film="${f.id}"
      style="top:calc(var(--ppm) * ${start - from}); height:calc(var(--ppm) * ${Math.max(end - start, 28)} - 2px); --kind:var(--kind-${kindOf(f)})"
      title="${time(s.start)}–${time(s.end)} ${f.title}${extra ? ` (${extra})` : ""}">
      <span class="blk__time">${time(s.start)}<span class="blk__flags">${raw(flags)}</span></span>
      <span class="blk__title">${f.title}</span>
      <span class="blk__meta">${extra}</span>
    </button>`;
}
