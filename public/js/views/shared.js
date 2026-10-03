import { html, raw, icons, time, dayShort } from "../format.js";

export const KIND_LABEL = { fiksjon: "Fiksjon", dok: "Dokumentar", kort: "Kortfilm", arr: "Arrangement" };

export function kindOf(f) {
  const c = f.categories.join(" ").toLowerCase();
  if (c.includes("kortfilm")) return "kort";
  if (c.includes("arrangement")) return "arr";
  if (c.includes("dokumentar") || f.genres.includes("dokumentar")) return "dok";
  return "fiksjon";
}

// `day`: dagen lista er filtrert på. Merkar brukaren filmen då, blir han knytt til dagen.
export function wishButtons(ctx, filmId, day = "") {
  const w = ctx.wishOf(filmId);
  const hint = day ? ` – blir planlagd ${dayShort(day)}` : "";
  return html`<span class="wish" role="group" aria-label="Ønskeliste">
    <button class="btn btn--small btn--must" data-act="wish" data-film="${filmId}" data-prio="must" data-day="${day}" aria-pressed="${w === "must"}" title="Må sjå${hint}">${raw(icons.star)}Må sjå</button>
    <button class="btn btn--small btn--maybe" data-act="wish" data-film="${filmId}" data-prio="maybe" data-day="${day}" aria-pressed="${w === "maybe"}" title="Kanskje${hint}">${raw(icons.half)}Kanskje</button>
  </span>${dayChip(ctx, filmId)}`;
}

// "Berre la 17. ✕" når filmen er knytt til ein dag. Klikk fjernar knytinga.
export function dayChip(ctx, filmId) {
  const day = ctx.wishOf(filmId) && ctx.dayOf(filmId);
  if (!day) return "";
  return html`<button class="daychip" data-act="day" data-film="${filmId}" data-day="" title="Planlegg filmen alle dagar">Berre ${dayShort(day)} ${raw(icons.x)}</button>`;
}

// Byt berre ut element som har endra seg, så bilete ikkje blinkar og rulleposisjon står.
export function patchList(container, items) {
  const existing = new Map([...container.children].map((el) => [el.dataset.key, el]));
  const tpl = document.createElement("template");
  let prev = null;
  for (const { key, html: markup } of items) {
    let el = existing.get(key);
    if (!el || el._html !== markup) {
      tpl.innerHTML = markup.trim();
      const fresh = tpl.content.firstElementChild;
      fresh._html = markup;
      if (el) {
        fresh.style.animation = "none"; // ikkje animer på nytt ved oppdatering
        el.replaceWith(fresh);
      }
      el = fresh;
    }
    existing.delete(key);
    const want = prev ? prev.nextElementSibling : container.firstElementChild;
    if (want !== el) container.insertBefore(el, want);
    prev = el;
  }
  for (const el of existing.values()) el.remove();
}

// "Billettstatus kl. 15:12" – raud om dataa er meir enn ein time gamle (oppdateringa har stoppa?).
export function freshness(ctx) {
  const u = ctx.data.updated;
  const age = (Date.parse(ctx.now) - Date.parse(u)) / 60000;
  const when = u.slice(0, 10) === ctx.now.slice(0, 10) ? `kl. ${time(u)}` : `${dayShort(u)} kl. ${time(u)}`;
  return html`<span class="fresh ${age > 60 ? "fresh--old" : ""}" title="Tidspunkt for siste henting frå biff.no">Billettstatus ${when}</span>`;
}

const CAUSE = { past: "har vore", skip: "utelukka", soldout: "utseld", unavailable: "utanfor tidene dine" };

// Kvifor ein film på ønskelista ikkje fekk plass, som tekst.
export function unplacedText(ctx, u) {
  const on = u.day ? ` ${dayShort(u.day)}` : "";
  if (u.reason === "none") return u.day ? `Ingen visningar${on}.` : "Ingen visningar er lagt ut på biff.no.";
  if (u.reason === "conflict") {
    const names = [...new Set(u.blockers.map((id) => ctx.film.get(ctx.show.get(id).film).title))];
    const list = `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` og ${names.length - 3} til` : ""}`;
    return `Kolliderer med ${list}${u.day ? ` (berre planlagd${on})` : ""}.`;
  }
  const parts = Object.entries(u.causes || {}).map(([c, n]) => `${n} ${CAUSE[c] || c}`);
  return `Ingen visningar${on} passar: ${parts.join(", ")}.`;
}
