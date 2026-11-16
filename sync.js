/* Gitara: sinhronizacija s privatnim GitHub repoom. Bez servera: preglednik direktno zove GitHub API.
   Pjesme su u jednom JSON fajlu u repou; svako snimanje je jedan commit, pa je cijela historija sačuvana. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GitaraSync = factory();
})(this, function () {
  "use strict";

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

  /* Spajanje dvije kopije (lokalne i one na GitHubu), pjesmu po pjesmu.
     - Novija izmjena pjesme (updatedAt) pobjeđuje; kod istog vremena ostaje lokalna.
     - Brisanje je zapis {id: vrijeme}; pjesma ostaje obrisana osim ako je kasnije mijenjana.
     - Redoslijed se uzima iz kopije s novijim orderAt; pjesme kojih tamo nema idu na početak. */
  function merge(local, remote) {
    local = local || {}; remote = remote || {};
    var ls = Array.isArray(local.songs) ? local.songs : [], rs = Array.isArray(remote.songs) ? remote.songs : [];
    var removed = {};
    [local.removed, remote.removed].forEach(function (r) {
      if (!r || typeof r !== "object") return;
      Object.keys(r).forEach(function (id) { var t = num(r[id]); if (t > num(removed[id])) removed[id] = t; });
    });
    var byId = {};
    function take(s) {
      if (!s || typeof s.id !== "string") return;
      var cur = byId[s.id];
      if (!cur || num(s.updatedAt) > num(cur.updatedAt)) byId[s.id] = s;
    }
    ls.forEach(take); rs.forEach(take);
    var remoteFirst = num(remote.orderAt) > num(local.orderAt);
    var base = remoteFirst ? rs : ls, other = remoteFirst ? ls : rs;
    var inBase = {}, order = [], seen = {};
    base.forEach(function (s) { if (s) inBase[s.id] = true; });
    other.forEach(function (s) { if (s && !inBase[s.id]) order.push(s.id); });
    base.forEach(function (s) { if (s) order.push(s.id); });
    var songs = [];
    order.forEach(function (id) {
      if (seen[id]) return; seen[id] = true;
      var s = byId[id];
      if (s && !(Object.prototype.hasOwnProperty.call(removed, id) && removed[id] >= num(s.updatedAt))) songs.push(s);
    });
    return { songs: songs, removed: removed, orderAt: Math.max(num(local.orderAt), num(remote.orderAt)) };
  }
  function same(a, b) {
    return JSON.stringify({ s: a.songs, r: sortKeys(a.removed), o: num(a.orderAt) }) === JSON.stringify({ s: b.songs, r: sortKeys(b.removed), o: num(b.orderAt) });
  }
  function sortKeys(o) { var r = {}; Object.keys(o || {}).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  /* UTF-8 <-> base64 (GitHub vraća i prima sadržaj fajla kao base64). */
  function toB64(text) { return bytesToB64(new TextEncoder().encode(text)); }
  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(String(b64 || "").replace(/\s+/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function SyncError(kind, message, status) { this.kind = kind; this.message = message; this.status = status || 0; }
  SyncError.prototype = Object.create(Error.prototype);

  /* Mali GitHub klijent. cfg: {owner, repo, token, path}. */
  function client(cfg, opts) {
    opts = opts || {};
    var api = opts.api || "https://api.github.com", fetchFn = opts.fetch || (typeof fetch === "function" ? fetch.bind(null) : null);
    var path = cfg.path || "pjesme.json";
    var repoUrl = api + "/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo);
    function req(method, url, body, accept) {
      var headers = { Accept: accept || "application/vnd.github+json", Authorization: "Bearer " + cfg.token };
      if (body) headers["Content-Type"] = "application/json";
      return fetchFn(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
        .catch(function () { throw new SyncError("offline", "Nema veze s GitHubom."); })
        .then(function (res) {
          if (res.status === 401) throw new SyncError("auth", "GitHub ne prihvata token: pogrešan je ili je istekao. Upiši novi u meniju ⋯ pod Sinhronizacija.", 401);
          if (res.status === 403 || res.status === 429) {
            var limited = res.headers && res.headers.get && res.headers.get("x-ratelimit-remaining") === "0";
            if (limited || res.status === 429) throw new SyncError("later", "GitHub je privremeno ograničio pristup. Pokušaću ponovo kasnije.", res.status);
            throw new SyncError("auth", "Token nema dozvolu za ovaj repo. Treba mu dozvola Contents: Read and write.", 403);
          }
          return res;
        });
    }
    function json(res) { return res.json().catch(function () { throw new SyncError("server", "GitHub je vratio neočekivan odgovor."); }); }
    return {
      /* Provjera repoa prije povezivanja. */
      checkRepo: function () {
        return req("GET", repoUrl).then(function (res) {
          if (res.status === 404) throw new SyncError("notfound", "Repo " + cfg.owner + "/" + cfg.repo + " nije pronađen, ili token nema pristup njemu.", 404);
          if (!res.ok) throw new SyncError("server", "GitHub greška " + res.status + ".", res.status);
          return json(res);
        });
      },
      /* Čita fajl s pjesmama. Vraća {doc, sha} ili {doc: null, sha: null} ako fajl još ne postoji. */
      read: function () {
        return req("GET", repoUrl + "/contents/" + encodeURI(path)).then(function (res) {
          if (res.status === 404) return { doc: null, sha: null };
          if (!res.ok) throw new SyncError("server", "GitHub greška " + res.status + " pri čitanju.", res.status);
          return json(res).then(function (f) {
            // Fajlovi preko 1 MB dolaze bez sadržaja; tada ga čitamo kao blob.
            var text = f.encoding === "base64" && f.content ? Promise.resolve(fromB64(f.content)) :
              req("GET", repoUrl + "/git/blobs/" + f.sha).then(json).then(function (b) { return fromB64(b.content); });
            return text.then(function (t) {
              var doc = null;
              try { doc = JSON.parse(t); } catch (e) { doc = null; }
              if (!doc || typeof doc !== "object" || !Array.isArray(doc.songs)) throw new SyncError("format", "Fajl " + path + " na GitHubu nije ispravan, pa ga ne diram. Provjeri ga u historiji repoa.");
              return { doc: doc, sha: f.sha };
            });
          });
        });
      },
      /* Upisuje novu verziju. Vraća novi sha; baca "conflict" ako je u međuvremenu neko drugi upisao. */
      write: function (doc, sha, message) {
        var body = { message: message, content: toB64(JSON.stringify(doc, null, 2) + "\n") };
        if (sha) body.sha = sha;
        return req("PUT", repoUrl + "/contents/" + encodeURI(path), body).then(function (res) {
          if (res.status === 409 || res.status === 422) throw new SyncError("conflict", "Fajl je u međuvremenu promijenjen.", res.status);
          if (res.status === 404) throw new SyncError("notfound", "Repo nije pronađen ili token nema pravo pisanja.", 404);
          if (!res.ok) throw new SyncError("server", "GitHub greška " + res.status + " pri upisu.", res.status);
          return json(res).then(function (r) { return r && r.content && r.content.sha; });
        });
      },
      /* Binarni fajl (PDF) po putanji u repou. Vraća ArrayBuffer; baca "notfound" ako ga nema. */
      readFile: function (filePath) {
        return req("GET", repoUrl + "/contents/" + encodeURI(filePath), null, "application/vnd.github.raw+json").then(function (res) {
          if (res.status === 404) throw new SyncError("notfound", "Fajl " + filePath + " još nije na GitHubu.", 404);
          if (!res.ok) throw new SyncError("server", "GitHub greška " + res.status + " pri preuzimanju fajla.", res.status);
          return res.arrayBuffer();
        });
      },
      /* Upisuje binarni fajl ako ga još nema. Putanja sadrži otisak sadržaja, pa postojeći fajl je isti fajl. */
      writeFile: function (filePath, bytes, message) {
        var url = repoUrl + "/contents/" + encodeURI(filePath);
        return req("GET", url).then(function (res) {
          if (res.ok) return false;
          if (res.status !== 404) throw new SyncError("server", "GitHub greška " + res.status + " pri provjeri fajla.", res.status);
          return req("PUT", url, { message: message, content: bytesToB64(bytes) }).then(function (put) {
            if (put.status === 422) return false; // u međuvremenu ga je upisao drugi uređaj
            if (put.status === 404) throw new SyncError("notfound", "Repo nije pronađen ili token nema pravo pisanja.", 404);
            if (!put.ok) throw new SyncError("server", "GitHub greška " + put.status + " pri slanju fajla.", put.status);
            return true;
          });
        });
      },
      historyUrl: "https://github.com/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + "/commits/HEAD/" + encodeURI(path)
    };
  }

  return { merge: merge, same: same, client: client, toB64: toB64, fromB64: fromB64, bytesToB64: bytesToB64, SyncError: SyncError };
});
