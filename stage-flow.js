/* stage-flow.js v1.74.1 — HUDs + semillas guardadas / aleatorias */
(function () {
  if (!window.consoleUI) return;
  var ui = window.consoleUI;
  var SEED_KEY = "sysSavedSeeds";

  function hideAllStages() {
    ["aegis-home-hud", "seed-hud", "universe-hud", "squad-selection-panel", "simulation-container"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    var top = document.getElementById("top-hud");
    if (top) top.style.display = "none";
    var wh = document.getElementById("world-hud");
    if (wh) wh.style.display = "none";
  }

  ui.resolveSeed = function (raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) s = "OMEGA-99";
    if (/^-?\d+$/.test(s)) {
      var n = parseInt(s, 10);
      if (!isNaN(n)) return { text: s, numeric: n >>> 0 };
    }
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return { text: s, numeric: h >>> 0 };
  };

  ui.loadSavedSeeds = function () {
    try {
      var list = JSON.parse(localStorage.getItem(SEED_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  };

  ui.saveSeedToList = function (text, numeric) {
    var list = this.loadSavedSeeds();
    var entry = { text: String(text), numeric: numeric >>> 0, at: Date.now() };
    list = list.filter(function (x) { return x && x.text !== entry.text; });
    list.unshift(entry);
    list = list.slice(0, 12);
    try { localStorage.setItem(SEED_KEY, JSON.stringify(list)); } catch (e) {}
    this.renderSavedSeeds();
  };

  ui.deleteSavedSeed = function (text) {
    var list = this.loadSavedSeeds().filter(function (x) { return x && x.text !== text; });
    try { localStorage.setItem(SEED_KEY, JSON.stringify(list)); } catch (e) {}
    this.renderSavedSeeds();
  };

  ui.renderSavedSeeds = function () {
    var box = document.getElementById("saved-seeds");
    if (!box) return;
    var list = this.loadSavedSeeds();
    if (!list.length) {
      box.innerHTML = "<p class=\"seed-saved-empty\">Sin semillas guardadas.</p>";
      return;
    }
    var self = this;
    box.innerHTML = list.map(function (x) {
      var t = String(x.text || "");
      var n = (x.numeric != null) ? (x.numeric >>> 0) : "";
      var escT = t.replace(/&/g, "&").replace(/</g, "<").replace(/"/g, """);
      return (
        "<div class=\"seed-chip-row\">" +
          "<button type=\"button\" class=\"seed-chip\" data-seed=\"" + escT + "\">" +
            "<span class=\"seed-chip-text\">" + escT + "</span>" +
            "<span class=\"seed-chip-num\">#" + n + "</span>" +
          "</button>" +
          "<button type=\"button\" class=\"seed-chip-del\" data-del=\"" + escT + "\" aria-label=\"Borrar\">×</button>" +
        "</div>"
      );
    }).join("");
    box.querySelectorAll(".seed-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var inp = document.getElementById("input-seed");
        if (inp) {
          inp.value = btn.getAttribute("data-seed") || "";
          ui.refreshSeedPreview();
        }
      });
    });
    box.querySelectorAll(".seed-chip-del").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        self.deleteSavedSeed(btn.getAttribute("data-del") || "");
      });
    });
  };

  ui.refreshSeedPreview = function () {
    var inp = document.getElementById("input-seed");
    var prev = document.getElementById("seed-hash-preview");
    if (!inp || !prev) return;
    var r = this.resolveSeed(inp.value);
    prev.textContent = "código #" + r.numeric;
  };

  ui.randomSeed = function () {
    var a = (Date.now() & 0xffffffff) >>> 0;
    var b = 0;
    if (window.crypto && crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      b = buf[0] >>> 0;
    } else {
      b = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
    }
    var num = (a ^ Math.imul(b, 0x9e3779b9) ^ ((performance && performance.now) ? (performance.now() * 1000) | 0 : 0)) >>> 0;
    if (num === 0) num = (Date.now() % 2147483647) || 1;
    var text = String(num);
    var inp = document.getElementById("input-seed");
    if (inp) {
      inp.value = text;
      this.refreshSeedPreview();
      inp.focus();
    }
    return text;
  };

  ui.persistCurrentSeed = function () {
    var inp = document.getElementById("input-seed");
    var r = this.resolveSeed(inp ? inp.value : "");
    this.saveSeedToList(r.text, r.numeric);
  };

  ui.openSeedStage = function () {
    hideAllStages();
    var el = document.getElementById("seed-hud");
    if (el) el.style.display = "flex";
    var inp = document.getElementById("input-seed");
    if (inp) {
      if (this.currentSeedText) inp.value = this.currentSeedText;
      else if (!inp.value) this.randomSeed();
      this.refreshSeedPreview();
      this.renderSavedSeeds();
      setTimeout(function () { inp.focus(); }, 50);
    } else {
      this.renderSavedSeeds();
    }
  };

  ui.openUniverseStage = function () {
    if (!this.worldState || !this.worldState.meta) {
      this.openSeedStage();
      return;
    }
    hideAllStages();
    var el = document.getElementById("universe-hud");
    if (el) el.style.display = "flex";
    this.renderUniverseSummary();
  };

  ui.openCharacterStage = function () {
    if (!this.worldState || !this.worldState.meta) {
      this.openSeedStage();
      return;
    }
    hideAllStages();
    var el = document.getElementById("squad-selection-panel");
    if (el) el.style.display = "flex";
    this.renderAgentCards();
  };

  ui.renderUniverseSummary = function () {
    var box = document.getElementById("universe-summary");
    if (!box || !this.worldState) return;
    var meta = this.worldState.meta;
    var u = this.worldState.universe;
    var tipo = Engine.worldTypeOf ? Engine.worldTypeOf(meta) : meta.era;
    var tipoLabel = (Engine.WORLD_TYPE_LABELS && Engine.WORLD_TYPE_LABELS[tipo]) || tipo;
    var epoch = Engine.epochOf ? Engine.epochOf(meta) : (meta.epoch || "AUGE");
    var epochLabel = (Engine.WORLD_EPOCHS && Engine.WORLD_EPOCHS[epoch] && Engine.WORLD_EPOCHS[epoch].label) || epoch;
    var rankLabel = Engine.tierLabel ? Engine.tierLabel(tipo, meta.tierId) : meta.tierId;
    var plot = meta.plot || {};
    var regime = u && u.regime && Engine.REGIMES[u.regime] ? Engine.REGIMES[u.regime].label : "—";
    var traits = (meta.traits || []).map(function (t) {
      return Engine.WORLD_TRAITS[t] ? Engine.WORLD_TRAITS[t].name : t;
    }).filter(Boolean);
    var zones = (u && u.zones) ? u.zones : [];
    var facs = (u && u.factions) ? u.factions.filter(function (f) { return f.alive; }) : [];
    var notables = (u && u.population) ? u.population.filter(function (p) { return p.alive && !p.fromCrowd; }).length : 0;
    var masa = zones.reduce(function (s, z) { return s + (z.crowd ? z.crowd.count : 0); }, 0);

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
      });
    }

    var zoneRows = zones.map(function (z) {
      var ruler = z.rulerFacId ? Engine.facName(u, z.rulerFacId) : "tierra de nadie";
      var souls = (z.crowd ? z.crowd.count : 0);
      return "<tr><td class=\"text-cyan\">" + esc(z.name) + "</td><td class=\"text-muted\">" + esc(z.rank || "—") + "</td><td>" + esc(ruler) + "</td><td class=\"text-muted\">~" + esc(souls) + "</td></tr>";
    }).join("");

    var facRows = facs.map(function (f) {
      return "<tr><td class=\"text-white\">" + esc(f.name) + "</td><td class=\"text-gold\">" + (f.power || 0) + "</td><td class=\"text-muted\">" + esc(Engine.zoneName(u, f.zoneId)) + "</td></tr>";
    }).join("");

    box.innerHTML =
      "<div class=\"universe-hero\">" +
        "<div class=\"universe-seed text-muted\">SEMILLA · " + esc(this.currentSeedText || this.currentNumericSeed) +
          " · #" + (this.currentNumericSeed >>> 0) + "</div>" +
        "<h2 class=\"universe-title text-white\">" + esc(tipoLabel) + " · " + esc(epochLabel) + "</h2>" +
        "<div class=\"universe-meta\">" +
          "<span class=\"chip\">Techo <b class=\"text-gold\">" + esc(meta.tierId) + "</b> " + esc(rankLabel) + "</span>" +
          "<span class=\"chip\">Régimen <b>" + esc(regime) + "</b></span>" +
          "<span class=\"chip\">Rol <b class=\"text-cyan\">" + esc(meta.hostRole || "—") + "</b></span>" +
        "</div>" +
      "</div>" +
      "<div class=\"retro-panel cyan-panel\">" +
        "<div class=\"panel-title text-cyan\">TRAMA</div>" +
        "<div class=\"text-white\" style=\"font-weight:600;margin-bottom:4px;\">" + esc(plot.title || "—") + "</div>" +
        "<div class=\"text-muted\" style=\"font-size:0.85em;line-height:1.4;\">" + esc(plot.desc || "") + "</div>" +
        (traits.length ? "<div class=\"text-purple\" style=\"margin-top:8px;font-size:0.8em;\">Rasgos: " + esc(traits.join(" · ")) + "</div>" : "") +
      "</div>" +
      "<div class=\"retro-panel gold-panel\">" +
        "<div class=\"panel-title text-gold\">TERRITORIOS (" + zones.length + ")</div>" +
        "<table>" + zoneRows + "</table>" +
      "</div>" +
      "<div class=\"retro-panel cyan-panel\">" +
        "<div class=\"panel-title text-cyan\">POTENCIAS (" + facs.length + ")</div>" +
        "<table>" + facRows + "</table>" +
      "</div>" +
      "<div class=\"universe-foot text-muted\">" +
        notables + " almas notables · ~" + (typeof Engine.formatCount === "function" ? Engine.formatCount(masa) : masa) + " en las masas" +
      "</div>";
  };

  ui.generateWorld = function () {
    var inp = document.getElementById("input-seed");
    var resolved = this.resolveSeed(inp ? inp.value : "");
    this.currentSeedText = resolved.text;
    this.currentNumericSeed = resolved.numeric;
    this.saveSeedToList(resolved.text, resolved.numeric);
    var meta = Engine.generateWorldMeta(resolved.numeric);
    this.worldState = {
      seed: resolved.numeric,
      meta: meta,
      universe: Engine.generateUniverse(resolved.numeric, meta),
      tick: 0,
      waitingForChoice: false,
      agents: [],
      choiceLog: [],
      eventQueue: [],
      timeline: []
    };
    this.currentHost = null;
    this.activeLoadout = [];
    this.openUniverseStage();
  };

  var _returnToHub = ui.returnToHub.bind(ui);
  ui.returnToHub = function () {
    _returnToHub();
    hideAllStages();
    var home = document.getElementById("aegis-home-hud");
    if (home) home.style.display = "flex";
    this.renderHomeStats();
  };

  document.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id === "input-seed") ui.refreshSeedPreview();
  });

  console.log("[nexo] stage-flow 1.74.1 listo");
})();
