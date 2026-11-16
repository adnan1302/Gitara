/* Dopune su odvojene od pjesama: starija aplikacija ih ne može prepisati. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GitaraDetails = factory();
})(this, function () {
  "use strict";
  function time(v) { return Number.isFinite(v) && v >= 0 ? v : 0; }
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (s) { return s && typeof s.id === "string" && s.id; }).map(function (s) {
      return { id: s.id, label: s.label === "red" || s.label === "yellow" ? s.label : "", labelAt: time(s.labelAt),
        comments: (Array.isArray(s.comments) ? s.comments : []).filter(function (c) {
          return c && typeof c.id === "string" && c.id && typeof c.text === "string";
        }).map(function (c) { return { id: c.id, text: c.text, createdAt: time(c.createdAt), updatedAt: time(c.updatedAt), deleted: c.deleted === true }; }) };
    });
  }
  function newest(a, b, key) {
    if (!a) return b;
    if (a[key] !== b[key]) return a[key] > b[key] ? a : b;
    // Stabilan ishod pri istom vremenu, bez obzira na smjer sinhronizacije.
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function merge(a, b) {
    var songs = new Map();
    normalize(a).concat(normalize(b)).forEach(function (s) {
      var prev = songs.get(s.id) || { id: s.id, label: "", labelAt: 0, comments: [] };
      var label = newest({ label: prev.label, labelAt: prev.labelAt }, { label: s.label, labelAt: s.labelAt }, "labelAt");
      var comments = new Map();
      prev.comments.concat(s.comments).forEach(function (c) { comments.set(c.id, newest(comments.get(c.id), c, "updatedAt")); });
      songs.set(s.id, { id: s.id, label: label.label, labelAt: label.labelAt, comments: Array.from(comments.values()).sort(function (x, y) { return x.id.localeCompare(y.id); }) });
    });
    return Array.from(songs.values()).sort(function (x, y) { return x.id.localeCompare(y.id); });
  }
  return { normalize: normalize, merge: merge };
});
