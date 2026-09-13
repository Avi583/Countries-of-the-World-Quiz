(function(){
"use strict";
var DATA = JSON.parse(document.getElementById("mapdata").textContent);
var SVGNS = "http://www.w3.org/2000/svg";
var MAXK = 96;          /* deep enough for Monaco and Nauru to show their outlines */
var DETAIL_AT = 4;      /* map units of on-screen span before a dot becomes a shape */
var DOT_R = 3.4;

/* ---------- normalise input the same way the dataset was built ---------- */
function norm(s){
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/[^a-z0-9 ]/g," ")
    .replace(/\bst\b/g,"saint").replace(/\s+/g," ").trim()
    .replace(/^the /,"");
}

/* ---------- draw the map ---------- */
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

var el = {}, byAlias = {}, byId = {}, small = [], core = 0;
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
      small.push({node:node, dot:dot, span:c.f[2]});
    } else {
      small.push({node:node, dot:dot, span:0});          /* Vatican City stays a dot */
    }
  }
  node.dataset.name = c.n;
  node.dataset.id = c.i;
  world.appendChild(node);
  el[c.i] = node;
  byId[c.i] = c;
  if(!c.b) core++;
  c.a.forEach(function(a){ byAlias[a] = c; });
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

/* ---------- game state ---------- */
var found = {}, got = 0, bonus = 0, over = false, started = false, t0 = 0, ticker = null;
var input = document.getElementById("guess"), msg = document.getElementById("msg"),
    score = document.getElementById("score"), clock = document.getElementById("clock"),
    result = document.getElementById("result");

function two(n){ return (n<10?"0":"") + n; }
function tick(){
  var s = Math.floor((Date.now()-t0)/1000);
  clock.textContent = two(Math.floor(s/60)) + ":" + two(s%60);
}
function say(text, kind){ msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }

function accept(c){
  found[c.i] = true;
  var node = el[c.i];
  node.classList.add("found");
  node.classList.remove("pulse"); void node.getBoundingClientRect(); node.classList.add("pulse");
  if(c.b){ bonus++; say(c.n + " — bonus, not one of the 195.", "good"); }
  else{
    got++; regions[c.r].got++;
    score.textContent = got + " / " + core;
    paintRegions();
    say(c.n, "good");
  }
  if(selected === c.i) showCard(c);
  if(got === core) finish(true);
}

function check(commit){
  if(over) return;
  var c = byAlias[norm(input.value)];
  if(!c) return false;
  if(found[c.i]){
    /* leave the text alone so it can be edited into another name; Enter clears it */
    if(commit) input.value = "";
    say(c.n + " is already on the map.", null);
    return true;
  }
  input.value = "";
  accept(c);
  return true;
}

input.addEventListener("input", function(){
  if(over) return;
  if(!started && input.value.trim()){
    started = true; t0 = Date.now(); tick(); ticker = setInterval(tick, 250);
  }
  check();
});
input.addEventListener("keydown", function(e){
  if(e.key !== "Enter" || over) return;
  var raw = input.value.trim();
  if(!raw) return;
  if(!check(true)){
    say('No country matches "' + raw + '".', "bad");
    input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
  }
});

function finish(win){
  over = true;
  clearInterval(ticker);
  input.disabled = true;
  var missed = DATA.countries.filter(function(c){ return !c.b && !found[c.i]; });
  missed.forEach(function(c){ el[c.i].classList.add("missed"); });
  document.getElementById("rtitle").textContent =
    win ? "Every country on Earth, named." : got + " of " + core + " named in " + clock.textContent;
  document.getElementById("rsub").textContent =
    win ? "Finished in " + clock.textContent + (bonus ? ", plus the bonus." : ".")
        : missed.length + " still missing, shown in red on the map.";
  var list = document.getElementById("misslist");
  list.innerHTML = "";
  missed.forEach(function(c){
    var d = document.createElement("div"); d.textContent = c.n; list.appendChild(d);
  });
  result.classList.remove("hidden");
  say(win ? "That is all of them." : "Map revealed.", win ? "good" : null);
  if(selected) showCard(byId[selected]);
  if(result.scrollIntoView) result.scrollIntoView({behavior:"smooth", block:"nearest"});
}

document.getElementById("giveup").addEventListener("click", function(){ if(!over) finish(false); });
document.getElementById("restart").addEventListener("click", function(){
  found = {}; got = 0; bonus = 0; over = false; started = false;
  clearInterval(ticker); clock.textContent = "00:00";
  score.textContent = "0 / " + core;
  DATA.countries.forEach(function(c){ el[c.i].classList.remove("found","missed","pulse"); });
  order.forEach(function(r){ regions[r].got = 0; });
  paintRegions();
  clearCard();
  result.classList.add("hidden");
  input.disabled = false; input.value = ""; input.focus();
  say("");
});

/* ---------- pan and zoom ---------- */
var k = 1, tx = 0, ty = 0, vb = DATA.viewBox.split(" ").map(Number);
function mq(q){ return !!(window.matchMedia && window.matchMedia(q).matches); }
var reduced = mq("(prefers-reduced-motion: reduce)");

function apply(){
  world.setAttribute("transform","translate("+tx+","+ty+") scale("+k+")");
  var r = DOT_R / k;
  for(var i=0;i<small.length;i++){
    var s = small[i];
    s.dot.setAttribute("r", r);
    var wantDetail = s.span * k >= DETAIL_AT;
    if(wantDetail !== s.shown){ s.node.classList.toggle("detail", wantDetail); s.shown = wantDetail; }
  }
}
function clamp(){
  var w = vb[2], h = vb[3];
  tx = Math.min(0, Math.max(w - w*k, tx));
  ty = Math.min(0, Math.max(h - h*k, ty));
}
function zoomAt(px, py, factor){
  var nk = Math.min(MAXK, Math.max(1, k*factor));
  if(nk === k) return;
  tx = px - (px - tx) * (nk/k);
  ty = py - (py - ty) * (nk/k);
  k = nk;
  clamp(); apply();
}
function toMap(e){
  var r = svg.getBoundingClientRect();
  return [ (e.clientX - r.left) / r.width * vb[2], (e.clientY - r.top) / r.height * vb[3] ];
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
  var k0 = k, x0 = tx, y0 = ty, t0a = performance.now(), dur = reduced ? 0 : 520;
  if(!dur){ k = nk; tx = nx; ty = ny; clamp(); apply(); return; }
  (function step(now){
    var p = Math.min(1, (now - t0a) / dur);
    var e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2;
    k = k0 + (nk - k0) * e;
    tx = x0 + (nx - x0) * e;
    ty = y0 + (ny - y0) * e;
    clamp(); apply();
    if(p < 1) anim = requestAnimationFrame(step);
  })(t0a);
}
function focusCountry(c){
  var f = c.f;
  var nk = Math.max(1, Math.min(MAXK, 0.5 * vb[2] / f[2]));
  var nx = vb[2]/2 - f[0]*nk, ny = vb[3]/2 - f[1]*nk;
  nx = Math.min(0, Math.max(vb[2] - vb[2]*nk, nx));
  ny = Math.min(0, Math.max(vb[3] - vb[3]*nk, ny));
  glideTo(nk, nx, ny);
}

/* ---------- the fact card ---------- */
var card = document.getElementById("card"), selected = null;
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
  if(selected && el[selected]) el[selected].classList.remove("sel");
  selected = null;
  card.classList.add("hidden");
}
function showCard(c){
  if(selected && el[selected] && selected !== c.i) el[selected].classList.remove("sel");
  selected = c.i;
  el[c.i].classList.add("sel");
  card.classList.remove("hidden");

  var known = over || found[c.i];
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
  drag = {x:e.clientX, y:e.clientY, tx:tx, ty:ty, r:svg.getBoundingClientRect()};
  moved = false; downAt = Date.now();
  svg.setPointerCapture(e.pointerId); svg.classList.add("dragging");
});
svg.addEventListener("pointermove", function(e){
  if(drag){
    if(Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) moved = true;
    if(!moved) return;
    tx = drag.tx + (e.clientX - drag.x) / drag.r.width * vb[2];
    ty = drag.ty + (e.clientY - drag.y) / drag.r.height * vb[3];
    clamp(); apply();
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
  var c = byId[n.dataset.id];
  if(!c) return;
  focusCountry(c);
  showCard(c);
  if(!over && mq("(hover: hover)")) input.focus({preventScroll:true});
});
["pointercancel","pointerleave"].forEach(function(ev){
  svg.addEventListener(ev, function(){ drag = null; svg.classList.remove("dragging"); tip.style.opacity = 0; });
});
document.getElementById("zin").addEventListener("click", function(){ zoomAt(vb[2]/2, vb[3]/2, 1.5); });
document.getElementById("zout").addEventListener("click", function(){ zoomAt(vb[2]/2, vb[3]/2, 1/1.5); });
document.getElementById("zreset").addEventListener("click", function(){
  if(anim) cancelAnimationFrame(anim);
  k=1; tx=0; ty=0; apply();
});

/* ---------- go ---------- */
score.textContent = "0 / " + core;
document.querySelector(".blurb").textContent = core + " of them. Type a name and it surfaces out of the water.";
paintRegions();
apply();
input.focus();
})();
