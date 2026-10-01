// Autoforslag: vel visningar for filmane på ønskelista utan kollisjonar.
// Rein funksjon utan DOM, slik at han kan testast med `node --test`.

const WEIGHT = { must: 1000, maybe: 1 };
const KEEP_BONUS = 0.001; // føretrekk visninga frå førre forslag, så planen ikkje hoppar rundt
const NODE_LIMIT = 60_000; // per søk

export const SOLD_OUT = "Ingen ledige seter";

const toMin = (iso) => Date.parse(iso) / 60000;

// Map.groupBy finst ikkje i eldre Safari (før iOS 17.4).
export function groupBy(items, key) {
  const m = new Map();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

export function overlaps(a, b, buffer = 0) {
  return toMin(a.start) < toMin(b.end) + buffer && toMin(b.start) < toMin(a.end) + buffer;
}

/**
 * @param {object} p
 * @param {Array} p.screenings  alle visningar {id, film, start, end, status}
 * @param {Object<string,'must'|'maybe'>} p.wish  filmId -> prioritet
 * @param {Object<string,'lock'|'ticket'|'skip'>} p.marks  visningId -> merke
 * @param {number} p.buffer  minutt mellom visningar
 * @param {string} [p.now]  ISO-tid; visningar som har starta blir ikkje foreslått
 * @param {string[]} [p.prev]  visningar i førre forslag
 */
export function solve({ screenings, wish, marks, buffer = 15, now = null, prev = [] }) {
  const byId = new Map(screenings.map((s) => [s.id, s]));
  const prevSet = new Set(prev);
  const nowMin = now ? toMin(now) : -Infinity;
  const ov = (a, b) => overlaps(a, b, buffer);

  // Låste visningar og billettar er alltid med.
  const fixed = Object.entries(marks)
    .filter(([id, m]) => (m === "lock" || m === "ticket") && byId.has(id))
    .map(([id]) => byId.get(id));
  const fixedFilms = new Set(fixed.map((s) => s.film));

  const conflicts = [];
  for (let i = 0; i < fixed.length; i++)
    for (let j = i + 1; j < fixed.length; j++)
      if (ov(fixed[i], fixed[j])) conflicts.push([fixed[i].id, fixed[j].id]);

  const showsByFilm = groupBy(screenings, (s) => s.film);
  const unplaced = [];
  const items = [];
  for (const [film, prio] of Object.entries(wish)) {
    if (fixedFilms.has(film) || !WEIGHT[prio]) continue;
    const all = showsByFilm.get(film) || [];
    const usable = all.filter(
      (s) => marks[s.id] !== "skip" && toMin(s.start) >= nowMin && s.status !== SOLD_OUT,
    );
    const options = usable.filter((s) => !fixed.some((f) => ov(s, f)));
    if (options.length) {
      items.push({ film, prio, weight: WEIGHT[prio], options });
    } else if (usable.length) {
      const blockers = fixed.filter((f) => usable.some((s) => ov(s, f))).map((f) => f.id);
      unplaced.push({ film, prio, reason: "conflict", blockers });
    } else {
      unplaced.push({ film, prio, reason: reasonFor(all, marks, nowMin) });
    }
  }

  const value = (it, s) => it.weight + (prevSet.has(s.id) ? KEEP_BONUS : 0);
  const scoreOf = (picks) => picks.reduce((sum, [it, s]) => sum + value(it, s), 0);

  // 1) Første forslag for alle filmane.
  let picks = search(items, [], ov, value).picks;

  // 2) Forbetring: løys éin dag (og to dagar på rad) på nytt med resten av planen fast.
  //    Filmar som ikkje fekk plass er alltid med i dellproblemet. Godta berre betre planar.
  //    I tillegg: for kvar film som står utanfor, alle dagane han går.
  const dayOf = (s) => s.start.slice(0, 10);
  const days = [...new Set(items.flatMap((it) => it.options.map(dayOf)))].sort();
  const windows = [...days.map((d) => [d]), ...days.slice(1).map((d, i) => [days[i], d])];
  for (let round = 0, improved = true; improved && round < 5; round++) {
    improved = false;
    const placed = new Set(picks.map(([it]) => it.film));
    const outside = items.filter((it) => !placed.has(it.film)).map((it) => [...new Set(it.options.map(dayOf))]);
    for (const win of [...windows, ...outside]) {
      const out = picks.filter(([, s]) => win.includes(s.start.slice(0, 10)));
      if (!out.length && round > 0) continue;
      const keep = picks.filter((p) => !out.includes(p));
      const keepFilms = new Set(keep.map(([it]) => it.film));
      const sub = search(
        items.filter((it) => !keepFilms.has(it.film)),
        keep.map(([, s]) => s),
        ov,
        value,
      );
      if (sub.score > scoreOf(out) + 1e-9) {
        picks = [...keep, ...sub.picks];
        improved = true;
      }
    }
  }

  const chosen = new Set(picks.map(([it]) => it.film));
  const planned = [...fixed, ...picks.map(([, s]) => s)];
  for (const it of items) {
    if (chosen.has(it.film)) continue;
    const blockers = planned.filter((p) => it.options.some((o) => ov(o, p))).map((p) => p.id);
    unplaced.push({ film: it.film, prio: it.prio, reason: "conflict", blockers });
  }

  const plan = [
    ...fixed.map((s) => ({ id: s.id, film: s.film, fixed: true, ticket: marks[s.id] === "ticket" })),
    ...picks.map(([, s]) => ({ id: s.id, film: s.film, fixed: false, ticket: false })),
  ].sort((a, b) => byId.get(a.id).start.localeCompare(byId.get(b.id).start));

  unplaced.sort((a, b) => WEIGHT[b.prio] - WEIGHT[a.prio]);
  return { plan, unplaced, conflicts };
}

/**
 * Branch and bound: vel maks éi visning per film utan overlapp, maksimer sum av value().
 * `taken` er visningar som alt er i planen og ikkje kan overlappast.
 * Returnerer {score, picks: [[item, screening], ...]}.
 */
function search(allItems, taken, ov, value) {
  const items = allItems
    .map((it) => ({ ...it, options: it.options.filter((s) => !taken.some((t) => ov(s, t))) }))
    .filter((it) => it.options.length);

  // Kvar kandidatvisning får ein bit; conf[k] er bitmaska av kandidatar som kolliderer med k.
  const cands = items.flatMap((it) => it.options);
  const W = Math.ceil(cands.length / 32) || 1;
  const conf = cands.map((a) => {
    const m = new Uint32Array(W);
    cands.forEach((b, k) => ov(a, b) && (m[k >>> 5] |= 1 << (k & 31)));
    return m;
  });
  let next = 0;
  for (const it of items) it.idx = it.options.map(() => next++);

  const isFree = (blocked, k) => !(blocked[k >>> 5] & (1 << (k & 31)));
  const toggle = (mask, it) => it.idx.forEach((k) => (mask[k >>> 5] ^= 1 << (k & 31)));
  const stack = Array.from({ length: items.length + 1 }, () => new Uint32Array(W));
  const open = new Uint32Array(W); // kandidatar for filmar som ikkje er avgjorde enno
  items.forEach((it) => toggle(open, it));
  const used = new Uint8Array(items.length);
  const maxValue = (it) => Math.max(...it.options.map((s) => value(it, s)));

  let best = { score: -1, picks: [] };
  const picks = [];
  let nodes = 0;

  (function dfs(depth, score) {
    if (++nodes > NODE_LIMIT) return;
    const blocked = stack[depth];
    // Øvre grense: berre filmar som framleis har ei ledig visning kan bidra.
    // Samtidig: vel neste film – høgast prioritet, deretter færrast ledige visningar.
    let bound = score, pick = -1, pickFree = 0;
    for (let j = 0; j < items.length; j++) {
      if (used[j]) continue;
      let free = 0;
      for (const k of items[j].idx) free += isFree(blocked, k);
      if (!free) continue;
      bound += maxValue(items[j]);
      const better = pick < 0 || items[j].weight > items[pick].weight ||
        (items[j].weight === items[pick].weight && free < pickFree);
      if (better) (pick = j), (pickFree = free);
    }
    if (bound <= best.score) return;
    if (pick < 0) {
      best = { score, picks: picks.slice() };
      return;
    }

    const it = items[pick];
    used[pick] = 1;
    toggle(open, it);
    const child = stack[depth + 1];
    // Prøv først visninga med høgast verdi, så den som blokkerer færrast andre.
    const order = it.idx
      .map((k, o) => ({ k, s: it.options[o] }))
      .filter(({ k }) => isFree(blocked, k))
      .map((c) => {
        let cost = 0;
        for (let w = 0; w < W; w++) cost += popcount(conf[c.k][w] & ~blocked[w] & open[w]);
        return { ...c, cost, v: value(it, c.s) };
      })
      .sort((a, b) => b.v - a.v || a.cost - b.cost || a.s.start.localeCompare(b.s.start));
    for (const { k, s, v } of order) {
      for (let w = 0; w < W; w++) child[w] = blocked[w] | conf[k][w];
      picks.push([it, s]);
      dfs(depth + 1, score + v);
      picks.pop();
    }
    child.set(blocked);
    dfs(depth + 1, score); // eller: hopp over denne filmen
    toggle(open, it);
    used[pick] = 0;
  })(0, 0);

  // Returner dei opphavlege item-objekta, ikkje kopiane.
  const orig = new Map(allItems.map((it) => [it.film, it]));
  return { score: Math.max(best.score, 0), picks: best.picks.map(([it, s]) => [orig.get(it.film), s]) };
}

// Kvifor ingen visning er brukbar: "none" | "past" | "soldout" | "skipped"
function reasonFor(all, marks, nowMin) {
  if (!all.length) return "none";
  const future = all.filter((s) => toMin(s.start) >= nowMin);
  if (!future.length) return "past";
  if (future.some((s) => s.status === SOLD_OUT && marks[s.id] !== "skip")) return "soldout";
  return "skipped";
}

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
