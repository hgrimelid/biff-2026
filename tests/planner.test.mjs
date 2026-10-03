import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, overlaps } from "../public/js/planner.js";

const show = (id, film, start, min = 90, extra = {}) => {
  const s = new Date(`2026-10-15T${start}:00`);
  const e = new Date(s.getTime() + min * 60000);
  const iso = (d) => `2026-10-15T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { id, film, start: iso(s), end: iso(e), ...extra };
};
const ids = (r) => r.plan.map((p) => p.id).sort();

test("overlapp tek omsyn til buffer", () => {
  const a = show("a", "A", "10:00", 90); // 10:00–11:30
  const b = show("b", "B", "11:40");
  assert.equal(overlaps(a, b, 0), false);
  assert.equal(overlaps(a, b, 15), true);
});

test("vel visningar som ikkje kolliderer", () => {
  const screenings = [show("a1", "A", "10:00"), show("a2", "A", "14:00"), show("b1", "B", "10:30")];
  const r = solve({ screenings, wish: { A: "must", B: "must" }, marks: {} });
  assert.deepEqual(ids(r), ["a2", "b1"]);
  assert.equal(r.unplaced.length, 0);
});

test("må-sjå vinn over kanskje", () => {
  const screenings = [show("a1", "A", "10:00"), show("b1", "B", "10:30"), show("c1", "C", "10:15")];
  const r = solve({ screenings, wish: { A: "maybe", B: "maybe", C: "must" }, marks: {} });
  assert.deepEqual(ids(r), ["c1"]);
  assert.equal(r.unplaced.length, 2);
  assert.ok(r.unplaced.every((u) => u.reason === "conflict" && u.blockers.includes("c1")));
});

test("låste visningar og billettar blir respekterte", () => {
  const screenings = [show("a1", "A", "10:00"), show("a2", "A", "14:00"), show("b1", "B", "14:30")];
  const r = solve({ screenings, wish: { A: "must", B: "must" }, marks: { a2: "ticket" } });
  assert.deepEqual(ids(r), ["a2"]);
  assert.equal(r.plan[0].ticket, true);
  assert.deepEqual(r.unplaced, [{ film: "B", prio: "must", reason: "conflict", blockers: ["a2"] }]);
});

test("utelukka, passerte og utselde visningar blir ikkje foreslått", () => {
  const screenings = [
    show("a1", "A", "09:00"),
    show("a2", "A", "12:00", 90, { status: "Ingen ledige seter" }),
    show("a3", "A", "16:00"),
    show("b1", "B", "16:00"),
  ];
  const r = solve({
    screenings,
    wish: { A: "must", B: "maybe" },
    marks: { a3: "skip" },
    now: "2026-10-15T10:00",
  });
  assert.deepEqual(ids(r), ["b1"]);
  assert.equal(r.unplaced[0].reason, "blocked");
  assert.deepEqual(r.unplaced[0].causes, { past: 1, soldout: 1, skip: 1 });
});

const showOn = (id, film, day, start, min = 90) => {
  const s = show(id, film, start, min);
  return { ...s, start: s.start.replace("2026-10-15", day), end: s.end.replace("2026-10-15", day) };
};

test("film knytt til ein dag får berre visningar den dagen", () => {
  const screenings = [showOn("a1", "A", "2026-10-15", "10:00"), showOn("a2", "A", "2026-10-17", "18:00")];
  const r = solve({ screenings, wish: { A: "maybe" }, marks: {}, days: { A: "2026-10-17" } });
  assert.deepEqual(ids(r), ["a2"]);
});

test("film knytt til ein dag blir ikkje flytta til ein annan dag ved kollisjon", () => {
  const screenings = [
    showOn("a1", "A", "2026-10-15", "10:00"),
    showOn("a2", "A", "2026-10-17", "18:00"),
    showOn("b1", "B", "2026-10-17", "18:30"),
  ];
  const r = solve({ screenings, wish: { A: "maybe" }, marks: { b1: "ticket" }, days: { A: "2026-10-17" } });
  assert.deepEqual(ids(r), ["b1"]);
  assert.equal(r.unplaced[0].reason, "conflict");
  assert.equal(r.unplaced[0].day, "2026-10-17");
});

test("tilgjengelegheit: berre visningar innanfor tidene, låste visningar står", () => {
  const screenings = [
    showOn("a1", "A", "2026-10-15", "10:00"),
    showOn("a2", "A", "2026-10-15", "17:00"),
    showOn("b1", "B", "2026-10-16", "20:00"),
    showOn("c1", "C", "2026-10-16", "12:00"),
  ];
  const avail = { "2026-10-15": "16", "2026-10-16": "no" };
  const r = solve({ screenings, wish: { A: "maybe", B: "maybe" }, marks: { c1: "lock" }, avail });
  assert.deepEqual(ids(r), ["a2", "c1"]);
  assert.deepEqual(r.unplaced, [{ film: "B", prio: "maybe", reason: "blocked", causes: { unavailable: 1 } }]);
});

test("held på førre forslag når fleire løysingar er like gode", () => {
  const screenings = [show("a1", "A", "10:00"), show("a2", "A", "14:00")];
  assert.deepEqual(ids(solve({ screenings, wish: { A: "must" }, marks: {} })), ["a1"]);
  assert.deepEqual(ids(solve({ screenings, wish: { A: "must" }, marks: {}, prev: ["a2"] })), ["a2"]);
});

test("rapporterer kollisjon mellom to låste visningar", () => {
  const screenings = [show("a1", "A", "10:00"), show("b1", "B", "10:30")];
  const r = solve({ screenings, wish: {}, marks: { a1: "lock", b1: "ticket" } });
  assert.deepEqual(r.conflicts, [["a1", "b1"]]);
});

test("ekte program: 40 filmar på ønskelista går fort", () => {
  const data = JSON.parse(readFileSync(new URL("../public/data/program.json", import.meta.url)));
  const withShows = [...new Set(data.screenings.map((s) => s.film))];
  const wish = Object.fromEntries(withShows.slice(0, 40).map((f, i) => [f, i % 2 ? "maybe" : "must"]));
  const t = performance.now();
  const r = solve({ screenings: data.screenings, wish, marks: {}, buffer: 15 });
  const ms = performance.now() - t;
  assert.ok(ms < 2000, `tok ${ms.toFixed(0)} ms`);
  // Ingen to visningar i planen kolliderer
  const byId = new Map(data.screenings.map((s) => [s.id, s]));
  const chosen = r.plan.map((p) => byId.get(p.id));
  for (let i = 0; i < chosen.length; i++)
    for (let j = i + 1; j < chosen.length; j++) assert.equal(overlaps(chosen[i], chosen[j], 15), false);
  console.log(`  ${r.plan.length} planlagt, ${r.unplaced.length} får ikkje plass, ${ms.toFixed(0)} ms`);
});
