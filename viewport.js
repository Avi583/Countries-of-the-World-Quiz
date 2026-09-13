"use strict";

var MAXK = 96; /* deep enough for Monaco and Nauru to show their outlines */

/* ================================================================
   VIEWPORT — pan/zoom as plain numbers plus pure math. Nothing here
   touches the DOM; applyViewport() (in app.js) is what turns these
   numbers into an on-screen transform.
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
