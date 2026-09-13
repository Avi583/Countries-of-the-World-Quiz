(function(){
"use strict";
var SVGNS = "http://www.w3.org/2000/svg";
var DETAIL_AT = 4;      /* map units of on-screen span before a dot becomes a shape */
var DOT_R = 3.4;

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

/* ================================================================
   DOM: draw the map
   ================================================================ */
var svg = document.createElementNS(SVGNS,"svg");
svg.setAttribute("viewBox", DATA.viewBox);
svg.setAttribute("role","img");
svg.setAttribute("aria-label","World map. Countries you have named are filled in light grey.");
var world = document.createElementNS(SVGNS,"g");
svg.appendChild(world);

var OWNER_ABBR = {"840":"U.S.", "826":"U.K."};
var countryNameById = {};
DATA.countries.forEach(function(c){ countryNameById[c.i] = c.n; });
/* Maps a sovereign's country id to the list of its territory nodes,
   so markFound() can light them up alongside the country itself. */
var territoriesByOwner = {};
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
  world.appendChild(el);
});

/* Static lookup tables built once from `DATA`: which SVG node belongs
   to which country, and how to resolve typed text and ids back to a
   country record. These don't change shape during play (only the
   nodes' classes do), so they're kept separate from the game/viewport
   state above. */
var lookup = { el:{}, byAlias:{}, byId:{}, small:[] };
var core = 0;
DATA.countries.forEach(function(c){
  var node;
  if(c.d){
    node = document.createElementNS(SVGNS,"path");
    node.setAttribute("class","c");
    node.setAttribute("d", c.d);
  } else {
    node = document.createElementNS(SVGNS,"g");
    node.setAttribute("class","sm");
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
      lookup.small.push({node:node, dot:dot, span:c.f[2]});
    } else {
      lookup.small.push({node:node, dot:dot, span:0});    /* Vatican City stays a dot */
    }
  }
  node.dataset.name = c.n;
  node.dataset.id = c.i;
  world.appendChild(node);
  lookup.el[c.i] = node;
  lookup.byId[c.i] = c;
  if(!c.b) core++;
  c.a.forEach(function(a){ lookup.byAlias[a] = c; });
});
document.getElementById("mapbox").appendChild(svg);

/* ---------- region tallies ---------- */
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
var game = Game.create(core);
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
var BEST_KEY = "nec-best-time";
function getBest(){
  try {
    var v = localStorage.getItem(BEST_KEY);
    return v ? parseInt(v, 10) : null;
  } catch(e){ return null; }
}
function setBest(seconds){
  try { localStorage.setItem(BEST_KEY, String(seconds)); } catch(e){ /* storage unavailable */ }
}
function fmtTime(seconds){ return two(Math.floor(seconds/60)) + ":" + two(seconds%60); }
/* Always reads localStorage fresh, so this stays correct across
   Start over (which never touches BEST_KEY) and across reloads. */
function renderBest(){
  var b = getBest();
  best.textContent = b !== null ? fmtTime(b) : "—";
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
  var guessResult = Game.guess(game, lookup.byAlias, input.value);
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
  if(win){
    var elapsed = Math.floor((Date.now()-game.t0)/1000);
    var prevBest = getBest();
    var isNewBest = prevBest === null || elapsed < prevBest;
    if(isNewBest) setBest(elapsed);
    renderBest();
    rbest.textContent = "Personal best: " + fmtTime(isNewBest ? elapsed : prevBest) + (isNewBest ? " — new best!" : "");
    rbest.classList.remove("hidden");
  } else {
    var existingBest = getBest();
    if(existingBest !== null){
      rbest.textContent = "Personal best: " + fmtTime(existingBest);
      rbest.classList.remove("hidden");
    } else {
      rbest.textContent = "";
      rbest.classList.add("hidden");
    }
  }
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
  var missed = Game.giveUp(game, DATA.countries);
  if(missed) finish(false, missed);
});
document.getElementById("restart").addEventListener("click", function(){
  Game.reset(game);
  clearInterval(ticker); clock.textContent = "00:00";
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
});

/* ---------- pan and zoom ---------- */
var viewport = createViewport(DATA.viewBox.split(" ").map(Number));
function mq(q){ return !!(window.matchMedia && window.matchMedia(q).matches); }
var reduced = mq("(prefers-reduced-motion: reduce)");

function applyViewport(){
  world.setAttribute("transform","translate("+viewport.tx+","+viewport.ty+") scale("+viewport.k+")");
  var r = DOT_R / viewport.k;
  for(var i=0;i<lookup.small.length;i++){
    var s = lookup.small[i];
    s.dot.setAttribute("r", r);
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
document.getElementById("zreset").addEventListener("click", function(){
  if(anim) cancelAnimationFrame(anim);
  viewport.k = 1; viewport.tx = 0; viewport.ty = 0;
  applyViewport();
});

/* ---------- go ---------- */
score.textContent = "0 / " + core;
document.querySelector(".blurb").textContent = core + " of them. Type a name and it surfaces out of the water.";
renderBest();
paintRegions();
applyViewport();
input.focus();

} /* end init */
})();
