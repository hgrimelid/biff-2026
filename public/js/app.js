import * as store from "./store.js";
import { solve, overlaps, groupBy, SOLD_OUT } from "./planner.js";
import { localNow, str, dayLong, time } from "./format.js";
import * as films from "./views/films.js";
import * as program from "./views/program.js";
import * as plan from "./views/plan.js";
import * as detail from "./views/detail.js";

const VIEWS = { filmar: films, program, plan };
const $ = (sel) => document.querySelector(sel);

const ctx = {
  state: store.load(),
  ui: { q: "", cat: "", day: "", show: "", sort: "tittel", onlyWish: false, alts: new Set() },
};

// ───────── Data ─────────

async function loadData() {
  const res = await fetch("data/program.json", { cache: "no-cache" });
  const data = await res.json();
  if (data.updated === ctx.data?.updated) return false;
  ctx.data = data;
  ctx.film = new Map(data.films.map((f) => [f.id, f]));
  ctx.show = new Map(data.screenings.map((s) => [s.id, s]));
  ctx.showsByFilm = groupBy(data.screenings, (s) => s.film);
  ctx.days = [...new Set(data.screenings.map((s) => s.start.slice(0, 10)))].sort();
  return true;
}

// Ny programdata blir publisert kvart 10. minutt. Hent ho når sida står open,
// og når ho kjem fram att (t.d. mobilen blir låst opp).
async function refresh() {
  try {
    await loadData();
  } catch {
    /* offline: behald det vi har */
  }
  recompute();
  renderColophon();
  render();
}

async function boot() {
  await loadData();
  handleImport();
  recompute();
  renderColophon();
  addEventListener("hashchange", render);
  render();
  setInterval(() => document.visibilityState === "visible" && refresh(), 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
}

function handleImport() {
  const param = new URLSearchParams(location.search).get("plan");
  if (!param) return;
  history.replaceState(null, "", location.pathname + location.hash);
  try {
    const imported = store.parseImport(param, ctx.show);
    const n = Object.keys(imported.wish).length;
    if (confirm(`Importere plan med ${n} filmar på ønskelista?\n\nDette erstattar planen som er lagra i denne nettlesaren.`)) {
      ctx.state = imported;
      store.save(ctx.state);
      toast("Planen er importert");
    }
  } catch {
    alert("Klarte ikkje å lese planlenkja.");
  }
}

// ───────── Planlegging ─────────

function recompute() {
  const { state } = ctx;
  ctx.now = localNow();
  const marks = Object.fromEntries(Object.entries(state.shows).map(([id, x]) => [id, x.m]));
  // Visningar frå førre forslag som alt har vore, held vi fast på (du har truleg sett filmen).
  for (const id of state.prev) {
    const s = ctx.show.get(id);
    if (s && s.start < ctx.now && state.wish[s.film] && !marks[id]) marks[id] = "lock";
  }
  ctx.result = solve({
    screenings: ctx.data.screenings,
    wish: state.wish,
    marks,
    buffer: state.buffer,
    now: ctx.now,
    prev: state.prev,
  });
  ctx.planBySid = new Map(ctx.result.plan.map((p) => [p.id, p]));
  ctx.planByFilm = groupBy(ctx.result.plan, (p) => p.film);
  ctx.unplacedByFilm = new Map(ctx.result.unplaced.map((u) => [u.film, u]));
  state.prev = ctx.result.plan.map((p) => p.id);
  store.save(state);
}

// Hjelparar som visingane brukar.
Object.assign(ctx, {
  wishOf: (filmId) => ctx.state.wish[filmId],
  markOf: (showId) => ctx.state.shows[showId]?.m,
  isPast: (s) => s.start < ctx.now,
  soldOut: (s) => s.status === SOLD_OUT,
  // Visningar i planen (andre filmar) som kolliderer med s.
  clashes: (s) =>
    ctx.result.plan
      .map((p) => ctx.show.get(p.id))
      .filter((p) => p.film !== s.film && overlaps(p, s, ctx.state.buffer)),
  // Merke som er sette på visningar som har endra seg eller forsvunne frå programmet.
  stale: () =>
    Object.entries(ctx.state.shows)
      .filter(([, x]) => x.m !== "skip")
      .map(([id, x]) => ({ id, x, s: ctx.show.get(id) }))
      .filter(({ x, s }) => !s || s.start !== x.s || s.venue !== x.v),
});

// ───────── Handlingar ─────────

function setWish(filmId, prio) {
  const { state } = ctx;
  if (state.wish[filmId] === prio) {
    delete state.wish[filmId];
    // Fjern låsingar for filmen (billettar står, dei er faktiske kjøp).
    for (const [id, x] of Object.entries(state.shows)) if (x.f === filmId && x.m === "lock") delete state.shows[id];
  } else {
    state.wish[filmId] = prio;
  }
}

function setMark(showId, m) {
  const { state } = ctx;
  const s = ctx.show.get(showId);
  if (state.shows[showId]?.m === m) {
    delete state.shows[showId];
    return;
  }
  if (m === "lock" || m === "ticket") {
    // Berre éi låst visning per film; ein billett erstattar låsinga.
    for (const [id, x] of Object.entries(state.shows)) if (x.f === s.film && x.m === "lock") delete state.shows[id];
    if (!state.wish[s.film]) state.wish[s.film] = "must";
  }
  state.shows[showId] = { m, f: s.film, s: s.start, v: s.venue };
}

const actions = {
  wish: (d) => setWish(d.film, d.prio),
  mark: (d) => setMark(d.show, d.m),
  open: (d) => openFilm(d.film),
  close: () => closeFilm(),
  alts: (d) => (ctx.ui.alts.has(d.film) ? ctx.ui.alts.delete(d.film) : ctx.ui.alts.add(d.film)),
  "ack-stale": (d) => {
    const x = ctx.state.shows[d.show], s = ctx.show.get(d.show);
    if (s) Object.assign(x, { s: s.start, v: s.venue });
    else delete ctx.state.shows[d.show];
  },
  "copy-link": async () => {
    const link = store.exportLink(ctx.state);
    try {
      await navigator.clipboard.writeText(link);
      toast("Lenkja er kopiert – opne ho på den andre eininga");
    } catch {
      prompt("Kopier denne lenkja og opne ho på den andre eininga:", link);
    }
    return false;
  },
  reset: () => {
    if (!confirm("Slette heile ønskelista og alle merke (låst, billett, utelukka)?")) return false;
    ctx.state = { ...ctx.state, wish: {}, shows: {}, prev: [] };
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) {
    // Klikk på bakgrunnen lukkar dialogen.
    if (e.target === $("#film-dialog")) closeFilm();
    return;
  }
  e.preventDefault();
  const changed = actions[el.dataset.act]?.(el.dataset);
  if (changed === false || el.dataset.act === "open" || el.dataset.act === "close") return;
  recompute();
  render();
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.ui) {
    ctx.ui[t.dataset.ui] = t.type === "checkbox" ? t.checked : t.value;
    render();
  } else if (t.id === "buffer") {
    const v = Math.max(0, Math.min(120, parseInt(t.value, 10) || 0));
    ctx.state.buffer = v;
    recompute();
    render();
  }
});

// ───────── Filmdetalj (dialog) ─────────

// Opning legg til ei historikkoppføring, så tilbake-knappen (mobil) lukkar dialogen.
function openFilm(id) {
  const r = route();
  ctx.ui.openedHere = true;
  location.hash = `#/${[r.view, r.arg].filter(Boolean).join("/")}?film=${id}`;
}
function closeFilm() {
  const r = route();
  if (ctx.ui.openedHere) {
    ctx.ui.openedHere = false;
    history.back();
  } else {
    history.replaceState(null, "", `#/${[r.view, r.arg].filter(Boolean).join("/")}`);
    render();
  }
}

$("#film-dialog").addEventListener("close", () => {
  if (route().film) closeFilm();
});

// ───────── Ruting og teikning ─────────

function route() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [view = "filmar", arg = ""] = path.split("/");
  return { view: VIEWS[view] ? view : "filmar", arg, film: new URLSearchParams(query).get("film") };
}

function render() {
  const r = route();
  const main = $("#view");

  document.querySelectorAll("[data-tab]").forEach((a) =>
    a.dataset.tab === r.view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
  );
  // Teikninga kan byte ut felt; hald på fokus og markør.
  const active = document.activeElement;
  const focus = active?.id ? { id: active.id, pos: active.selectionStart } : null;
  $("#plan-count").textContent = ctx.result.plan.length || "";

  if (main.dataset.view !== r.view) {
    main.dataset.view = r.view;
    main.innerHTML = "";
    scrollTo(0, 0);
  }
  VIEWS[r.view].render(ctx, main, r);
  if (focus && document.activeElement?.id !== focus.id) {
    const el = document.getElementById(focus.id);
    el?.focus();
    if (el && focus.pos != null) try { el.setSelectionRange(focus.pos, focus.pos); } catch { /* type=number */ }
  }

  const dlg = $("#film-dialog");
  const film = r.film && ctx.film.get(r.film);
  if (film) {
    const top = dlg.scrollTop;
    dlg.innerHTML = str(detail.render(ctx, film));
    if (!dlg.open) {
      dlg.showModal();
      dlg.scrollTop = 0;
    } else dlg.scrollTop = top;
  } else if (dlg.open) {
    dlg.close();
  }
}

function renderColophon() {
  const u = ctx.data.updated;
  $("#colophon").innerHTML = `Uoffisiell planleggar, ikkje laga av BIFF. Programdata frå
    <a href="https://www.biff.no" rel="noopener">biff.no</a>, sist henta ${dayLong(u).toLowerCase()} kl. ${time(u)}
    (blir oppdatert kvart 10. minutt under sal og festival). Sjekk alltid biff.no før du kjøper.
    Planen din blir lagra berre i denne nettlesaren.`;
}

let toastTimer;
export function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
}

boot().catch((err) => {
  console.error(err);
  $("#view").innerHTML = `<p class="empty">Klarte ikkje å laste programmet. Prøv å laste sida på nytt.</p>`;
});
