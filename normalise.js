/* The single definition of how a typed name is folded before it is looked up.
   Loaded by index.html as a plain script, and required by build/generate.js.
   Both sides must fold identically: the build checks that no two countries
   share an accepted spelling, and that check is only meaningful if the page
   normalises the same way. Do not duplicate this function anywhere. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Normalise = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // strip combining accents
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9 ]/g, " ")       // punctuation becomes a gap
      .replace(/\bst\b/g, "saint")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^the /, "");
  }

  return { norm: norm };
});
