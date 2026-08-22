/* nexo-update.js v1.74.2 — actualizador desde GitHub (IndexedDB overlay) */
(function (global) {
  var DB_NAME = "nexoOverlay";
  var DB_VER = 1;
  var STORE = "files";
  var META_KEY = "sysOverlayMeta";
  var LOCAL_VER = (global.NEXO_VER || "0.0.0");

  var BASES = [
    "https://raw.githubusercontent.com/jongamer117-ops/nexo-releases/master/",
    "https://cdn.jsdelivr.net/gh/jongamer117-ops/nexo-releases@master/"
  ];

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function idbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function fetchText(url) {
    return fetch(url, { cache: "no-store", mode: "cors" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
      return res.text();
    });
  }

  function fetchTextAny(path) {
    var i = 0;
    function next() {
      if (i >= BASES.length) return Promise.reject(new Error("No se pudo bajar " + path));
      var url = BASES[i++] + path + (path.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
      return fetchText(url).catch(next);
    }
    return next();
  }

  function setStatus(msg) {
    var el = document.getElementById("version-tag");
    if (el) el.textContent = msg;
    try { console.log("[nexo-update]", msg); } catch (e) {}
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "null"); } catch (e) { return null; }
  }
  function setMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function cmpVer(a, b) {
    var pa = String(a || "0").split(".").map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || "0").split(".").map(function (x) { return parseInt(x, 10) || 0; });
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function downloadAndStore(remote) {
    var files = remote.files || [
      "app.js", "engine.js", "styles.css", "stage-flow.js", "stage-flow.css",
      "cards_db.js", "tech_db.js", "nexo-update.js", "version.json"
    ];
    var i = 0;
    function next() {
      if (i >= files.length) return Promise.resolve();
      var name = files[i++];
      setStatus("bajando " + name + " (" + i + "/" + files.length + ")");
      return fetchTextAny(name).then(function (text) {
        return idbPut(name, text);
      }).catch(function (err) {
        console.warn("[nexo-update] skip " + name, err && err.message);
      }).then(next);
    }
    return next().then(function () {
      setMeta({
        version: remote.version,
        build: remote.build,
        notes: remote.notes || "",
        files: files,
        at: Date.now(),
        force: true
      });
    });
  }

  function hardReload() {
    var done = Promise.resolve();
    try {
      if (navigator.serviceWorker) {
        done = navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        });
      }
    } catch (e) {}
    return done.then(function () {
      try {
        if (window.caches) {
          return caches.keys().then(function (ks) {
            return Promise.all(ks.map(function (k) { return caches.delete(k); }));
          });
        }
      } catch (e) {}
    }).then(function () {
      var t = Date.now();
      var q = (location.search || "").replace(/[?&]nexo=\d+/g, "").replace(/^\?&/, "?").replace(/\?$/, "");
      location.replace(location.pathname + (q ? q + (q.indexOf("?") >= 0 ? "&" : "?") : "?") + "nexo=" + t);
    });
  }

  var api = {
    localVersion: LOCAL_VER,
    getMeta: getMeta,

    revert: function () {
      setStatus("revirtiendo…");
      return idbClear().then(function () {
        try { localStorage.removeItem(META_KEY); } catch (e) {}
        setStatus("sys.ver_" + LOCAL_VER);
        return hardReload();
      });
    },

    checkAndApply: function () {
      if (global.AndroidNative && typeof global.AndroidNative.checkForUpdate === "function") {
        try {
          global.AndroidNative.checkForUpdate();
          setStatus("actualizando (nativo)…");
          return Promise.resolve();
        } catch (e) {
          console.warn("[nexo-update] bridge nativo falló, uso JS", e);
        }
      }
      if (global.AndroidUpdate && typeof global.AndroidUpdate.download === "function") {
        try {
          global.AndroidUpdate.download();
          setStatus("actualizando (bridge)…");
          return Promise.resolve();
        } catch (e) {}
      }

      setStatus("buscando…");
      return fetchTextAny("version.json").then(function (txt) {
        var remote = JSON.parse(txt);
        var remoteVer = remote.version || "0";
        var localOverlay = getMeta();
        var current = (localOverlay && localOverlay.version) || LOCAL_VER;

        if (cmpVer(remoteVer, current) <= 0 && cmpVer(remoteVer, LOCAL_VER) <= 0) {
          setStatus("sys.ver_" + current + " · al día");
          var last = api._lastCheck || 0;
          if (Date.now() - last > 3000) {
            api._lastCheck = Date.now();
            return;
          }
        }
        api._lastCheck = Date.now();
        setStatus("v" + remoteVer + " encontrada…");
        return downloadAndStore(remote).then(function () {
          setStatus("listo v" + remoteVer + " · reinicio");
          return hardReload();
        });
      }).catch(function (err) {
        console.error("[nexo-update]", err);
        setStatus("error red · toca otra vez");
        setTimeout(function () {
          hardReload().catch(function () { location.reload(true); });
        }, 1200);
      });
    },

    loadApp: function (scripts, styles) {
      scripts = scripts || [];
      styles = styles || [];
      var meta = getMeta();
      var useOverlay = !!(meta && meta.version && cmpVer(meta.version, LOCAL_VER) >= 0);

      function injectStyle(name, text) {
        var style = document.createElement("style");
        style.setAttribute("data-nexo", name);
        style.textContent = text;
        document.head.appendChild(style);
      }
      function injectScript(name, text) {
        return new Promise(function (resolve) {
          var s = document.createElement("script");
          s.setAttribute("data-nexo", name);
          s.text = text;
          (document.body || document.head).appendChild(s);
          resolve();
        });
      }
      function loadScriptSrc(name) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = name + "?v=" + encodeURIComponent(LOCAL_VER);
          s.onload = function () { resolve(); };
          s.onerror = function () { reject(new Error("fail " + name)); };
          (document.body || document.head).appendChild(s);
        });
      }
      function loadStyleHref(name) {
        return new Promise(function (resolve) {
          var l = document.createElement("link");
          l.rel = "stylesheet";
          l.href = name + "?v=" + encodeURIComponent(LOCAL_VER);
          l.onload = function () { resolve(); };
          l.onerror = function () { resolve(); };
          document.head.appendChild(l);
        });
      }

      var chain = Promise.resolve();
      styles.forEach(function (name) {
        chain = chain.then(function () {
          if (useOverlay) {
            return idbGet(name).then(function (text) {
              if (text) injectStyle(name, text);
              else return loadStyleHref(name);
            });
          }
          return loadStyleHref(name);
        });
      });
      scripts.forEach(function (name) {
        chain = chain.then(function () {
          if (useOverlay) {
            return idbGet(name).then(function (text) {
              if (text) return injectScript(name, text);
              return loadScriptSrc(name);
            });
          }
          return loadScriptSrc(name);
        });
      });
      return chain.then(function () {
        if (useOverlay && meta) {
          setStatus("sys.ver_" + meta.version + " ↑");
          global.NEXO_VER = meta.version;
        }
        console.log("[nexo] app cargada", useOverlay ? "overlay " + (meta && meta.version) : "empaquetado " + LOCAL_VER);
      }).catch(function (e) {
        console.error("[nexo] loadApp", e);
        setStatus("error carga");
      });
    }
  };

  global.NexoUpdate = api;
  global.nexoReload = function () { return api.checkAndApply(); };

  document.addEventListener("DOMContentLoaded", function () {
    var meta = getMeta();
    var el = document.getElementById("version-tag");
    if (el && meta && meta.version) {
      el.textContent = "sys.ver_" + meta.version + (cmpVer(meta.version, LOCAL_VER) > 0 ? " ↑" : "");
      el.title = "Actualizar desde GitHub · mantener 2s para revertir al empaquetado";
    }
    if (el) {
      var t = null;
      el.addEventListener("touchstart", function () {
        t = setTimeout(function () { api.revert(); }, 2000);
      }, { passive: true });
      el.addEventListener("touchend", function () { if (t) clearTimeout(t); });
      el.addEventListener("mousedown", function () {
        t = setTimeout(function () { api.revert(); }, 2000);
      });
      el.addEventListener("mouseup", function () { if (t) clearTimeout(t); });
    }
  });
})(window);
