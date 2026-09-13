"use strict";

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
   block reads or writes the page. Rendering that reaction is app.js's
   job (see markFound/applyGuessResult/finish in app.js).
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
