// Linked into the WASM simulator via --pre-js (see simulator/CMakeLists.txt).
//
// Gives the browser build a persistent SD card: /sd stays MEMFS (the boot seed
// from --preload-file plus live firmware I/O), while an IDBFS mirror under
// /idb_persist stores user-visible state in IndexedDB across page reloads —
// reading position, settings, downloaded dictionaries, uploaded books.
//
// Facts this design leans on (verified against the live build, 2026-10):
//   - MEMFS is shared across the runtime threads: firmware (pthread) writes to
//     /sd are visible from the main thread, so mirroring here sees everything.
//   - FS.syncfs() is async (IndexedDB); the load is gated with a run
//     dependency so main() - and every firmware task - only starts once the
//     persisted overlay is in place.
//   - Store sync rewrites every file, so the ~10 MB CJK packs under /sd/.fonts
//     are excluded: the page re-stages them each boot anyway (index.html
//     stageCjkFont), and seed-only root books re-arrive via --preload-file.
//
// Known trade-off: a book the user deletes in-app reappears after a reload
// because the preload seed unpacks it again. Acceptable for a demo card.

(function () {
  var LIVE = '/sd';
  var PERSIST = '/idb_persist';
  // Relative paths never mirrored to IndexedDB (re-seeded every boot).
  var EXCLUDE = ['/.fonts'];

  function register(M) {
    M.preRun = M.preRun || [];
    M.preRun.push(startPersistence);
  }
  if (typeof Module !== 'undefined') {
    register(Module);
  } else {
    console.warn('[sim] idbfs_persist: Module not found at pre-js time, persistence disabled');
    return;
  }

  function listFiles(root) {
    var out = [];
    (function walk(dir, rel) {
      var entries;
      try { entries = FS.readdir(dir); } catch (e) { return; }
      for (var i = 0; i < entries.length; i++) {
        var name = entries[i];
        if (name === '.' || name === '..') continue;
        var path = dir + '/' + name;
        var relPath = rel ? rel + '/' + name : name;
        var st;
        try { st = FS.stat(path); } catch (e) { continue; }
        if (FS.isDir(st.mode)) walk(path, relPath);
        else if (FS.isFile(st.mode)) out.push({ path: path, rel: relPath, size: st.size, mtime: st.mtime });
      }
    })(root, '');
    return out;
  }

  function excluded(rel) {
    var abs = '/' + rel; // listFiles yields mount-relative paths without the leading slash
    for (var i = 0; i < EXCLUDE.length; i++) {
      if (abs.indexOf(EXCLUDE[i]) === 0) return true;
    }
    return false;
  }

  function parentDir(p) { var i = p.lastIndexOf('/'); return i > 0 ? p.slice(0, i) : '/'; }

  function startPersistence() {
    try { FS.mkdirTree(PERSIST); } catch (e) { /* already mounted on a warm FS */ }
    FS.mount(IDBFS, {}, PERSIST);

    var dep = 'idbfs-load';
    addRunDependency(dep);
    FS.syncfs(true, function (err) {
      try {
        if (err) {
          console.warn('[sim] IDBFS load failed, starting from the seed image:', err);
          return;
        }
        // Overlay persisted state onto the seed: user files win over the page's
        // seed writes (this callback is queued after index.html's preRun seed).
        var persisted = listFiles(PERSIST);
        for (var i = 0; i < persisted.length; i++) {
          var rec = persisted[i];
          if (excluded(rec.rel)) continue;
          var dst = LIVE + '/' + rec.rel;
          try {
            FS.mkdirTree(parentDir(dst));
            FS.writeFile(dst, FS.readFile(rec.path));
          } catch (e) { console.warn('[sim] restore failed for', rec.rel, e); }
        }
      } finally {
        removeRunDependency(dep);
        scheduleSaves();
      }
    });
  }

  var lastSignature = null;
  var saving = false;

  function liveSignature(files) {
    var parts = [];
    for (var i = 0; i < files.length; i++) parts.push(files[i].rel + ':' + files[i].size + ':' + files[i].mtime);
    return parts.sort().join('|');
  }

  function save() {
    if (saving) return;
    var files = listFiles(LIVE).filter(function (f) { return !excluded(f.rel); });
    var sig = liveSignature(files);
    if (lastSignature !== null && sig === lastSignature) return;  // nothing touched since the last sync

    saving = true;
    try {
      var want = {};
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        want[f.rel] = true;
        var dst = PERSIST + '/' + f.rel;
        var st = null;
        try { st = FS.stat(dst); } catch (e) { /* not persisted yet */ }
        // .crosspoint/ churns constantly and is tiny: always rewrite. Anything
        // else (dictionaries, books) only when the size moved, so a same-size
        // overwrite is rare enough to live with.
        if (st && st.size === f.size && f.rel.indexOf('.crosspoint/') !== 0) continue;
        FS.mkdirTree(parentDir(dst));
        FS.writeFile(dst, FS.readFile(f.path));
      }
      var stored = listFiles(PERSIST);
      for (var j = 0; j < stored.length; j++) {
        if (!want[stored[j].rel] && !excluded(stored[j].rel)) {
          try { FS.unlink(stored[j].path); } catch (e) { /* dir cleanup below */ }
        }
      }
    } catch (e) {
      console.warn('[sim] IDBFS mirror failed', e);
      saving = false;
      return;
    }
    FS.syncfs(false, function (err) {
      saving = false;
      if (err) console.warn('[sim] IDBFS save failed', err);
      else lastSignature = sig;
    });
  }

  function scheduleSaves() {
    // syncfs(false) rewrites the whole store, so keep it infrequent and
    // change-gated; hidden/beforeunload are the "must not lose data" hooks
    // (beforeunload's sync is best-effort - browsers do not await it).
    setInterval(save, 30000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') save();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', save);
    }
  }
})();
