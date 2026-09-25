(function(){
"use strict";
var SVGNS = "http://www.w3.org/2000/svg";
var DETAIL_AT = 4;      /* map units of on-screen span before a dot becomes a shape */
var DOT_R = 4.5;
var HALO_R = DOT_R * 1.8; /* dotted ring drawn around each small country's dot, so tiny
                              island states (Maldives, etc.) are easier to spot at world
                              zoom; hidden once the real coastline (.hd) takes over */

Promise.all([
  fetch("countries.json").then(function(r){ return r.json(); }),
  fetch("territories.json").then(function(r){ return r.json(); })
]).then(function(results){
  var countriesFile = results[0], territoriesFile = results[1];
  var DATA = {
    viewBox: countriesFile.viewBox,
    countries: countriesFile.countries,
    territories: territoriesFile.territories
  };
  init(DATA);
}).catch(function(err){
  document.getElementById("msg").textContent = "Couldn't load map data.";
  console.error(err);
});

function init(DATA){

/* Every small-country "hd" outline in this dataset is built from plain
   M/L/Z commands (no curves), so its bounding box is just the min/max
   of every coordinate pair in the string — including every separate
   island subpath, which is exactly what an archipelago's halo needs
   to enclose (see Maldives: one country, many M...Z island loops). */
function boundsFromPath(d){
  var nums = d.match(/-?\d+(?:\.\d+)?/g);
  var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(var i=0; i<nums.length; i+=2){
    var x = +nums[i], y = +nums[i+1];
    if(x<minX) minX=x; if(x>maxX) maxX=x;
    if(y<minY) minY=y; if(y>maxY) maxY=y;
  }
  return {minX:minX, maxX:maxX, minY:minY, maxY:maxY};
}

/* ================================================================
   DOM: draw the map
   ================================================================ */
var svg = document.createElementNS(SVGNS,"svg");
svg.setAttribute("viewBox", DATA.viewBox);
svg.setAttribute("role","img");
svg.setAttribute("aria-label","World map. Countries you have named are filled in light grey.");
var defs = document.createElementNS(SVGNS,"defs");
defs.innerHTML =
  '<pattern id="halo-stripes" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line class="halo-stripe-line" x1="0" y1="0" x2="0" y2="4"></line>' +
  '</pattern>';
svg.appendChild(defs);
var world = document.createElementNS(SVGNS,"g");
svg.appendChild(world);

var OWNER_ABBR = {"840":"U.S.", "826":"U.K."};
var countryNameById = {};
DATA.countries.forEach(function(c){ countryNameById[c.i] = c.n; });
/* Maps a sovereign's country id to the list of its territory nodes,
   so markFound() can light them up alongside the country itself. */
var territoriesByOwner = {};
/* Every territory node plus its owner id (or null), so continent
   mode can dim/undim territories along with their owning country. */
var allTerrEls = [];
DATA.territories.forEach(function(t, idx){
  var el = document.createElementNS(SVGNS,"path");
  el.setAttribute("class","terr");
  el.setAttribute("d", t.d);
  if(t.own){
    var ownerName = OWNER_ABBR[t.own] || countryNameById[t.own];
    el.dataset.id = "terr" + idx;
    el.dataset.name = t.n + " (" + ownerName + ")";
    if(!territoriesByOwner[t.own]) territoriesByOwner[t.own] = [];
    territoriesByOwner[t.own].push(el);
  }
  allTerrEls.push({el:el, own:t.own || null});
  world.appendChild(el);
});

/* Static lookup tables built once from `DATA`: which SVG node belongs
   to which country, and how to resolve typed text and ids back to a
   country record. These don't change shape during play (only the
   nodes' classes do), so they're kept separate from the game/viewport
   state above. `activeByAlias` is the one exception — continent mode
   rebuilds it to whichever countries are currently in play. */
var lookup = { el:{}, byId:{}, small:[], activeByAlias:{} };
var regionById = {};
var bigNodes = [], smallNodes = [];
DATA.countries.forEach(function(c){
  var node;
  if(c.d){
    node = document.createElementNS(SVGNS,"path");
    node.setAttribute("class","c");
    node.setAttribute("d", c.d);
    bigNodes.push(node);
  } else {
    node = document.createElementNS(SVGNS,"g");
    node.setAttribute("class","sm");
    var halo = document.createElementNS(SVGNS,"circle");
    halo.setAttribute("class","halo");
    halo.setAttribute("cx", c.p[0]); halo.setAttribute("cy", c.p[1]);
    halo.setAttribute("r", HALO_R);
    node.appendChild(halo);
    var dot = document.createElementNS(SVGNS,"circle");
    dot.setAttribute("class","dot");
    dot.setAttribute("cx", c.p[0]); dot.setAttribute("cy", c.p[1]);
    dot.setAttribute("r", DOT_R);
    node.appendChild(dot);
    if(c.hd){
      var shape = document.createElementNS(SVGNS,"path");
      shape.setAttribute("class","hd");
      shape.setAttribute("d", c.hd);
      node.appendChild(shape);
      /* The world-zoom halo above is a fixed-size ring around the dot —
         good for catching the eye, but too small/round to enclose a
         spread-out archipelago. Once zoomed in past DETAIL_AT (the same
         point the dot swaps for the real coastline), swap to an ellipse
         fit to the hd path's actual bounding box instead, padded a bit
         so every island — Malé, the outer atolls, all of them — sits
         inside the ring. This one is sized in real map units, not
         compensated for zoom, so it scales naturally with the coastline
         it's wrapping. */
      var bb = boundsFromPath(c.hd);
      var padX = (bb.maxX - bb.minX) * 0.12 + 0.35;
      var padY = (bb.maxY - bb.minY) * 0.12 + 0.35;
      var haloDetail = document.createElementNS(SVGNS,"ellipse");
      haloDetail.setAttribute("class","halo-detail");
      haloDetail.setAttribute("cx", (bb.minX + bb.maxX) / 2);
      haloDetail.setAttribute("cy", (bb.minY + bb.maxY) / 2);
      haloDetail.setAttribute("rx", (bb.maxX - bb.minX) / 2 + padX);
      haloDetail.setAttribute("ry", (bb.maxY - bb.minY) / 2 + padY);
      node.appendChild(haloDetail);
      /* Cap the span used for the detail trigger. A few small
         countries (Maldives, Tonga, Cape Verde, ...) are made up of
         islands scattered across a wide bounding box, so their raw
         frame span is large even though no single island is actually
         big on screen — using it uncapped meant they never showed as
         a dot at all, even fully zoomed out. Capping keeps the
         dot->shape swap tied to real on-screen size instead. */
      lookup.small.push({node:node, dot:dot, halo:halo, span:Math.min(c.f[2], 2)});
    } else {
      lookup.small.push({node:node, dot:dot, halo:halo, span:0});    /* Vatican City stays a dot */
    }
    smallNodes.push(node);
  }
  node.dataset.name = c.n;
  node.dataset.id = c.i;
  lookup.el[c.i] = node;
  lookup.byId[c.i] = c;
  regionById[c.i] = c.r;
});
/* Append every full-outline country first, then every dot-based
   micro-state on top. Countries.json is in alphabetical order, so
   without this split a small country whose name sorts before its
   covering neighbour (e.g. "Andorra" before "France"/"Spain") would
   have its dot painted first and then buried under that neighbour's
   110m landmass outline, making it invisible even though its data
   (and its zoomed-in "hd" shape) is perfectly fine. */
bigNodes.forEach(function(node){ world.appendChild(node); });
smallNodes.forEach(function(node){ world.appendChild(node); });
document.getElementById("mapbox").appendChild(svg);

/* ---------- region tallies (world-mode grid; totals are always
   against the full 195, regardless of the active continent) ---------- */
var regions = {}, order = [];
DATA.countries.forEach(function(c){
  if(c.b) return;
  if(!regions[c.r]){ regions[c.r] = {total:0, got:0}; order.push(c.r); }
  regions[c.r].total++;
});
order.sort();
var regBox = document.getElementById("regions");
order.forEach(function(r){
  var d = document.createElement("div"); d.className = "reg";
  d.innerHTML = '<div class="top"><b></b><span></span></div><div class="track"><div class="fill"></div></div>';
  d.querySelector("b").textContent = r;
  regBox.appendChild(d);
  regions[r].node = d;
});
function paintRegions(){
  order.forEach(function(r){
    var g = regions[r];
    g.node.querySelector("span").textContent = g.got + " of " + g.total;
    g.node.querySelector(".fill").style.width = (100*g.got/g.total) + "%";
  });
}

/* ================================================================
   Game state + the timer handle that goes with it. `ticker` is a
   browser interval id, not game data, so it stays outside `game`.
   ================================================================ */
var core = 0;
var game;
var ticker = null;
var input = document.getElementById("guess"), msg = document.getElementById("msg"),
    score = document.getElementById("score"), clock = document.getElementById("clock"),
    result = document.getElementById("result"), best = document.getElementById("best");

function two(n){ return (n<10?"0":"") + n; }
function tick(){
  var s = Math.floor((Date.now()-game.t0)/1000);
  clock.textContent = two(Math.floor(s/60)) + ":" + two(s%60);
}
function say(text, kind){ msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }

/* ---------- personal best (localStorage) ---------- */
/* Keyed per continent, so an Africa-only best doesn't get overwritten
   by (or compared against) a World-mode run. */
function bestKey(){
  return activeRegion === "world" ? "nec-best-score" : "nec-best-score:" + activeRegion;
}
function getBest(){
  try {
    var v = localStorage.getItem(bestKey());
    return v ? parseInt(v, 10) : null;
  } catch(e){ return null; }
}
function setBest(score){
  try { localStorage.setItem(bestKey(), String(score)); } catch(e){ /* storage unavailable */ }
}
/* Always reads localStorage fresh, so this stays correct across
   Start over (which never touches the key) and across reloads. */
function renderBest(){
  var b = getBest();
  best.textContent = b !== null ? b + " / " + core : "—";
}

/* ---------- DOM effects for a single country ---------- */
function markFound(id){
  var node = lookup.el[id];
  node.classList.add("found");
  node.classList.remove("pulse"); void node.getBoundingClientRect(); node.classList.add("pulse");
  var owned = territoriesByOwner[id];
  if(owned) owned.forEach(function(t){
    t.classList.add("found");
    t.classList.remove("pulse"); void t.getBoundingClientRect(); t.classList.add("pulse");
  });
}
function markMissed(id){
  lookup.el[id].classList.add("missed");
}

/* Renders the effect of a Game.guess() result. This is the only place
   that turns a guess outcome into screen updates. */
function applyGuessResult(guessResult){
  var c = guessResult.country;
  markFound(c.i);
  if(guessResult.type === "bonus"){
    say(c.n + " — bonus, not one of the 195.", "good");
  } else {
    regions[c.r].got++;
    score.textContent = game.got + " / " + core;
    paintRegions();
    say(c.n, "good");
  }
  if(selectedId === c.i) showCard(c);
  if(guessResult.won) finish(true, []);
}

function check(commit){
  var guessResult = Game.guess(game, lookup.activeByAlias, input.value);
  if(guessResult.type === "ignored" || guessResult.type === "unmatched") return false;
  if(guessResult.type === "duplicate"){
    /* leave the text alone so it can be edited into another name; Enter clears it */
    if(commit) input.value = "";
    say(guessResult.country.n + " is already on the map.", null);
    return true;
  }
  input.value = "";
  applyGuessResult(guessResult);
  return true;
}

input.addEventListener("input", function(){
  if(game.over) return;
  if(input.value.trim() && Game.start(game)){
    tick(); ticker = setInterval(tick, 250);
  }
  check();
});
input.addEventListener("keydown", function(e){
  if(e.key !== "Enter" || game.over) return;
  var raw = input.value.trim();
  if(!raw) return;
  if(!check(true)){
    say('No country matches "' + raw + '".', "bad");
    input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
  }
});

function finish(win, missed){
  clearInterval(ticker);
  input.disabled = true;
  missed.forEach(function(c){ markMissed(c.i); });
  document.getElementById("rtitle").textContent =
    win ? "Every country on Earth, named." : game.got + " of " + core + " named in " + clock.textContent;
  document.getElementById("rsub").textContent =
    win ? "Finished in " + clock.textContent + (game.bonus ? ", plus the bonus." : ".")
        : missed.length + " still missing, shown in red on the map.";
  var rbest = document.getElementById("rbest");
  var prevBest = getBest();
  var isNewBest = prevBest === null || game.got > prevBest;
  if(isNewBest) setBest(game.got);
  renderBest();
  rbest.textContent = "Best score: " + (isNewBest ? game.got : prevBest) + " / " + core +
    (isNewBest ? " — new best!" : "");
  rbest.classList.remove("hidden");
  var list = document.getElementById("misslist");
  list.innerHTML = "";
  missed.forEach(function(c){
    var d = document.createElement("div"); d.textContent = c.n; list.appendChild(d);
  });
  result.classList.remove("hidden");
  say(win ? "That is all of them." : "Map revealed.", win ? "good" : null);
  if(selectedId) showCard(lookup.byId[selectedId]);
  if(result.scrollIntoView) result.scrollIntoView({behavior:"smooth", block:"nearest"});
}

document.getElementById("giveup").addEventListener("click", function(){
  var missed = Game.giveUp(game, activeCountries);
  if(missed) finish(false, missed);
});
document.getElementById("restart").addEventListener("click", function(){
  newGame();
});
document.getElementById("continent").addEventListener("change", function(e){
  applyRegion(e.target.value);
  newGame();
});

/* ---------- pan and zoom ---------- */
var viewport = createViewport(DATA.viewBox.split(" ").map(Number));
function mq(q){ return !!(window.matchMedia && window.matchMedia(q).matches); }
var reduced = mq("(prefers-reduced-motion: reduce)");

function applyViewport(){
  world.setAttribute("transform","translate("+viewport.tx+","+viewport.ty+") scale("+viewport.k+")");
  var r = DOT_R / viewport.k;
  var hr = HALO_R / viewport.k;
  for(var i=0;i<lookup.small.length;i++){
    var s = lookup.small[i];
    s.dot.setAttribute("r", r);
    s.halo.setAttribute("r", hr);
    var wantDetail = s.span * viewport.k >= DETAIL_AT;
    if(wantDetail !== s.shown){ s.node.classList.toggle("detail", wantDetail); s.shown = wantDetail; }
  }
}
function zoomAt(px, py, factor){
  if(zoomViewportAt(viewport, px, py, factor, MAXK)) applyViewport();
}
function toMap(e){
  var r = svg.getBoundingClientRect();
  return [ (e.clientX - r.left) / r.width * viewport.vb[2], (e.clientY - r.top) / r.height * viewport.vb[3] ];
}
svg.addEventListener("wheel", function(e){
  e.preventDefault();
  var p = toMap(e);
  zoomAt(p[0], p[1], e.deltaY < 0 ? 1.18 : 1/1.18);
}, {passive:false});

/* ---------- glide to a country ---------- */
var anim = null;
function glideTo(nk, nx, ny){
  if(anim) cancelAnimationFrame(anim);
  var k0 = viewport.k, x0 = viewport.tx, y0 = viewport.ty, t0a = performance.now(), dur = reduced ? 0 : 520;
  if(!dur){
    viewport.k = nk; viewport.tx = nx; viewport.ty = ny;
    clampViewport(viewport); applyViewport();
    return;
  }
  (function step(now){
    var p = Math.min(1, (now - t0a) / dur);
    var e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2;
    viewport.k = k0 + (nk - k0) * e;
    viewport.tx = x0 + (nx - x0) * e;
    viewport.ty = y0 + (ny - y0) * e;
    clampViewport(viewport); applyViewport();
    if(p < 1) anim = requestAnimationFrame(step);
  })(t0a);
}
function focusCountry(c){
  var target = frameForCountry(viewport, c.f);
  glideTo(target.k, target.tx, target.ty);
}

/* ---------- the fact card ---------- */
var card = document.getElementById("card"), selectedId = null;
var MONTHS = ["January","February","March","April","May","June","July",
              "August","September","October","November","December"];
function niceDate(iso){
  var p = iso.split("-");
  return (+p[2]) + " " + MONTHS[+p[1]-1] + " " + p[0];
}
function niceNum(n){
  try { return n.toLocaleString("en-US"); } catch(e){ return String(n); }
}
function clearCard(){
  if(selectedId && lookup.el[selectedId]) lookup.el[selectedId].classList.remove("sel");
  selectedId = null;
  card.classList.add("hidden");
}
function showCard(c){
  if(selectedId && lookup.el[selectedId] && selectedId !== c.i) lookup.el[selectedId].classList.remove("sel");
  selectedId = c.i;
  lookup.el[c.i].classList.add("sel");
  card.classList.remove("hidden");

  var known = game.over || game.found[c.i];
  var head = card.querySelector(".cname");
  var body = card.querySelector(".cbody");
  body.innerHTML = "";

  if(!known){
    head.textContent = "Not named yet";
    var p = document.createElement("p");
    p.className = "cnote";
    p.textContent = "Name it and its details will appear here.";
    body.appendChild(p);
    return;
  }

  head.textContent = c.n;
  var rows = [];
  rows.push(["Region", c.r]);
  if(c.pop != null) rows.push(["Population", niceNum(c.pop) + (c.py ? " (" + c.py + " est.)" : "")]);
  if(c.u) rows.push(["UN member since", niceDate(c.u)]);
  rows.forEach(function(r){
    var d = document.createElement("div"); d.className = "crow";
    var s = document.createElement("span"); s.textContent = r[0];
    var b = document.createElement("b"); b.textContent = r[1];
    d.appendChild(s); d.appendChild(b); body.appendChild(d);
  });
  if(c.un){
    var n = document.createElement("p"); n.className = "cnote"; n.textContent = c.un;
    body.appendChild(n);
  }
  if(c.b){
    var bn = document.createElement("p"); bn.className = "cnote";
    bn.textContent = "Bonus answer — outside the 195.";
    body.appendChild(bn);
  }
}
document.getElementById("cardx").addEventListener("click", clearCard);
document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){ clearCard(); return; }
  /* "/" focuses the guess box from anywhere, unless the user is already
     typing somewhere (so a literal "/" in a field still works normally). */
  if(e.key === "/" && document.activeElement !== input &&
     !e.metaKey && !e.ctrlKey && !e.altKey){
    e.preventDefault();
    input.focus();
  }
});

/* ---------- pointer: drag, hover, click ---------- */
var tip = document.getElementById("tip");
var drag = null, moved = false, downAt = 0;

function hit(e){
  var n = e.target;
  while(n && n !== svg){
    if(n.dataset && n.dataset.id) return n;
    n = n.parentNode;
  }
  return null;
}

svg.addEventListener("dragstart", function(e){ e.preventDefault(); });
svg.addEventListener("pointerdown", function(e){
  if(e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
  e.preventDefault();
  drag = {x:e.clientX, y:e.clientY, tx:viewport.tx, ty:viewport.ty, r:svg.getBoundingClientRect()};
  moved = false; downAt = Date.now();
  svg.setPointerCapture(e.pointerId); svg.classList.add("dragging");
});
svg.addEventListener("pointermove", function(e){
  if(drag){
    if(Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) moved = true;
    if(!moved) return;
    viewport.tx = drag.tx + (e.clientX - drag.x) / drag.r.width * viewport.vb[2];
    viewport.ty = drag.ty + (e.clientY - drag.y) / drag.r.height * viewport.vb[3];
    clampViewport(viewport); applyViewport();
    return;
  }
  var n = hit(e);
  var show = n && (n.classList.contains("found") || n.classList.contains("missed"));
  if(show){
    tip.textContent = n.dataset.name;
    var r = svg.getBoundingClientRect();
    tip.style.left = (e.clientX - r.left) + "px";
    tip.style.top = (e.clientY - r.top) + "px";
    tip.style.opacity = 1;
  } else tip.style.opacity = 0;
});
svg.addEventListener("pointerup", function(e){
  var wasDrag = moved || (Date.now() - downAt) > 500;
  drag = null; svg.classList.remove("dragging");
  if(wasDrag) return;
  var n = hit(e);
  if(!n){ clearCard(); return; }
  var c = lookup.byId[n.dataset.id];
  if(!c) return;
  focusCountry(c);
  showCard(c);
  if(!game.over && mq("(hover: hover)")) input.focus({preventScroll:true});
});
["pointercancel","pointerleave"].forEach(function(ev){
  svg.addEventListener(ev, function(){ drag = null; svg.classList.remove("dragging"); tip.style.opacity = 0; });
});
document.getElementById("zin").addEventListener("click", function(){ zoomAt(viewport.vb[2]/2, viewport.vb[3]/2, 1.5); });
document.getElementById("zout").addEventListener("click", function(){ zoomAt(viewport.vb[2]/2, viewport.vb[3]/2, 1/1.5); });
document.getElementById("zreset").addEventListener("click", function(){ resetView(); });

/* ================================================================
   CONTINENT MODE — scopes scoring, guessing, and the initial/reset
   view to one region, or to the whole world. game.js and viewport.js
   are untouched: Game already just takes a count and a filtered
   country list/alias table, and viewport.js's frameForBounds (added
   alongside frameForCountry) does the framing math. Everything here
   just decides *which* countries and *what* box to hand them.
   ================================================================ */
var activeRegion = "world", activeCountries = DATA.countries;

function countriesFor(region){
  return region === "world" ? DATA.countries : DATA.countries.filter(function(c){ return c.r === region; });
}
/* A country's own `f` ([x, y, span]) is tuned to frame just that
   country, but the union of every country's `f` in a region is a
   good enough bounding box to frame the whole continent — no
   separate hand-authored per-continent data needed. */
function regionBounds(countries){
  var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  countries.forEach(function(c){
    if(c.b || !c.f) return;
    var x=c.f[0], y=c.f[1], s=c.f[2];
    minX = Math.min(minX, x-s); maxX = Math.max(maxX, x+s);
    minY = Math.min(minY, y-s); maxY = Math.max(maxY, y+s);
  });
  return {minX:minX, maxX:maxX, minY:minY, maxY:maxY};
}
/* Frames the current activeRegion: the whole world at 1x, or a
   continent's bounding box with a little padding. Shared by continent
   switches and the "Reset" button. */
function resetView(){
  if(anim) cancelAnimationFrame(anim);
  if(activeRegion === "world"){
    viewport.k = 1; viewport.tx = 0; viewport.ty = 0;
  } else {
    var b = regionBounds(activeCountries);
    var target = frameForBounds(viewport, b.minX, b.maxX, b.minY, b.maxY, 1.15);
    viewport.k = target.k; viewport.tx = target.tx; viewport.ty = target.ty;
  }
  clampViewport(viewport); applyViewport();
}
function applyRegion(region){
  activeRegion = region;
  activeCountries = countriesFor(region);
  core = 0;
  lookup.activeByAlias = {};
  activeCountries.forEach(function(c){
    if(!c.b) core++;
    c.a.forEach(function(a){ lookup.activeByAlias[a] = c; });
  });
  DATA.countries.forEach(function(c){
    var inScope = region === "world" || c.r === region;
    lookup.el[c.i].classList.toggle("outscope", !inScope);
  });
  allTerrEls.forEach(function(t){
    var inScope = region === "world" || (t.own && regionById[t.own] === region);
    t.el.classList.toggle("outscope", !inScope);
  });
  document.getElementById("regions").classList.toggle("hidden", region !== "world");
  document.querySelector(".blurb").textContent = region === "world"
    ? core + " of them. Type a name and it surfaces out of the water."
    : core + " in " + region + ". Type a name and it surfaces out of the water.";
  resetView();
}
/* Fully resets play for the current continent: a fresh Game (its
   count may have just changed), cleared map/card/results, timer off. */
function newGame(){
  game = Game.create(core);
  clearInterval(ticker); ticker = null;
  clock.textContent = "00:00";
  score.textContent = "0 / " + core;
  DATA.countries.forEach(function(c){ lookup.el[c.i].classList.remove("found","missed","pulse"); });
  Object.keys(territoriesByOwner).forEach(function(id){
    territoriesByOwner[id].forEach(function(t){ t.classList.remove("found","pulse"); });
  });
  order.forEach(function(r){ regions[r].got = 0; });
  paintRegions();
  clearCard();
  result.classList.add("hidden");
  input.disabled = false; input.value = ""; input.focus();
  say("");
  renderBest();
}

/* ---------- go ---------- */
applyRegion("world");
newGame();

} /* end init */
})();
