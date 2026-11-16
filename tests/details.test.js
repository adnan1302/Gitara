// node tests/details.test.js — čuvanje dopuna pri uvozu i sinhronizaciji.
const assert = require("assert");
const D = require("../song-details.js");
const fs = require("fs");
const vm = require("vm");
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const entry = (label, at, comments = []) => ({ id: "p1", label, labelAt: at, comments });
const comment = (id, text, at, deleted = false) => ({ id, text, createdAt: 1, updatedAt: at, deleted });

test("stare biblioteke bez dopuna i loši podaci", () => {
  assert.deepStrictEqual(D.merge(undefined, null), []);
  assert.deepStrictEqual(D.normalize([null, 3, { id: 1 }, { id: "x", label: "blue", comments: [null, {}] }]), [{ id: "x", label: "", labelAt: 0, comments: [] }]);
});
test("novija oznaka i njeno uklanjanje", () => {
  assert.strictEqual(D.merge([entry("red", 1)], [entry("yellow", 2)])[0].label, "yellow");
  assert.strictEqual(D.merge([entry("red", 1)], [entry("", 3)])[0].label, "");
});
test("istovremeni komentari s dva uređaja ostaju sačuvani", () => {
  const m = D.merge([entry("red", 2, [comment("a", "Mac", 3)])], [entry("yellow", 1, [comment("b", "iPad", 4)])]);
  assert.strictEqual(m[0].label, "red"); assert.strictEqual(m[0].comments.length, 2);
});
test("obrisani komentar se ne vraća sa starog uređaja", () => {
  const old = [entry("", 0, [comment("a", "staro", 2)])];
  const removed = [entry("", 0, [comment("a", "staro", 5, true)])];
  assert(D.merge(old, removed)[0].comments[0].deleted);
});
test("isto vrijeme daje isti ishod u oba smjera", () => {
  const a = [entry("red", 2, [comment("a", "prvo", 3)])];
  const b = [entry("yellow", 2, [comment("a", "drugo", 3)])];
  assert.deepStrictEqual(D.merge(a, b), D.merge(b, a));
});
test("JSON kopija čuva oznake, komentare i dijakritiku", () => {
  const a = D.merge([], [entry("red", 2, [comment("a", 'Ćuti <script>ž</script>\nDrugi red', 3)])]);
  assert.deepStrictEqual(D.merge([], JSON.parse(JSON.stringify(a))), a);
});

// Izvršavamo stvarni app.js sa zamjenama za DOM i GitHub. Mijenja se samo završni bootstrap.
function app() {
  const elements = new Map(), storage = new Map();
  function el(sel) {
    if (!elements.has(sel)) elements.set(sel, { hidden: true, value: "", innerHTML: "", textContent: "", dataset: {},
      addEventListener() {}, setAttribute() {}, focus() {}, classList: { toggle() {}, remove() {} } });
    return elements.get(sel);
  }
  let remote = null, writes = [], conflicts = 0, reads = 0;
  const context = { Map, Number, Date, JSON, Promise, console, clearTimeout() {}, setTimeout() {},
    document: { querySelector: el, querySelectorAll: () => [], addEventListener() {} },
    window: { GITARA_SEEDS: [], addEventListener() {} }, navigator: {},
    localStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) || null },
    GitaraDetails: D,
    GitaraSync: { client(cfg) { assert.strictEqual(cfg.path, "oznake-komentari.json"); return {
      read: async () => { reads++; return { doc: remote, sha: remote ? "old" : null }; },
      write: async (doc, sha) => { if (conflicts-- > 0) throw { kind: "conflict" }; writes.push({ doc, sha }); remote = doc; }
    }; } }
  };
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const cut = source.lastIndexOf("\n  load();"); assert(cut > 0);
  vm.runInNewContext(source.slice(0, cut) + '\nwindow.testApp = { state: state, syncDetails: syncDetails, load: load, mergeSongs: mergeSongs, exportAll: exportAll, replaceDeliver: function(fn){ deliver=fn; }, replaceRender: function(){ renderList=function(){}; toast=function(){}; } };\n})();', context);
  return { api: context.window.testApp, storage, setRemote: d => { remote = d; }, conflict: () => { conflicts = 1; }, writes, reads: () => reads };
}
test("stvarna pohrana, izvoz i ponovni uvoz sadrže dopune", () => {
  const a = app(); a.api.replaceRender();
  a.storage.set("gitara-v2", JSON.stringify({ songs: [{ id: "p1", title: "Test" }], songDetails: [entry("red", 2, [comment("a", "Uvježbati refren", 3)])] }));
  a.api.load(); let exported;
  a.api.replaceDeliver((name, text) => { exported = JSON.parse(text); }); a.api.exportAll();
  assert.strictEqual(exported.songDetails[0].label, "red");
  const b = app(); b.api.replaceRender(); b.api.mergeSongs(exported.songs, exported.songDetails);
  const saved = JSON.parse(b.storage.get("gitara-v2"));
  assert.deepStrictEqual(saved.songDetails, exported.songDetails);
});
test("GitHub dopune idu u poseban fajl i spajaju oba uređaja", async () => {
  const a = app(); a.api.state.songDetails = [entry("red", 2, [comment("a", "Lokalno", 3)])];
  a.setRemote({ app: "gitara-details", songs: [entry("yellow", 1, [comment("b", "Daljinski", 4)])] });
  await a.api.syncDetails({ owner: "test", repo: "test" });
  assert.strictEqual(a.writes.length, 1); assert.strictEqual(a.writes[0].doc.songs[0].comments.length, 2);
  assert.strictEqual(a.api.state.songDetails[0].label, "red");
  await a.api.syncDetails({}); assert.strictEqual(a.writes.length, 1, "ne piše isti sadržaj ponovo");
});
test("sukob pri upisu se ponovo čita i bezbjedno šalje", async () => {
  const a = app(); a.api.state.songDetails = [entry("red", 2)]; a.conflict();
  await a.api.syncDetails({}); assert.strictEqual(a.reads(), 2); assert.strictEqual(a.writes.length, 1);
});
test("ne prepisuje tuđi format ni prazan novi fajl", async () => {
  const a = app(); await a.api.syncDetails({}); assert.strictEqual(a.writes.length, 0);
  a.setRemote({ app: "drugo", songs: [] });
  await assert.rejects(a.api.syncDetails({}), /drugi format/); assert.strictEqual(a.writes.length, 0);
});
(async () => {
  let passed = 0;
  for (const [name, fn] of tests) { try { await fn(); passed++; } catch (e) { console.error("PAD " + name + ": " + e.stack); process.exitCode = 1; } }
  console.log(passed + "/" + tests.length + " testova dopuna prolazi.");
})();
