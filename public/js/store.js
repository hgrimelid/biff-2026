// Tilstand som nettlesaren hugsar (localStorage), og overføring via lenkje.
//
// wish:  filmId -> "must" | "maybe"
// shows: visningId -> { m: "lock" | "ticket" | "skip", f: filmId, s: start, v: sal }
//        (f/s/v er ein kopi frå då merket vart sett, så vi kan varsle om endringar)
// days:  filmId -> dato ("2026-10-17"): filmen skal berre planleggjast den dagen
// avail: dato -> "12" | "16" | "18" (frå kl.) | "no" (ikkje): når brukaren har høve
// buffer: minutt mellom visningar
// prev:  visningar i førre forslag (held planen stabil)

const KEY = "biff-2026-plan";
const DEFAULTS = { v: 1, wish: {}, shows: {}, days: {}, avail: {}, buffer: 15, prev: [] };

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) return { ...DEFAULTS, ...raw };
  } catch {
    /* tom eller øydelagd lagring: start på nytt */
  }
  return structuredClone(DEFAULTS);
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // privat modus o.l.: appen fungerer, men hugsar ikkje
  }
}

// Lenkje som flyttar planen til ei anna eining. Berre det som trengst – resten
// blir fylt inn frå programdata ved import.
export function exportLink(state) {
  const compact = {
    w: Object.fromEntries(Object.entries(state.wish).map(([f, p]) => [f, p === "must" ? 2 : 1])),
    m: Object.fromEntries(Object.entries(state.shows).map(([id, x]) => [id, x.m[0]])),
    d: state.days,
    a: state.avail,
    b: state.buffer,
  };
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(compact))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${location.origin}${location.pathname}?plan=${b64}`;
}

export function parseImport(param, showsById) {
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(param.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)),
  );
  const c = JSON.parse(json);
  const M = { l: "lock", t: "ticket", s: "skip" };
  const shows = {};
  for (const [id, m] of Object.entries(c.m || {})) {
    const s = showsById.get(id);
    if (s && M[m]) shows[id] = { m: M[m], f: s.film, s: s.start, v: s.venue };
  }
  return {
    ...structuredClone(DEFAULTS),
    wish: Object.fromEntries(Object.entries(c.w || {}).map(([f, p]) => [f, p === 2 ? "must" : "maybe"])),
    shows,
    days: c.d || {},
    avail: c.a || {},
    buffer: Number.isFinite(c.b) ? c.b : DEFAULTS.buffer,
  };
}
