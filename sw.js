"use strict";

/* ================================================================
   Service worker — makes the app installable and playable offline
   after the first visit.

   Strategy: cache-first for the app shell (markup, styles, scripts,
   the two data files, manifest) with a network fallback so a fresh
   deploy still reaches players who are online; anything not in the
   precache list falls back to network-then-cache. Bump CACHE_NAME
   whenever a shipped file changes so clients pick up the new set
   instead of serving stale assets forever.
   ================================================================ */
var CACHE_NAME = "name-every-country-v1";
var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./game.js",
  "./viewport.js",
  "./geometry.js",
  "./app.js",
  "./countries.json",
  "./territories.json",
  "./site.webmanifest"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        /* Only same-origin, successful responses are worth caching —
           this keeps the font CDN requests (opaque, cross-origin) out
           of the cache instead of storing responses we can't validate. */
        if(res && res.ok && new URL(req.url).origin === self.location.origin){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){
        /* Offline and not cached: for a navigation, fall back to the
           shell page rather than a hard network error. */
        if(req.mode === "navigate") return caches.match("./index.html");
        return cached;
      });
      return cached || network;
    })
  );
});
