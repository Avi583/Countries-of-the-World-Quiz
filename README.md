# Name every country

A map quiz. Type country names into the box; each one you get right fills in on the world map and greys out. 195 sovereign states, plus Taiwan as a bonus.

`index.html` is the whole thing. No build step, no server, no libraries, no data files to fetch — the map geometry, every accepted spelling, and the population and UN figures are inlined in the page. Open it by double-clicking it, or put it online in about two minutes.

## How to play

- Link Here https://avi583.github.io/Countries-of-the-World-Quiz/
- Type. Correct answers are accepted the moment you finish typing them — no need to press Enter, though Enter tells you when something isn't recognised.
- The clock starts on your first keystroke.
- Scroll or pinch to zoom the map, drag to pan, **Reset** to return to the whole world.
- **Click a country** to centre it and open a card with its region, population and UN admission date. Countries you haven't named yet say so instead of giving the answer away; after **Give up** everything reads out in full. Click the ocean or press Escape to dismiss the card.
- **Give up** reveals everything you missed in red, on the map and as a list underneath.
- Hover a filled-in country to see its name.
- Typing a country you've already named leaves the text in the box, so you can edit it into another name. Enter clears it.

## What counts as a country

195 answers: the 193 UN member states plus Vatican City and Palestine. Taiwan is accepted and fills in, but it sits outside the 195 and doesn't affect your score.

Territories and disputed areas — Greenland, Western Sahara, Kosovo, Northern Cyprus, Somaliland, Puerto Rico, New Caledonia, the Falklands, the French Southern Territories and Antarctica — are drawn in a darker tone and can't be answered or clicked.

## The small countries

29 countries are too small to draw at the map's base resolution. They start as dots at their real coordinates and play exactly like the rest — but zoom in and each one redraws as its actual coastline, taken from Natural Earth's 10m data and projected to land exactly where its dot was.

The swap happens per country, whenever its real footprint grows past a few pixels on screen: around 5× for Singapore, Andorra and Barbados, 15× for San Marino, 22× for Nauru, 25× for Monaco. Zoom goes to 96×, and dots shrink as you zoom so they stay the same size on screen rather than swelling into blobs.

Two caveats. Vatican City is about 0.01 map units across — roughly 400 m where one unit is 40 km — so it keeps its dot at every zoom level; there is no shape to show. And because only these 29 countries carry 10m geometry while their neighbours are drawn at 110m, the borders of an enclaved micro-state won't line up perfectly with the surrounding coastline at extreme zoom.

## Facts on the card

Population figures are Natural Earth's `POP_EST`, mostly 2019 estimates, and the card labels the year rather than passing them off as current. UN admission dates are the official list of 193 member states. The three answers that aren't members read differently: Vatican City is a permanent observer, Palestine a non-member observer state since 2012, and Taiwan held China's seat until 1971.

## Spellings

Around 700 spellings are accepted. Two-letter country codes are not — `fr`, `in`, `cn` and the rest were dropped so that half-typed names don't get snatched away mid-word. `UK` and `US` are the two exceptions. Accents, punctuation and capitals are ignored, so `cote divoire` works as well as `Côte d'Ivoire`. Common alternatives are in: `USA`, `America`, `UK`, `Britain`, `Holland`, `Burma`, `Zaire`, `DRC`, `Swaziland`, `Czech Republic`, `East Timor`, `Cape Verde`, `Macedonia`, `Persia`, `St Kitts`, `UAE`, `Turkey` for Türkiye, and so on.

`Congo` alone resolves to the Republic of the Congo; the other one needs `DR Congo`, `DRC`, `Zaire` or `Congo-Kinshasa`. No accepted spelling is ambiguous between two countries — that's checked at build time.

To add a spelling, find the country in the `mapdata` JSON block near the bottom of `index.html` and add your string to its `"a"` array, lowercase and without punctuation.

## The data block

Each country in `mapdata` carries:

| key | meaning |
|---|---|
| `i` | ISO numeric code |
| `n` | display name |
| `r` | region, for the tallies |
| `a` | accepted spellings |
| `d` | outline at 110m, for countries big enough to draw |
| `p` | dot coordinates, for the 29 small ones |
| `hd` | outline at 10m, shown when you zoom in |
| `f` | `[x, y, span]` — where to centre and how far to zoom when clicked |
| `pop`, `py` | population and the year it estimates |
| `u` | UN admission date, ISO format |
| `un` | note used instead of a date for the three non-members |
| `b` | bonus flag (Taiwan only) |

`f` frames the country's largest landmass rather than its full bounding box, so clicking the United States goes to the lower 48 instead of zooming out to take in Alaska and Hawaii, and Kiribati frames Tarawa rather than a third of the Pacific.

## Credits

Borders: [Natural Earth](https://www.naturalearthdata.com/) 110m and 10m, via [world-atlas](https://github.com/topojson/world-atlas) and [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector), projected to Natural Earth I. Names, regions and alternate spellings: [world-countries](https://github.com/mledoze/countries). Population: Natural Earth `POP_EST`. UN admission dates: the United Nations' official member-state list. All are public domain / ODbL-friendly; check their licences if you redistribute.
