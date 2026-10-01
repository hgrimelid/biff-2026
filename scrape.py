#!/usr/bin/env python3
"""Hentar BIFF-programmet frå biff.no og skriv public/data/program.json.

Bruk:
    python3 scrape.py              # hent alt på nytt frå biff.no (ca. 13 sidekall)
    python3 scrape.py --cache      # gjenbruk nedlasta sider i .cache/ (raskt under utvikling)

Berre standardbiblioteket. biff.no (Filmgrail) legg data som URL-koda JSON i
<script>-blokker. Kalendersida for kvar dag (/showtimes-calendar/<dato>) har alle
visningane den dagen med billettstatus og full filmdata, så vi treng berre éi side
per dag. Filmar utan visningar hentar vi frå filmsida si.
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = "https://www.biff.no"
LISTING = BASE + "/playing-now/all/all"
CALENDAR = BASE + "/showtimes-calendar/{}"
ROOT = Path(__file__).parent
OUT = ROOT / "public" / "data" / "program.json"
CACHE = ROOT / ".cache"
HEADERS = {"User-Agent": "biff-planlegger (privat prosjekt)"}

BLOCK_RE = re.compile(r'JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)')
# Tekniske merknader som står på alle visningar og ikkje seier noko nyttig.
TECH_NOTE = re.compile(r"^(2D|3D|Original tale|\w+ tekst|Utekstet)$", re.I)


def fetch(url, use_cache):
    path = CACHE / (re.sub(r"[^a-zA-Z0-9]+", "_", url.removeprefix(BASE)).strip("_") + ".html")
    if use_cache and path.exists():
        return path.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8")
    CACHE.mkdir(exist_ok=True)
    path.write_text(html, encoding="utf-8")
    time.sleep(0.3)
    return html


def blocks(html, name):
    for m in BLOCK_RE.finditer(html):
        try:
            b = json.loads(urllib.parse.unquote(m.group(1)))
        except json.JSONDecodeError:
            continue
        if b.get("_blockName") == name:
            yield b


def split_list(s):
    # Feltet er anten "A, B" eller ["A", "B"] (eller [{"name": "A"}]) avhengig av filmen.
    items = s if isinstance(s, list) else re.split(r",", s or "")
    items = [x.get("name", "") if isinstance(x, dict) else str(x) for x in items]
    return [x.strip() for x in items if x.strip()]


def venue_name(screen):
    # "KP  1 Bergen Parkering" -> "KP1", "KP  2 D-BOX" -> "KP2"
    m = re.match(r"KP\s*(\d+)", screen)
    return f"KP{m.group(1)}" if m else screen.strip()


def venue_location(venue):
    return "Konsertpaleet" if re.match(r"KP\d+$", venue) else venue


def film_from(d, path):
    """Filmdata frå eit Filmgrail-filmobjekt (same felt på filmside og i kalender)."""
    director = d.get("director") or {}
    return {
        "id": str(d["movieId"]),
        "url": BASE + path,
        "title": d["title"].strip(),
        "originalTitle": (d.get("titleOriginal") or "").strip() or None,
        "year": d.get("releaseYear"),
        "runtime": d.get("runtime") or 0,
        "countries": split_list(d.get("country")),
        "languages": split_list(d.get("language")),
        "subtitles": d.get("subtitles") or None,
        "ageRating": d.get("ageRating"),
        "categories": d.get("categories") or [],
        "genres": d.get("genres") or [],
        "directors": split_list(director.get("name")),
        "directorBio": director.get("directorBio") or None,
        "cast": [c["name"] for c in d.get("cast") or [] if c.get("name")],
        "writer": d.get("screenWriter") or None,
        "oneliner": d.get("oneliner") or None,
        "text": d.get("ingress") or d.get("overview") or d.get("kortomtale") or None,
        "poster": d.get("poster") or None,
        "trailer": d.get("trailer") or None,
        "interested": d.get("savedCount") or 0,
    }


def screening_from(s, film, screen):
    # startTime er lokal tid sjølv om han har "Z" på slutten.
    start = datetime.fromisoformat(s["startTime"][:19])
    venue = venue_name(screen)
    return {
        "id": str(s["showId"]),
        "film": film["id"],
        "start": start.isoformat(timespec="minutes"),
        "end": (start + timedelta(minutes=film["runtime"])).isoformat(timespec="minutes"),
        "venue": venue,
        "location": venue_location(venue),
        "notes": [n for n in s.get("notes") or [] if n and not TECH_NOTE.match(n)],
        "status": s.get("label") or None,  # "Ingen ledige seter", "Få billetter igjen"
        "ticketsAvailable": s.get("ticketsAvailable"),
        "ticketUrl": f"{BASE}/showtime/{s['showId']}",
    }


def calendar(day, use_cache):
    html = fetch(CALENDAR.format(day), use_cache)
    for b in blocks(html, "LazyBlock"):
        if "program" in (b.get("sData") or {}):
            return b["sData"]
    raise ValueError(f"fann ikkje programdata på {CALENDAR.format(day)}")


def film_page(path, use_cache):
    """Filmside: brukt for filmar som ikkje har visningar i kalenderen."""
    html = fetch(BASE + path, use_cache)
    details = next(blocks(html, "MovieDetailsPage"))["movieDetails"]
    return film_from(details, path)


def diff(old, new):
    """Skriv ut kva som har endra seg sidan førre køyring."""
    if not old:
        return
    titles = {f["id"]: f["title"] for f in new["films"] + old["films"]}
    o = {s["id"]: s for s in old["screenings"]}
    n = {s["id"]: s for s in new["screenings"]}
    lines = []
    for sid in o.keys() - n.keys():
        s = o[sid]
        lines.append(f"  - FJERNA  {titles[s['film']]}  {s['start']} {s['venue']}")
    for sid in n.keys() - o.keys():
        s = n[sid]
        lines.append(f"  + NY      {titles[s['film']]}  {s['start']} {s['venue']}")
    for sid in o.keys() & n.keys():
        a, b = o[sid], n[sid]
        for key in ("start", "venue", "status"):
            if a.get(key) != b.get(key):
                lines.append(f"  ~ ENDRA   {titles[b['film']]}  {key}: {a.get(key)} -> {b.get(key)}")
    print(f"\nEndringar sidan førre køyring ({len(lines)}):" if lines else "\nIngen endringar i visningar sidan førre køyring.")
    print("\n".join(sorted(lines)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", action="store_true", help="gjenbruk sider i .cache/")
    args = ap.parse_args()

    # Kalendersida for i dag listar alle datoane som har visningar.
    days = [d["query"] for d in calendar("today", args.cache)["dates"]]
    print(f"Hentar {len(days)} dagar: {', '.join(days)}")

    films, screenings = {}, {}
    for day in days:
        for group in calendar(day, args.cache)["program"]:
            for s in group["showtimes"]:
                movie = (s.get("movie") or [None])[0]
                if not movie:
                    continue
                path = s.get("movieLink") or f"/f/film/{movie['movieId']}"
                film = films.setdefault(str(movie["movieId"]), film_from(movie, path))
                screenings[str(s["showId"])] = screening_from(s, film, group["screenName"])

    # Filmlista: plakatar (kalenderen manglar dei for mange filmar) og filmar utan visningar.
    listing = fetch(LISTING, args.cache)
    posters = {c["link"]: c.get("posterImage") for c in blocks(listing, "PosterCard")}
    failed = []
    for path, fid in sorted(set(re.findall(r'href="(/f/[^"/]+/(\d+))"', listing))):
        if fid not in films:
            try:
                films[fid] = film_page(path, args.cache)
            except Exception as e:  # ei øydelagd side skal ikkje stoppe resten
                failed.append(f"{path}: {e}")
                continue
        films[fid]["poster"] = posters.get(path) or films[fid]["poster"]

    oslo_now = datetime.now(ZoneInfo("Europe/Oslo")).replace(tzinfo=None)
    data = {
        "festival": "BIFF 2026",
        "source": BASE,
        "updated": oslo_now.isoformat(timespec="minutes"),
        "films": sorted(films.values(), key=lambda f: f["title"].lower()),
        "screenings": sorted(screenings.values(), key=lambda s: (s["start"], s["venue"])),
    }

    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    # Vern mot at ei endring på biff.no gir oss eit halvtomt program som så blir publisert.
    if old and len(data["screenings"]) < 0.5 * len(old["screenings"]):
        print(f"FEIL: berre {len(data['screenings'])} visningar (hadde {len(old['screenings'])}). Skriv ikkje fila.")
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    no_shows = [f["title"] for f in data["films"] if f["id"] not in {s["film"] for s in data["screenings"]}]
    print(f"Skreiv {len(data['films'])} filmar og {len(data['screenings'])} visningar til {OUT.relative_to(ROOT)}")
    if no_shows:
        print("Filmar utan visningar på biff.no: " + ", ".join(no_shows))
    if failed:
        print("FEIL:\n  " + "\n  ".join(failed))
    diff(old, data)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
