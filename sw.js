/* Offline rad. Pri svakoj izmjeni fajlova aplikacije povećaj VERSION. */
var VERSION = "gitara-v11-inline-filter-icon";
var SHELL = ["./", "index.html", "app.js", "chords.js", "seeds.js", "sync.js", "song-details.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/manrope-latin-variable.woff2", "fonts/manrope-latin-ext-variable.woff2",
  "fonts/source-sans-3-latin-variable.woff2", "fonts/source-sans-3-latin-ext-variable.woff2"];
var HEAVY = ["vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "tabs/all-of-me.pdf"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    // PDF.js i tablatura se keširaju posebno, da njihov neuspjeh ne spriječi offline rad ostatka.
    HEAVY.forEach(function (url) { cache.add(url).catch(function () {}); });
    return cache.addAll(SHELL);
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  var req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  var heavy = /\/(vendor|tabs|icons)\//.test(url.pathname);
  if (heavy) {
    // Veliki fajlovi koji se ne mijenjaju: prvo keš.
    event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok && res.status === 200) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  // Kod aplikacije: prvo mreža (da izmjene stignu odmah), keš kad nema mreže.
  event.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.status === 200) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
    });
  }));
});
