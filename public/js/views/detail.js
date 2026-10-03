import { html, raw, time, dayShort, runtime, poster, icons } from "../format.js";
import { kindOf, KIND_LABEL, wishButtons, freshness, unplacedText } from "./shared.js";

export function render(ctx, f) {
  const shows = ctx.showsByFilm.get(f.id) || [];
  const meta = [f.year, runtime(f.runtime), f.countries.join(", ")].filter(Boolean).join(" · ");
  const q = encodeURIComponent(`${f.originalTitle || f.title} ${f.year || ""}`.trim());
  const kind = kindOf(f);
  const facts = [
    ["Regi", f.directors.join(", ")],
    ["Manus", f.writer],
    ["Medverkande", f.cast.join(", ")],
    ["Språk", f.languages.join(", ")],
    ["Tekst", f.subtitles],
    ["Aldersgrense", f.ageRating != null ? `${f.ageRating} år` : ""],
    ["Interesserte", f.interested ? `${f.interested} på biff.no` : ""],
  ].filter(([, v]) => v);

  return html`
    <div class="fd">
      <div class="fd__bar"><button class="btn btn--ghost btn--small" data-act="close" autofocus>${raw(icons.x)} Lukk</button></div>
      <aside class="fd__side">
        ${f.poster ? html`<img class="fd__poster" src="${poster(f.poster, 560)}" alt="">` : ""}
        <div style="display:flex;flex-direction:column;gap:12px">
          ${wishButtons(ctx, f.id)}
          <div class="fd__links">
            <a class="btn btn--small" href="${f.url}" target="_blank" rel="noopener">biff.no ${raw(icons.ext)}</a>
            ${f.trailer ? html`<a class="btn btn--small" href="${f.trailer}" target="_blank" rel="noopener">Trailer ${raw(icons.ext)}</a>` : ""}
            <a class="btn btn--small btn--ghost" href="https://letterboxd.com/search/films/${q}/" target="_blank" rel="noopener">Letterboxd ${raw(icons.ext)}</a>
            <a class="btn btn--small btn--ghost" href="https://www.imdb.com/find/?q=${q}&s=tt" target="_blank" rel="noopener">IMDb ${raw(icons.ext)}</a>
          </div>
        </div>
      </aside>
      <div class="fd__main">
        <div>
          <div class="card__tags" style="margin-bottom:10px">
            <span class="tag tag--kind kind-${kind}">${KIND_LABEL[kind]}</span>
            ${f.categories.map((c) => html`<span class="tag">${c}</span>`)}
          </div>
          <h2 class="fd__title" id="film-dialog-title">${f.title}</h2>
        </div>
        ${f.originalTitle && f.originalTitle !== f.title ? html`<div class="fd__orig">${f.originalTitle}</div>` : ""}
        <div class="card__meta">${meta}</div>
        ${f.oneliner ? html`<p class="fd__lead">${f.oneliner}</p>` : ""}

        <h3 style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">Visningar <span class="legend">${freshness(ctx)}</span></h3>
        ${shows.length ? html`${planHint(ctx, f)}${dayPicker(ctx, f, shows)}<ul class="shows">${shows.map((s) => showRow(ctx, s))}</ul>`
          : html`<p class="muted">Ingen visningar er lagt ut på biff.no enno.</p>`}

        ${f.text ? html`<p class="fd__text">${f.text}</p>` : ""}
        ${facts.length ? html`<dl class="fd__facts">${facts.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>` : ""}
        ${f.directorBio ? html`<p class="muted" style="font:italic 15px/1.45 var(--f-serif);margin:0">${f.directorBio}</p>` : ""}
      </div>
    </div>`;
}

// Éi linje som forklarer markeringa og korleis ein byter visning.
function planHint(ctx, f) {
  const planned = ctx.planByFilm.get(f.id) || [];
  const swap = "Trykk «Vel denne» på ei anna visning for å byte.";
  let text;
  if (planned.some((p) => p.ticket)) text = "Du har billett til visninga med strek.";
  else if (planned.some((p) => p.fixed)) text = `Du har valt visninga med strek. ${swap}`;
  else if (planned.length) text = `Planleggaren har foreslått visninga med strek. ${swap}`;
  else if (ctx.unplacedByFilm.has(f.id)) text = `Får ikkje plass i planen: ${unplacedText(ctx, ctx.unplacedByFilm.get(f.id))}`;
  else text = "Merk filmen som «Må sjå» eller «Kanskje», så finn planleggaren ei visning – eller vel ei sjølv.";
  return html`<p class="plan-hint">${text}</p>`;
}

// "Planlegg: Alle dagar | to 15. | la 17." – berre for filmar på ønskelista som går fleire dagar.
function dayPicker(ctx, f, shows) {
  const days = [...new Set(shows.filter((s) => !ctx.isPast(s)).map((s) => s.start.slice(0, 10)))];
  if (!ctx.wishOf(f.id) || days.length < 2) return "";
  const cur = ctx.dayOf(f.id) || "";
  const opt = (d, label) => html`<button class="btn btn--small btn--ghost btn--day" data-act="day" data-film="${f.id}" data-day="${d}" aria-pressed="${cur === d}">${label}</button>`;
  return html`<div class="day-picker"><span class="mono muted">Planlegg:</span>${opt("", "Alle dagar")}${days.map((d) => opt(d, dayShort(d)))}</div>`;
}

function showRow(ctx, s) {
  const p = ctx.planBySid.get(s.id);
  const mark = ctx.markOf(s.id);
  const past = ctx.isPast(s);
  const clash = p ? [] : ctx.clashes(s);
  const boundDay = ctx.dayOf(s.film);
  const avail = ctx.soldOut(s) ? html`<span class="tag tag--warn">Utseld</span>`
    : s.status ? html`<span class="tag tag--warn">${s.status}</span>`
    : s.ticketsAvailable != null ? html`<span class="mono muted">${s.ticketsAvailable} ledige</span>` : "";
  const state = p?.ticket ? html`<span class="tag tag--ok">${raw(icons.ticket)}Billett</span>`
    : mark === "lock" ? html`<span class="tag tag--chosen">${raw(icons.check)}Valt av deg</span>`
    : p ? html`<span class="tag">Foreslått</span>`
    : mark === "skip" ? html`<span class="tag">Utelukka</span>`
    : ctx.wishOf(s.film) && boundDay && !s.start.startsWith(boundDay) ? html`<span class="mono muted">Ikkje dagen du valde</span>`
    : !ctx.available(s) ? html`<span class="mono muted">Utanfor tidene dine</span>` : "";
  const [day, ...rest] = dayShort(s.start).split(" ");
  return html`
    <li class="show ${p ? "is-plan" : ""} ${p?.ticket ? "is-ticket" : ""} ${past ? "is-past" : ""}">
      <div class="show__when">
        <span class="show__day">${day} ${rest.join(" ")} okt</span>
        <span class="show__time">${time(s.start)}</span>
        <span class="show__end">–${time(s.end)} · ${s.venue}</span>
      </div>
      <div class="show__body">
        <div class="show__info">
          ${state}
          ${s.notes.map((n) => html`<span class="tag">${n}</span>`)}
          ${avail}
          ${clash.length ? html`<span class="mono muted">Kolliderer med ${clash.map((c) => ctx.film.get(c.film).title).join(", ")}</span>` : ""}
          ${past ? html`<span class="mono muted">Har vore</span>` : ""}
        </div>
        ${past ? "" : html`<div class="show__acts">
          ${p?.ticket ? "" : html`<button class="btn btn--small btn--ghost btn--lock" data-act="mark" data-show="${s.id}" data-m="lock" aria-pressed="${mark === "lock"}" title="${mark === "lock" ? "Trykk for å la planleggaren velje" : "Vel akkurat denne visninga"}">${raw(icons.check)}${mark === "lock" ? "Valt" : "Vel denne"}</button>`}
          <button class="btn btn--small btn--ghost btn--ticket" data-act="mark" data-show="${s.id}" data-m="ticket" aria-pressed="${mark === "ticket"}">${raw(icons.ticket)}Har billett</button>
          <button class="btn btn--small btn--ghost btn--skip" data-act="mark" data-show="${s.id}" data-m="skip" aria-pressed="${mark === "skip"}" title="Planleggaren skal ikkje bruke denne">Ikkje denne</button>
          ${mark === "ticket" ? "" : html`<a class="btn btn--small btn--ghost" href="${s.ticketUrl}" target="_blank" rel="noopener">Kjøp ${raw(icons.ext)}</a>`}
        </div>`}
      </div>
    </li>`;
}
