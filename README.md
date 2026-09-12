# Name every country

A map quiz. Type country names into the box; each one you get right fills in on the world map and greys out. 195 sovereign states, plus Taiwan as a bonus.

`index.html` is the whole thing. No build step, no server, no libraries, no data files to fetch — the map geometry and every accepted spelling are inlined in the page. Open it by double-clicking it, or put it online in about two minutes.

## Put it on GitHub Pages

1. On GitHub, click **New repository**. Name it whatever you like (e.g. `name-every-country`), set it to **Public**, and create it.
2. On the new repo's page, click **uploading an existing file**, drag in `index.html` and `README.md`, and click **Commit changes**.
3. Go to **Settings → Pages** in that repo.
4. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then set the branch to **main** and the folder to **/ (root)**. Click **Save**.
5. Wait a minute, then reload that Settings → Pages screen. Your link appears at the top:
   `https://YOUR-USERNAME.github.io/name-every-country/`

The file must be named `index.html` and sit at the root of the repo, or Pages will show a 404. Every later push to `main` republishes automatically, usually within a minute.

If you prefer the command line:

```bash
git init
git add index.html README.md
git commit -m "Name every country"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/name-every-country.git
git push -u origin main
```

Then do steps 3–5 above.

## How to play

- Type. Correct answers are accepted the moment you finish typing them — no need to press Enter, though Enter tells you when something isn't recognised.
- The clock starts on your first keystroke.
- Scroll or pinch to zoom the map, drag to pan, **Reset** to return to the whole world.
- **Give up** reveals everything you missed in red, on the map and as a list underneath.
- Hover a filled-in country to see its name.

## What counts as a country

195 answers: the 193 UN member states plus Vatican City and Palestine. Taiwan is accepted and fills in, but it sits outside the 195 and doesn't affect your score.

Territories and disputed areas — Greenland, Western Sahara, Kosovo, Northern Cyprus, Somaliland, Puerto Rico, New Caledonia, the Falklands, the French Southern Territories and Antarctica — are drawn in a darker tone and can't be answered.

29 countries are too small to see at this map resolution (Singapore, Malta, Nauru, Tuvalu, Vatican City and others). They're drawn as dots at their real coordinates and play exactly like the rest.

## Spellings

Around 2,400 spellings are accepted. Accents, punctuation and capitals are ignored, so `cote divoire` works as well as `Côte d'Ivoire`. Common alternatives are in: `USA`, `America`, `UK`, `Britain`, `Holland`, `Burma`, `Zaire`, `DRC`, `Swaziland`, `Czech Republic`, `East Timor`, `Cape Verde`, `Macedonia`, `Persia`, `St Kitts`, `UAE`, `Turkey` for Türkiye, and so on.

`Congo` alone resolves to the Republic of the Congo; the other one needs `DR Congo`, `DRC`, `Zaire` or `Congo-Kinshasa`. No accepted spelling is ambiguous between two countries — that's checked at build time.

To add a spelling, find the country in the `mapdata` JSON block near the bottom of `index.html` and add your string to its `"a"` array, lowercase and without punctuation.

## Credits

Borders: [Natural Earth](https://www.naturalearthdata.com/) 110m, via [world-atlas](https://github.com/topojson/world-atlas), projected to Natural Earth I. Names, regions and alternate spellings: [world-countries](https://github.com/mledoze/countries). Both are public domain / ODbL-friendly; check their licences if you redistribute.
