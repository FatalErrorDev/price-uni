/* === IndexedDB Analysis Cache === */

(function () {
  'use strict';

  var DB_NAME = 'price-intel-cache';
  var DB_VERSION = 1;
  var STORE_NAME = 'analyses';
  var CACHE_VERSION = 2; // Bump when analyzeFile() logic changes

  var db = null;
  var memoryCache = {}; // Fallback when IndexedDB unavailable
  var pending = {}; // fileId -> Promise<result> (deduplicates in-flight downloads)
  var preloadProgress = {}; // { sewera: { done: 0, total: 0, running: false }, ... }

  function openCache() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }

      if (!window.indexedDB) {
        console.warn('[cache] IndexedDB not available, using in-memory fallback');
        resolve(null);
        return;
      }

      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (e) {
        var database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          var store = database.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
          store.createIndex('branch', 'branch', { unique: false });
        }
      };

      request.onsuccess = function (e) {
        db = e.target.result;
        resolve(db);
      };

      request.onerror = function () {
        console.warn('[cache] IndexedDB open failed, using in-memory fallback');
        resolve(null);
      };
    });
  }

  function getCachedResult(fileId, modifiedTime) {
    return new Promise(function (resolve) {
      if (!db) {
        var mem = memoryCache[fileId];
        if (mem && mem.modifiedTime === modifiedTime && mem.cacheVersion === CACHE_VERSION) {
          resolve(mem.result);
        } else {
          resolve(null);
        }
        return;
      }

      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var request = store.get(fileId);

      request.onsuccess = function () {
        var record = request.result;
        if (record && record.modifiedTime === modifiedTime && record.cacheVersion === CACHE_VERSION) {
          resolve(record.result);
        } else {
          resolve(null);
        }
      };

      request.onerror = function () {
        resolve(null);
      };
    });
  }

  function setCachedResult(fileId, modifiedTime, branch, result) {
    var record = {
      fileId: fileId,
      modifiedTime: modifiedTime,
      branch: branch,
      result: result,
      cacheVersion: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
    };

    if (!db) {
      memoryCache[fileId] = record;
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); }; // Swallow write errors
    });
  }

  // Smart loader: cache hit → instant, cache miss → download/parse/analyze/cache
  // Uses pending map to deduplicate concurrent requests for the same file
  function getAnalysis(file, branch) {
    if (pending[file.id]) {
      return pending[file.id];
    }

    var p = openCache().then(function () {
      return getCachedResult(file.id, file.modifiedTime);
    }).then(function (cached) {
      if (cached) {
        console.log('[cache] HIT: ' + file.name);
        return cached;
      }
      console.log('[cache] MISS: ' + file.name + ' — downloading');
      return downloadFile(file.id).then(function (buf) {
        var rows = parseXlsx(buf);
        var result = analyzeFile(rows, branch);
        result.date = file.date;
        result.filename = file.name;
        return setCachedResult(file.id, file.modifiedTime, branch, result).then(function () {
          return result;
        });
      });
    }).then(function (result) {
      delete pending[file.id];
      return result;
    }, function (err) {
      delete pending[file.id];
      throw err;
    });

    pending[file.id] = p;
    return p;
  }

  // Background preload: iterate files, cache uncached ones
  function preloadAll(branch, files) {
    if (!files || files.length === 0) return Promise.resolve();

    preloadProgress[branch] = { done: 0, total: files.length, running: true };
    updatePreloadUI(branch);

    var chain = openCache();
    files.forEach(function (file) {
      chain = chain.then(function () {
        if (!preloadProgress[branch].running) return; // Cancelled
        return getAnalysis(file, branch).then(function () {
          preloadProgress[branch].done++;
          updatePreloadUI(branch);
        }).catch(function (err) {
          console.warn('[cache] Preload failed for ' + file.name + ':', err.message);
          preloadProgress[branch].done++;
          updatePreloadUI(branch);
        });
      });
    });

    return chain.then(function () {
      preloadProgress[branch].running = false;
      updatePreloadUI(branch);
    });
  }

  function updatePreloadUI(branch) {
    var el = document.getElementById('preload-status-' + branch);
    if (!el) return;

    var p = preloadProgress[branch];
    if (!p) { el.textContent = ''; return; }

    if (!p.running && p.done >= p.total) {
      el.innerHTML = '<span class="preload-done">All ' + p.total + ' files cached \u2713</span>';
      // Fade out after 3s
      setTimeout(function () { el.textContent = ''; }, 3000);
    } else if (p.running) {
      el.innerHTML = '<span class="preload-progress">Caching ' + p.done + '/' + p.total + ' files\u2026</span>';
    }
  }

  function isPreloading(branch) {
    return preloadProgress[branch] && preloadProgress[branch].running;
  }

  // Initialize on load
  openCache();

  // Expose globals
  window.openCache = openCache;
  window.getAnalysis = getAnalysis;
  window.preloadAll = preloadAll;
  window.isPreloading = isPreloading;
})();
