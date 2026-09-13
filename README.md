# Build

Nothing here runs when the site is deployed.

The site is plain static files — `index.html`, `style.css`, `app.js`, `lib/`
and `data/` — served straight off GitHub Pages, and it still opens by
double-clicking `index.html` off disk. The data files load as ordinary
`<script>` tags assigning globals rather than `fetch`ing JSON, which is what
keeps the `file://` case working.

`data/countries.js` and `data/detail.js` are generated, but they are committed
like any other file. Run the generator only when you change something in
`build/curated/`, then commit its output. You do not need Node to work on the
CSS, the markup or the game logic.

    npm install
    npm run build      # regenerate the data files
    npm run check      # diff against vendor/current-mapdata.json

## Where each field comes from

Geometry, names, regions and most spellings are derived from upstream packages:

| source | gives |
|---|---|
| `world-atlas/countries-110m.json` | base outlines (`d`), territories |
| `world-atlas/countries-10m.json`  | detail outlines (`hd`) for the 29 small countries |
| `world-countries` | display names, regions, dot positions (`p`), ~650 spellings |

Four things have no machine-readable upstream and live in `build/curated/`:

- `population.json` — Natural Earth `POP_EST` with the year it estimates
- `un.json` — admission dates, or a note for the three non-members
- `aliases.json` — the 56 hand-added spellings upstream does not supply
- `frames.json` — the 11 island frames no rule reproduces (see below)
- `bonus.json` — accepted but outside the 195 (Taiwan)

## Rules worth knowing

**Projection.** `geoNaturalEarth1().fitSize([1000, 500], {type: "Sphere"})`,
coordinates at one decimal. The 10m outlines use three; two is visually
identical and about 20% smaller if the file size ever matters.

**Bounds.** Measured by projecting each vertex, not via `geoPath.bounds()`,
which runs the shape through spherical clipping and returns the whole sphere
for the tiny or badly-wound rings in the 10m data.

**Frames (`f`).** The full bounding box, except where a country straddles the
antimeridian (Fiji, Kiribati), which frames its largest island instead. Eleven
countries carry an explicit override because no consistent rule reproduces
them — Maldives keeps a chain 11.6x its main island while Mauritius drops
Rodrigues at 8.4x. Set `FRAMING=landmass` to frame the largest landmass
everywhere; that is what the top-level README describes, but it is not what
the shipped data does and it moves about 40 frames.

**Spellings.** Built from `name.common`, `name.official` and `altSpellings`,
plus the curated extras. Deliberately *not* `translations`: it carries every
language and collides badly — the Hungarian for Tajikistan is filed under
Tanzania. Two-letter codes are dropped except `uk` and `us`.

**The ambiguity check.** The build fails if two countries claim the same
normalised spelling. This is only meaningful because the page and the build
fold names through the same `lib/normalise.js`. Keep it that way.

## Known discrepancies with the shipped data

`npm run check` reports 17 countries where `d` differs. All 17 are
formatting-only, with zero coordinate drift: the shipped file writes `670.0`
in one country and `197` in another for values that are both exactly integers,
which no single formatter produces. The generated output is consistent.
