import { html, raw, icons, time, dayShort } from "../format.js";

export const KIND_LABEL = { fiksjon: "Fiksjon", dok: "Dokumentar", kort: "Kortfilm", arr: "Arrangement" };

export function kindOf(f) {
  const c = f.categories.join(" ").toLowerCase();
  if (c.includes("kortfilm")) return "kort";
  if (c.includes("arrangement")) return "arr";
  if (c.includes("dokumentar") || f.genres.includes("dokumentar")) return "dok";
  return "fiksjon";
}

export function wishButtons(ctx, filmId) {
  const w = ctx.wishOf(filmId);
  return html`<span class="wish" role="group" aria-label="Ønskeliste">
    <button class="btn btn--small btn--must" data-act="wish" data-film="${filmId}" data-prio="must" aria-pressed="${w === "must"}">${raw(icons.star)}Må sjå</button>
    <button class="btn btn--small btn--maybe" data-act="wish" data-film="${filmId}" data-prio="maybe" aria-pressed="${w === "maybe"}">${raw(icons.half)}Kanskje</button>
  </span>`;
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
