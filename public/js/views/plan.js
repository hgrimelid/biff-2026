import { html, str, raw, time, dayLong, dayShort, runtime, minutesBetween, icons } from "../format.js";
import { freshness } from "./shared.js";
import { groupBy } from "../planner.js";

const REASON = {
  none: "Ingen visningar er lagt ut på biff.no.",
  past: "Alle visningane har vore.",
  soldout: "Dei ledige visningane er utselde (ved siste oppdatering).",
  skipped: "Du har utelukka alle visningane som er att.",
};

export function render(ctx, el) {
  const { plan, unplaced, conflicts } = ctx.result;
  const shows = plan.map((p) => ({ p, s: ctx.show.get(p.id), f: ctx.film.get(p.film) }));
  const byDay = groupBy(shows, ({ s }) => s.start.slice(0, 10));
  const tickets = plan.filter((p) => p.ticket).length;
  const missing = shows.filter(({ p, s }) => !p.ticket && !ctx.isPast(s)).length;
  const wishCount = Object.keys(ctx.state.wish).length;
  const stale = ctx.stale();

  el.innerHTML = str(html`
    <div class="plan-layout">
      <div>
        <div class="program-head"><h1 class="h-day">Min plan</h1><div class="legend">${freshness(ctx)}</div></div>
        <div class="stats">
          <div class="stat"><span class="stat__n">${plan.length}</span><span class="stat__l">visningar i planen</span></div>
          <div class="stat"><span class="stat__n">${tickets}</span><span class="stat__l">med billett</span></div>
          <div class="stat"><span class="stat__n">${missing}</span><span class="stat__l">manglar billett</span></div>
          <div class="stat ${unplaced.length ? "stat--warn" : ""}"><span class="stat__n">${unplaced.length}</span><span class="stat__l">får ikkje plass</span></div>
        </div>
        ${stale.length ? staleNotice(ctx, stale) : ""}
        ${conflicts.length ? html`<div class="notice"><b>Låste visningar kolliderer:</b><ul>
          ${conflicts.map(([a, b]) => html`<li>${label(ctx, a)} og ${label(ctx, b)}</li>`)}</ul></div>` : ""}
        ${!wishCount && !plan.length
          ? html`<p class="empty">Ønskelista er tom.<br><a href="#/filmar">Gå til filmane</a> og merk dei du vil sjå som «Må sjå» eller «Kanskje», så lagar planleggaren eit forslag.</p>`
          : [...byDay].map(([day, items]) => dayBlock(ctx, day, items))}
      </div>
      <aside class="aside">
        ${unplaced.length ? html`<section class="box"><h3>Får ikkje plass</h3><ul class="unplaced">
          ${unplaced.map((u) => unplacedItem(ctx, u))}</ul></section>` : ""}
        <section class="box">
          <h3>Innstillingar</h3>
          <p>Minste pause mellom to filmar. Gjeld forslaget og kollisjonsvarsla.</p>
          <div class="row"><input id="buffer" class="num" type="number" min="0" max="120" step="5" value="${ctx.state.buffer}" inputmode="numeric"><label for="buffer">minutt</label></div>
        </section>
        <section class="box">
          <h3>Flytt planen</h3>
          <p>Planen ligg berre i denne nettlesaren. Kopier lenkja og opne ho på mobilen (eller ein annan maskin) for å ta han med.</p>
          <div class="row"><button class="btn" data-act="copy-link">Kopier lenkje</button>
          <button class="btn btn--ghost btn--danger btn--small" data-act="reset">Nullstill alt</button></div>
        </section>
      </aside>
    </div>`);
}

function dayBlock(ctx, day, items) {
  const out = [];
  items.forEach((it, i) => {
    if (i > 0) {
      const gap = minutesBetween(items[i - 1].s.end, it.s.start);
      out.push(html`<div class="gap ${gap < ctx.state.buffer ? "gap--tight" : ""}">${gap < 0 ? "Overlappar!" : `${runtime(gap) || "0 min"} pause`}</div>`);
    }
    out.push(stub(ctx, it));
  });
  return html`<section class="plan-day"><h2 class="h-day">${dayLong(day)}</h2>${out}</section>`;
}

function stub(ctx, { p, s, f }) {
  const mark = ctx.markOf(s.id);
  const past = ctx.isPast(s);
  const open = ctx.ui.alts.has(f.id);
  const status = p.ticket
    ? html`<span class="tag tag--ok">${raw(icons.ticket)} Billett</span>`
    : html`<span class="tag ${ctx.soldOut(s) ? "tag--warn" : ""}">${ctx.soldOut(s) ? "Utseld" : s.status || "Manglar billett"}</span>`;
  return html`
    <article class="stub ${p.ticket ? "is-ticket" : ""} ${past ? "is-past" : ""}">
      <div class="stub__when">
        <span class="stub__time">${time(s.start)}</span>
        <span class="stub__end">–${time(s.end)}</span>
        <span class="stub__venue">${s.venue}</span>
      </div>
      <div class="stub__body">
        <h3 class="stub__title"><button data-act="open" data-film="${f.id}">${f.title}</button></h3>
        <div class="stub__row">
          ${status}
          ${mark === "lock" ? html`<span class="tag">${raw(icons.lock)} Låst</span>` : ""}
          ${ctx.wishOf(f.id) === "maybe" ? html`<span class="tag">Kanskje</span>` : ""}
          ${s.notes.map((n) => html`<span class="tag">${n}</span>`)}
          <span class="mono muted">${runtime(f.runtime)}</span>
        </div>
        ${past ? "" : html`<div class="stub__row">
          <button class="btn btn--small btn--ticket" data-act="mark" data-show="${s.id}" data-m="ticket" aria-pressed="${p.ticket}">${raw(icons.ticket)}${p.ticket ? "Har billett" : "Har kjøpt"}</button>
          ${p.ticket ? "" : html`
            <a class="btn btn--small" href="${s.ticketUrl}" target="_blank" rel="noopener">Kjøp ${raw(icons.ext)}</a>
            <button class="btn btn--small btn--ghost btn--lock" data-act="mark" data-show="${s.id}" data-m="lock" aria-pressed="${mark === "lock"}">${raw(icons.lock)}${mark === "lock" ? "Låst" : "Lås"}</button>
            <button class="btn btn--small btn--ghost" data-act="alts" data-film="${f.id}" aria-expanded="${open}">${raw(icons.swap)}Byt</button>
            <button class="btn btn--small btn--ghost" data-act="mark" data-show="${s.id}" data-m="skip" title="Planleggaren finn ei anna visning">Ikkje denne</button>`}
        </div>`}
        ${open && !p.ticket ? alternatives(ctx, f, s) : ""}
      </div>
    </article>`;
}

function alternatives(ctx, f, current) {
  const others = (ctx.showsByFilm.get(f.id) || []).filter((s) => s.id !== current.id);
  if (!others.length) return html`<div class="stub__alts"><span class="mono muted">Ingen andre visningar.</span></div>`;
  return html`<div class="stub__alts">${others.map((s) => {
    const clash = ctx.clashes(s);
    const why = ctx.isPast(s) ? "har vore" : ctx.soldOut(s) ? "utseld"
      : ctx.markOf(s.id) === "skip" ? "utelukka"
      : clash.length ? `kolliderer med ${clash.map((c) => ctx.film.get(c.film).title).join(", ")}` : "";
    return html`<div class="alt ${why ? "is-conflict" : ""}">
      <span>${dayShort(s.start)} ${time(s.start)} · ${s.venue}${why ? ` – ${why}` : ""}</span>
      ${ctx.isPast(s) ? "" : html`<button class="btn btn--small" data-act="mark" data-show="${s.id}" data-m="lock">Vel denne</button>`}
    </div>`;
  })}</div>`;
}

function unplacedItem(ctx, u) {
  const f = ctx.film.get(u.film);
  let why = REASON[u.reason] || "";
  if (u.reason === "conflict") {
    const names = [...new Set(u.blockers.map((id) => ctx.film.get(ctx.show.get(id).film).title))];
    why = `Kolliderer med ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` og ${names.length - 3} til` : ""}.`;
  }
  return html`<li>
    <button class="linkish" data-act="open" data-film="${f.id}"><b>${f.title}</b></button>
    <span class="tag">${u.prio === "must" ? "Må sjå" : "Kanskje"}</span>
    <span class="why">${why}</span>
  </li>`;
}

function label(ctx, showId) {
  const s = ctx.show.get(showId);
  return `${ctx.film.get(s.film).title} (${dayShort(s.start)} ${time(s.start)}, ${s.venue})`;
}

function staleNotice(ctx, stale) {
  return html`<div class="notice"><b>Programmet er endra for visningar du har merkt:</b><ul>
    ${stale.map(({ id, x, s }) => {
      const title = ctx.film.get(x.f)?.title ?? "Ukjend film";
      const was = `${dayShort(x.s)} ${time(x.s)} ${x.v}`;
      const text = s ? `${title}: ${was} → ${dayShort(s.start)} ${time(s.start)} ${s.venue}` : `${title} (${was}) finst ikkje lenger i programmet`;
      return html`<li>${text}${x.m === "ticket" ? " – du har billett, sjekk med BIFF." : ""}
        <button class="btn btn--small btn--ghost" data-act="ack-stale" data-show="${id}">${s ? "OK" : "Fjern"}</button></li>`;
    })}</ul></div>`;
}
