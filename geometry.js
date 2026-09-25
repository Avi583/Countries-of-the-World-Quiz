"use strict";

/* ================================================================
   GEOMETRY — pure math, no DOM access. Extracted from app.js so the
   halo-fitting math for small/multi-island countries follows the same
   pure-logic-separate-from-rendering pattern as game.js and
   viewport.js. app.js's haloEllipseEl() is what turns the {cx,cy,rx,
   ry} these functions return into an actual SVG element.
   ================================================================ */

/* Every small-country "hd" outline in this dataset is built from plain
   M/L/Z commands (no curves), so every coordinate pair in the string
   can just be read off with a regex — no path parsing needed. */
function ptsFromPath(d){
  var nums = d.match(/-?\d+(?:\.\d+)?/g);
  var pts = [];
  for(var i=0; i<nums.length; i+=2) pts.push([+nums[i], +nums[i+1]]);
  return pts;
}
function boundsOf(pts){
  var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(var i=0; i<pts.length; i++){
    var x=pts[i][0], y=pts[i][1];
    if(x<minX) minX=x; if(x>maxX) maxX=x;
    if(y<minY) minY=y; if(y>maxY) maxY=y;
  }
  return {minX:minX, maxX:maxX, minY:minY, maxY:maxY};
}
/* ----------------------------------------------------------------
   Halo shape: the ring around a small country's islands is meant to
   read as "roughly this nation's outline", the way a reference map
   draws a boundary around a scattered island group — not a generic
   oval. So instead of fitting an ellipse to a bounding box, take the
   actual convex hull of that cluster's coastline points and puff it
   outward a bit. A real, if simplified, silhouette survives; an
   ellipse would have thrown that shape information away.
   ---------------------------------------------------------------- */

/* Standard monotone-chain convex hull. Input need not be sorted.
   Returns hull vertices in CCW order; may return 1 or 2 points for a
   degenerate (single-point or collinear) input — inflateHull below
   handles those cases explicitly. */
function convexHull(points){
  var pts = points.slice().sort(function(a,b){ return a[0]-b[0] || a[1]-b[1]; });
  if(pts.length <= 2) return pts;
  function cross(o,a,b){ return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
  var lower = [];
  for(var i=0;i<pts.length;i++){
    while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],pts[i])<=0) lower.pop();
    lower.push(pts[i]);
  }
  var upper = [];
  for(var j=pts.length-1;j>=0;j--){
    while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],pts[j])<=0) upper.pop();
    upper.push(pts[j]);
  }
  lower.pop(); upper.pop();
  var hull = lower.concat(upper);
  return hull.length >= 3 ? hull : pts;
}

/* Pushes each hull vertex outward from the cluster's centroid by
   `pad`, with the result never closer to the centroid than
   `minRadius` — the same floor idea as before (so a single tiny
   atoll or a near-straight line of them still gets a clearly visible
   ring), just expressed on a polygon instead of an ellipse's axes. */
function inflateHull(hull, pad, minRadius){
  if(hull.length === 0) return [];
  if(hull.length === 1){
    var p0 = hull[0], oct = [];
    for(var k=0;k<8;k++){
      var ang = k/8*2*Math.PI;
      oct.push([p0[0]+Math.cos(ang)*minRadius, p0[1]+Math.sin(ang)*minRadius]);
    }
    return oct;
  }
  if(hull.length === 2){
    /* A pair of points (or a hull that collapsed to one, from a
       near-straight line of islands) becomes a "stadium": a rectangle
       capped by the pad/minRadius offset, so it reads as an elongated
       ring following that line rather than a circle or a sliver. */
    var a = hull[0], b = hull[1];
    var dx = b[0]-a[0], dy = b[1]-a[1];
    var len = Math.hypot(dx,dy) || 1;
    var ux = dx/len, uy = dy/len, nx = -uy, ny = ux;
    var r = Math.max(pad, minRadius);
    return [
      [a[0]-ux*r+nx*r, a[1]-uy*r+ny*r],
      [b[0]+ux*r+nx*r, b[1]+uy*r+ny*r],
      [b[0]+ux*r-nx*r, b[1]+uy*r-ny*r],
      [a[0]-ux*r-nx*r, a[1]-uy*r-ny*r]
    ];
  }
  var cx=0, cy=0;
  hull.forEach(function(p){ cx+=p[0]; cy+=p[1]; });
  cx/=hull.length; cy/=hull.length;
  return hull.map(function(p){
    var vx=p[0]-cx, vy=p[1]-cy, d=Math.hypot(vx,vy);
    var ux = d>1e-6 ? vx/d : 1, uy = d>1e-6 ? vy/d : 0;
    var nd = Math.max(d+pad, minRadius);
    return [cx+ux*nd, cy+uy*nd];
  });
}
