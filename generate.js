#!/usr/bin/env node
/* Regenerates data/countries.js and data/detail.js.
 *
 *   node build/generate.js          write the data files
 *   node build/generate.js --check  compare against vendor/current-mapdata.json
 *
 * Geometry, names, regions and most spellings come from upstream packages.
 * Four things have no machine-readable source and live in build/curated/:
 * population, UN admission dates, the bonus flag, and the hand-added spellings.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { feature } = require("topojson-client");
const { geoNaturalEarth1, geoPath, geoArea } = require("d3-geo");
const worldCountries = require("world-countries");
const { norm } = require("../lib/normalise.js");

const ROOT = path.join(__dirname, "..");
const CURATED = path.join(__dirname, "curated");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const VIEW = [1000, 500];
const BASE_DP = 1; // decimals for the 110m outlines
const HD_DP = 3;   // decimals for the 10m outlines (2 is visually identical and ~20% smaller)

/* The README says f frames the country's largest landmass. It does not, and
   never has: the shipped US frame spans 255.8 units, which is the full box
   including Alaska and Hawaii, not the 144.95 the lower 48 would give.
   "bbox" reproduces the shipped data. "landmass" is what the README promises
   and is a one-word change here, but it moves ~40 frames, so it is opt-in. */
const FRAMING = process.env.FRAMING || "bbox";

/* ---------- inputs ---------- */
const curated = {
  population: read(path.join(CURATED, "population.json")),
  un: read(path.join(CURATED, "un.json")),
  aliases: read(path.join(CURATED, "aliases.json")),
  bonus: new Set(read(path.join(CURATED, "bonus.json"))),
  frames: read(path.join(CURATED, "frames.json")),
};

const topo110 = read(require.resolve("world-atlas/countries-110m.json"));
const topo10 = read(require.resolve("world-atlas/countries-10m.json"));

const id = (f) => String(Number(f.id)); // "004" -> "4", "-99" -> "-99"
const index = (topo) => {
  const out = new Map();
  const loose = [];
  for (const f of feature(topo, topo.objects.countries).features) {
    const k = id(f);
    if (k === "NaN" || k === "-99") loose.push(f);
    else out.set(k, f);
  }
  return { out, loose };
};

const i110 = index(topo110);
const i10 = index(topo10);

const byNum = new Map();
for (const c of worldCountries) byNum.set(String(Number(c.ccn3)), c);

/* ---------- the answer set ---------- */
/* 193 UN members, plus the entries curated/un.json records as non-members
   (Vatican City, Palestine, and Taiwan which is flagged as a bonus). */
const answers = new Set();
for (const c of worldCountries) if (c.unMember) answers.add(String(Number(c.ccn3)));
for (const k of Object.keys(curated.un)) if (curated.un[k].note) answers.add(k);
const scoring = [...answers].filter((k) => !curated.bonus.has(k)).length;
/* world-countries flags 194 unMember entries; Palestine is in there despite
   being an observer. Trust the curated table for the real membership count. */
const members = Object.values(curated.un).filter((x) => x.admitted).length;

/* ---------- projection ---------- */
const proj = geoNaturalEarth1().fitSize(VIEW, { type: "Sphere" });
const raw = geoPath(proj);

/* Fixed decimals rather than d3's .digits(), which strips trailing zeros and
   would emit 670 where the shipped data has 670.0. */
const fixed = (d, dp) =>
  d == null ? d : d.replace(/-?\d+(?:\.\d+)?/g, (m) => Number(m).toFixed(dp));
const path110 = (f) => fixed(raw(f), BASE_DP);
const path10 = (f) => fixed(raw(f), HD_DP);

/* Bounds by projecting every vertex rather than geoPath.bounds(), which runs
   the shape through spherical clipping and returns the whole sphere for the
   tiny or badly-wound rings in the 10m data (Maldives came back 962 units
   wide). This is a plane measurement of an already-projected shape. */
function boxOf(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      const pt = proj(c);
      if (!pt) return;
      if (pt[0] < x0) x0 = pt[0];
      if (pt[0] > x1) x1 = pt[0];
      if (pt[1] < y0) y0 = pt[1];
      if (pt[1] > y1) y1 = pt[1];
      return;
    }
    for (const k of c) walk(k);
  };
  walk(geom.coordinates);
  return [x0, y0, x1, y1];
}

const WRAPS = 400;     // this wide means the country straddles the antimeridian
const DOMINATES = 0;   // outlier trimming is done by curated/frames.json instead
const NO_SHAPE = 0.05; // below this there is nothing a zoom could reveal

/* The full bounding box, with one automatic exception: Fiji and Kiribati
   straddle the antimeridian, so their true box is most of the Pacific and
   they frame their largest island instead.
   No rule reproduces the rest of the shipped frames -- Maldives keeps a chain
   11.6x its main island while Mauritius drops Rodrigues at 8.4x -- so the
   countries that want a tighter view carry an explicit override. */
function frame(f) {
  const g = f.geometry;
  const full = boxOf(g);
  const spanOf = (b) => Math.max(b[2] - b[0], b[3] - b[1]);
  let box = full;
  if (g.type === "MultiPolygon") {
    let best = -1, pick = null;
    for (const coords of g.coordinates) {
      const poly = { type: "Polygon", coordinates: coords };
      const a = geoArea(poly);
      if (a > best) { best = a; pick = poly; }
    }
    if (pick) {
      const main = boxOf(pick);
      const ratio = spanOf(main) / (spanOf(full) || 1);
      if (spanOf(full) > WRAPS || ratio < DOMINATES || FRAMING === "landmass") box = main;
    }
  }
  const [x0, y0, x1, y1] = box;
  const span = Math.max(x1 - x0, y1 - y0);
  return [+((x0 + x1) / 2).toFixed(1), +((y0 + y1) / 2).toFixed(1), +span.toFixed(2)];
}

/* Dots are the country's own coordinates from world-countries, projected --
   not a centroid of the geometry. For a scattered country those differ a lot:
   Kiribati's listed point is Tarawa, its area centroid is open ocean. */
function dot(num) {
  const src = byNum.get(num);
  if (!src || !src.latlng) return null;
  const [lat, lng] = src.latlng;
  const [x, y] = proj([lng, lat]);
  return [+x.toFixed(1), +y.toFixed(1)];
}

/* ---------- spellings ---------- */
function spellings(num, display) {
  const seen = new Set();
  const out = [];
  const add = (s) => {
    if (!s) return;
    const n = norm(s);
    if (!n || seen.has(n)) return;
    // Two-letter codes are dropped so half-typed names are not snatched
    // away mid-word. UK and US are the two deliberate exceptions.
    if (n.length <= 2 && n !== "uk" && n !== "us") return;
    seen.add(n);
    out.push(n);
  };
  const src = byNum.get(num);
  if (src) {
    // Deliberately not translations: world-countries carries a translation
    // into every language, which both explodes the set and collides
    // (Hungarian for Tajikistan is filed under Tanzania, among others).
    add(src.name.common);
    add(src.name.official);
    (src.altSpellings || []).forEach(add);
  } else {
    add(display);
  }
  (curated.aliases[num] ? curated.aliases[num].add : []).forEach(add);
  return out;
}

/* ---------- assemble ---------- */
const countries = [];
const detail = {};
const problems = [];

for (const num of [...answers].sort((a, b) => a - b)) {
  const src = byNum.get(num);
  const pop = curated.population[num];
  const un = curated.un[num];
  if (!pop) problems.push(`no population row for ${num}`);
  if (!un) problems.push(`no UN row for ${num}`);

  const display = (pop && pop.n) || (src && src.name.common) || num;
  const rec = {
    i: num,
    n: display,
    r: (src && src.region) || "",
    a: spellings(num, display),
  };

  const big = i110.out.get(num);
  const small = i10.out.get(num);

  if (big) {
    rec.d = path110(big);
    rec.f = (curated.frames[num] && curated.frames[num].f) || frame(big);
  } else if (small && frame(small)[2] >= NO_SHAPE) {
    rec.p = dot(num);
    rec.f = (curated.frames[num] && curated.frames[num].f) || frame(small);
    detail[num] = path10(small);
  } else if (dot(num)) {
    // Vatican City is about 0.01 map units across. There is no shape worth
    // showing at any zoom, so it keeps its dot and carries no hd geometry.
    rec.p = dot(num);
    rec.f = [rec.p[0], rec.p[1], 1];
  } else {
    problems.push(`no geometry at all for ${num} (${display})`);
    continue;
  }

  if (pop) { rec.pop = pop.pop; rec.py = pop.year; }
  if (un && un.admitted) rec.u = un.admitted;
  else if (un && un.note) rec.un = un.note;
  if (curated.bonus.has(num)) rec.b = 1;

  countries.push(rec);
}

/* Territories: drawn in a darker tone, not answerable, merged into one path. */
const territories = [];
for (const f of [...i110.out.values(), ...i110.loose]) {
  if (answers.has(id(f))) continue;
  const d = path110(f);
  if (d) territories.push(d);
}

/* ---------- the check that makes the spellings safe ---------- */
const owner = new Map();
for (const c of countries) {
  for (const a of c.a) {
    if (owner.has(a) && owner.get(a) !== c.i) {
      problems.push(`spelling "${a}" is claimed by both ${owner.get(a)} and ${c.i} (${c.n})`);
    }
    owner.set(a, c.i);
  }
}

if (problems.length) {
  console.error("build failed:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

const mapdata = { viewBox: `0 0 ${VIEW[0]} ${VIEW[1]}`, territories, countries };

/* ---------- output ---------- */
if (process.argv.includes("--check")) {
  const cur = read(path.join(ROOT, "vendor", "current-mapdata.json"));
  const curBy = new Map(cur.countries.map((c) => [c.i, c]));
  let same = 0, drift = [];
  for (const c of countries) {
    const o = curBy.get(c.i);
    if (!o) { drift.push(`${c.i} ${c.n}: new`); continue; }
    const bits = [];
    if (o.n !== c.n) bits.push(`name ${o.n} -> ${c.n}`);
    if (o.r !== c.r) bits.push(`region ${o.r} -> ${c.r}`);
    if ((o.d || "") !== (c.d || "")) bits.push("d differs");
    if (JSON.stringify(o.p) !== JSON.stringify(c.p)) bits.push(`p ${JSON.stringify(o.p)} -> ${JSON.stringify(c.p)}`);
    if (JSON.stringify(o.f) !== JSON.stringify(c.f)) bits.push(`f ${JSON.stringify(o.f)} -> ${JSON.stringify(c.f)}`);
    const oa = new Set(o.a), na = new Set(c.a);
    const lost = [...oa].filter((x) => !na.has(x));
    if (lost.length) bits.push(`lost spellings: ${lost.join(", ")}`);
    if (bits.length) drift.push(`${c.i} ${c.n}: ${bits.join(" | ")}`); else same++;
  }
  const missing = cur.countries.filter((c) => !countries.some((x) => x.i === c.i));
  console.log(`answers: ${countries.length} (${members} UN members, ${scoring} scoring)`);
  console.log(`identical: ${same}/${cur.countries.length}`);
  console.log(`territories: ${territories.length} (was ${cur.territories.length})`);
  console.log(`detail outlines: ${Object.keys(detail).length}`);
  if (missing.length) console.log(`dropped: ${missing.map((c) => c.n).join(", ")}`);
  if (drift.length) {
    console.log(`\ndrift (${drift.length}):`);
    for (const d of drift.slice(0, 40)) console.log("  " + d);
    if (drift.length > 40) console.log(`  ...and ${drift.length - 40} more`);
  }
  process.exit(0);
}

const banner = (name) =>
  `/* GENERATED by build/generate.js - do not edit.\n   Run: node build/generate.js\n   ${name} */\n`;

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "data", "countries.js"),
  banner("195 answers plus Taiwan, with 110m outlines and dot positions.") +
    "window.MAPDATA = " + JSON.stringify(mapdata) + ";\n"
);
fs.writeFileSync(
  path.join(ROOT, "data", "detail.js"),
  banner("10m outlines for the countries too small to draw at base resolution.") +
    "window.MAPDETAIL = " + JSON.stringify(detail) + ";\n"
);

const kb = (p) => (fs.statSync(path.join(ROOT, "data", p)).size / 1024).toFixed(1) + "KB";
console.log(`countries: ${countries.length} (${members} UN members, ${scoring} scoring, ${curated.bonus.size} bonus)`);
console.log(`territories: ${territories.length}`);
console.log(`spellings: ${owner.size}, all unambiguous`);
console.log(`data/countries.js ${kb("countries.js")}`);
console.log(`data/detail.js    ${kb("detail.js")}`);
