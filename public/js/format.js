// Formatering (nynorsk) og små hjelparar.

const WD = ["sundag", "måndag", "tysdag", "onsdag", "torsdag", "fredag", "laurdag"];
const WD_SHORT = ["su", "må", "ty", "on", "to", "fr", "la"];
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

const date = (iso) => new Date(iso.length === 10 ? iso + "T12:00" : iso);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const dayKey = (iso) => iso.slice(0, 10);
export const time = (iso) => iso.slice(11, 16);
export const dayLong = (iso) => { const d = date(iso); return `${cap(WD[d.getDay()])} ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
export const dayShort = (iso) => { const d = date(iso); return `${WD_SHORT[d.getDay()]} ${d.getDate()}.`; };
export const weekdayShort = (iso) => WD_SHORT[date(iso).getDay()];
export const dayNum = (iso) => date(iso).getDate();

export function runtime(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} t${m ? ` ${m} min` : ""}` : `${m} min`;
}

export const minutesBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

export function localNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// Taggar mal: html`<p>${x}</p>` escapar verdiar; raw() og array av raw slepp gjennom.
const RAW = Symbol("raw");
export const raw = (s) => ({ [RAW]: String(s) });
export function html(strings, ...vals) {
  const out = strings.reduce((acc, s, i) => acc + s + (i < vals.length ? val(vals[i]) : ""), "");
  return raw(out);
}
function val(v) {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(val).join("");
  if (typeof v === "object" && RAW in v) return v[RAW];
  return esc(v);
}
export const str = (r) => r[RAW];

// Plakat i passande storleik frå Filmgrail sitt bilete-CDN.
export const poster = (url, width = 360) => (url ? `${url.split("?")[0]}?optimizer=image&width=${width}` : "");

export const icons = {
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z"/></svg>',
  ticket: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 4h14v3a1.5 1.5 0 0 0 0 3v3H1v-3a1.5 1.5 0 0 0 0-3V4zm9 1v1h1V5h-1zm0 2v1h1V7h-1zm0 2v1h1V9h-1zm0 2v1h1v-1h-1z"/></svg>',
  star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1l2.2 4.6 5 .6-3.7 3.5.9 5L8 12.3 3.6 14.7l.9-5L.8 6.2l5-.6z"/></svg>',
  half: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M8 2.6l1.7 3.6 3.9.5-2.9 2.7.7 3.9L8 11.4l-3.4 1.9.7-3.9-2.9-2.7 3.9-.5z"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path stroke="currentColor" stroke-width="2" d="M3 3l10 10M13 3L3 13"/></svg>',
  ext: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M9 2h5v5M14 2L7 9M12 10v4H2V4h4"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>',
  swap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M2 5h10l-3-3M14 11H4l3 3"/></svg>',
};
