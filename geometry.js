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
var SQRT2 = Math.SQRT2;
/* An ellipse that's merely "fit" to a bounding box (same half-width/
   half-height as radii) misses that box's corners — any island out
   near a corner (Seychelles has several) ends up outside the ring.
   Scaling both radii by sqrt(2) is the smallest ellipse, at that
   aspect ratio, guaranteed to still contain every corner. */
function fitEllipse(bb, pad){
  var halfW=(bb.maxX-bb.minX)/2, halfH=(bb.maxY-bb.minY)/2;
  return {
    cx:(bb.minX+bb.maxX)/2, cy:(bb.minY+bb.maxY)/2,
    rx:halfW*SQRT2+pad, ry:halfH*SQRT2+pad
  };
}
/* Same corner-safe math, but pinned flat against a map edge (x=0 or
   x=vbWidth) instead of centred on the cluster — used for a country
   split across the antimeridian, so each half gets a semicircle that
   "breaks" at the edge of the world instead of one huge ellipse
   stretching across the whole map (see Kiribati). */
function fitEdgeEllipse(bb, edgeX, vbWidth, pad){
  var halfH=(bb.maxY-bb.minY)/2;
  var reach = edgeX===0 ? bb.maxX : (vbWidth-bb.minX);
  return {cx:edgeX, cy:(bb.minY+bb.maxY)/2, rx:reach*SQRT2+pad, ry:halfH*SQRT2+pad};
}
