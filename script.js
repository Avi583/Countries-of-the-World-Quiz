(function(){
"use strict";
var DATA = JSON.parse(document.getElementById("mapdata").textContent);
var SVGNS = "http://www.w3.org/2000/svg";
var MAXK = 96;          /* deep enough for Monaco and Nauru to show their outlines */
var DETAIL_AT = 4;      /* map units of on-screen span before a dot becomes a shape */
var DOT_R = 3.4;

/* ================================================================
   Normalisation — the same rule the dataset's spellings were built with.
   ================================================================ */
function norm(s){
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/[^a-z0-9 ]/g," ")
    .replace(/\bst\b/g,"saint").replace(/\s+/g," ").trim()
    .replace(/^the /,"");
}

/* ================================================================
   GAME — pure logic, no DOM. Every function here takes a plain state
   object and returns a description of what happened; nothing in this
   block reads or writes the page. Rendering that reaction is the
   caller's job (see "DOM effects" further down).
   ================================================================ */
var Game = {
  create: function(core){
    return { found:{}, got:0, bonus:0, over:false, started:false, t0:0, core:core };
  },
  reset: function(state){
    state.found = {};
    state.got = 0;
    state.bonus = 0;
    state.over = false;
    state.started = false;
    state.t0 = 0;
  },
  /* Marks the clock as running. Returns true the first time this is
     called for a game, so the caller knows to start a ticker. */
  start: function(state){
    if(state.started) return false;
    state.started = true;
    state.t0 = Date.now();
    return true;
  },
  /* Evaluates one guess against the alias table and updates `state`.
     Returns one of:
       {type:"ignored"}                 game already over
       {type:"unmatched"}               no country matches the text
       {type:"duplicate", country}      already named
       {type:"accepted", country, won}  a fresh core-country match
       {type:"bonus", country}          Taiwan */
  guess: function(state, byAlias, rawValue){
    if(state.over) return {type:"ignored"};
    var c = byAlias[norm(rawValue)];
    if(!c) return {type:"unmatched"};
    if(state.found[c.i]) return {type:"duplicate", country:c};
    state.found[c.i] = true;
    if(c.b){
      state.bonus++;
      return {type:"bonus", country:c};
    }
    state.got++;
    var won = state.got === state.core;
    if(won) state.over = true;
    return {type:"accepted", country:c, won:won};
  },
  /* Ends the game early. Returns the list of missed core countries,
     or null if the game was already over. */
  giveUp: function(state, countries){
    if(state.over) return null;
    state.over = true;
    return countries.filter(function(c){ return !c.b && !state.found[c.i]; });
  }
};

/* ================================================================
   VIEWPORT — pan/zoom as plain numbers plus pure math. Nothing here
   touches the DOM; applyViewport() (below, in the DOM section) is what
   turns these numbers into an on-screen transform.
   ================================================================ */
function createViewport(viewBox){
  return { k:1, tx:0, ty:0, vb:viewBox };
}
function clampViewport(v){
  var w = v.vb[2], h = v.vb[3];
  v.tx = Math.min(0, Math.max(w - w*v.k, v.tx));
  v.ty = Math.min(0, Math.max(h - h*v.k, v.ty));
}
/* Zooms around a map-space point. Returns false (and leaves v alone)
   if already at a zoom limit, so callers know whether to re-render. */
function zoomViewportAt(v, px, py, factor, maxK){
  var nk = Math.min(maxK, Math.max(1, v.k*factor));
  if(nk === v.k) return false;
  v.tx = px - (px - v.tx) * (nk/v.k);
  v.ty = py - (py - v.ty) * (nk/v.k);
  v.k = nk;
  clampViewport(v);
  return true;
}
/* Computes the {k,tx,ty} a viewport would need to frame a country's
   `f` entry ([x, y, span]), without mutating the viewport. */
function frameForCountry(v, f){
  var nk = Math.max(1, Math.min(MAXK, 0.5 * v.vb[2] / f[2]));
  var nx = v.vb[2]/2 - f[0]*nk, ny = v.vb[3]/2 - f[1]*nk;
  nx = Math.min(0, Math.max(v.vb[2] - v.vb[2]*nk, nx));
  ny = Math.min(0, Math.max(v.vb[3] - v.vb[3]*nk, ny));
  return {k:nk, tx:nx, ty:ny};
}

/* ================================================================
   DOM: draw the map
   ================================================================ */
var svg = document.createElementNS(SVGNS,"svg");
svg.setAttribute("viewBox", DATA.viewBox);
svg.setAttribute("role","img");
svg.setAttribute("aria-label","World map. Countries you have named are filled in light grey.");
var world = document.createElementNS(SVGNS,"g");
svg.appendChild(world);

if(DATA.territories.length){
  var t = document.createElementNS(SVGNS,"path");
  t.setAttribute("class","terr");
  t.setAttribute("d", DATA.territories.join(" "));
  world.appendChild(t);
}

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
    result = document.getElementById("result");

function two(n){ return (n<10?"0":"") + n; }
function tick(){
  var s = Math.floor((Date.now()-game.t0)/1000);
  clock.textContent = two(Math.floor(s/60)) + ":" + two(s%60);
}
function say(text, kind){ msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }

/* ---------- DOM effects for a single country ---------- */
function markFound(id){
  var node = lookup.el[id];
  node.classList.add("found");
  node.classList.remove("pulse"); void node.getBoundingClientRect(); node.classList.add("pulse");
}
function markMissed(id){
  lookup.el[id].classList.add("missed");
}

/* Renders the effect of a Game.guess() result. This is the only place
   that turns a guess outcome into screen updates. */
function applyGuessResult(result){
  var c = result.country;
  markFound(c.i);
  if(result.type === "bonus"){
    say(c.n + " — bonus, not one of the 195.", "good");
  } else {
    regions[c.r].got++;
    score.textContent = game.got + " / " + core;
    paintRegions();
    say(c.n, "good");
  }
  if(selectedId === c.i) showCard(c);
  if(result.won) finish(true, []);
}

function check(commit){
  var result = Game.guess(game, lookup.byAlias, input.value);
  if(result.type === "ignored" || result.type === "unmatched") return false;
  if(result.type === "duplicate"){
    /* leave the text alone so it can be edited into another name; Enter clears it */
    if(commit) input.value = "";
    say(result.country.n + " is already on the map.", null);
    return true;
  }
  input.value = "";
  applyGuessResult(result);
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
document.addEventListener("keydown", function(e){ if(e.key === "Escape") clearCard(); });

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

svg.addEventListener("pointerdown", function(e){
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
paintRegions();
applyViewport();
input.focus();
})();
