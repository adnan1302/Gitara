// Pokretanje: node tests/sync.test.js
const assert = require("assert");
const S = require("../sync.js");
let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error("PAD: " + name + "\n", e.message); process.exitCode = 1; } }
const song = (id, u, extra) => Object.assign({ id, title: id, updatedAt: u }, extra || {});
const ids = d => d.songs.map(s => s.id);

t("novija izmjena pjesme pobjeđuje, s obje strane", () => {
  const m = S.merge({ songs: [song("a", 5, { title: "lokalno" }), song("b", 1)] }, { songs: [song("a", 3), song("b", 9, { title: "daljinski" })] });
  assert.strictEqual(m.songs.find(s => s.id === "a").title, "lokalno");
  assert.strictEqual(m.songs.find(s => s.id === "b").title, "daljinski");
});
t("isto vrijeme: ostaje lokalna verzija", () => {
  const m = S.merge({ songs: [song("a", 5, { title: "L" })] }, { songs: [song("a", 5, { title: "R" })] });
  assert.strictEqual(m.songs[0].title, "L");
});
t("pjesme samo s jedne strane se ne gube", () => {
  assert.deepStrictEqual(ids(S.merge({ songs: [song("a", 1)] }, { songs: [song("b", 1)] })).sort(), ["a", "b"]);
});
t("pjesme bez vremena izmjene (početne) se ne gube", () => {
  assert.deepStrictEqual(ids(S.merge({ songs: [song("seed-a", 0), song("b", 0)] }, { songs: [song("seed-a", 0)], removed: { c: 5 } })), ["seed-a", "b"]);
});
t("brisanje se prenosi i pjesma se ne vraća", () => {
  const m = S.merge({ songs: [song("a", 5), song("b", 1)] }, { songs: [song("b", 1)], removed: { a: 7 } });
  assert.deepStrictEqual(ids(m), ["b"]); assert.strictEqual(m.removed.a, 7);
  const back = S.merge({ songs: [song("a", 5)] }, m);
  assert.deepStrictEqual(ids(back), ["b"], "stari uređaj ne vraća obrisanu pjesmu");
});
t("izmjena poslije brisanja čuva pjesmu", () => {
  assert.deepStrictEqual(ids(S.merge({ songs: [song("a", 9)] }, { songs: [], removed: { a: 7 } })), ["a"]);
});
t("obrisana početna pjesma (updatedAt 0) ostaje obrisana", () => {
  assert.deepStrictEqual(ids(S.merge({ songs: [song("seed-x", 0)] }, { songs: [], removed: { "seed-x": 1 } })), []);
});
t("redoslijed s novijim orderAt, nove pjesme na početku", () => {
  const m = S.merge({ songs: [song("a", 1), song("b", 1), song("n", 1)], orderAt: 2 }, { songs: [song("b", 1), song("a", 1), song("r", 1)], orderAt: 5 });
  assert.deepStrictEqual(ids(m), ["n", "b", "a", "r"]); assert.strictEqual(m.orderAt, 5);
});
t("isto stanje se prepoznaje bez obzira na redoslijed zapisa o brisanju", () => {
  assert(S.same({ songs: [song("a", 1)], removed: { x: 1, y: 2 }, orderAt: 3 }, { songs: [song("a", 1)], removed: { y: 2, x: 1 }, orderAt: 3 }));
  assert(!S.same({ songs: [song("a", 1)], removed: {}, orderAt: 3 }, { songs: [song("a", 2)], removed: {}, orderAt: 3 }));
});
t("base64 čuva naša slova", () => {
  const txt = "Šta će mi život, đavo čeka — Ćuti, Žena, ЉУБАВ ♪";
  assert.strictEqual(S.fromB64(S.toB64(txt)), txt);
  assert.strictEqual(S.fromB64(S.toB64(txt).replace(/(.{10})/g, "$1\n")), txt, "GitHub lomi base64 u redove");
});
t("neispravni ulazi ne ruše spajanje", () => {
  const m = S.merge({ songs: [null, song("a", 1), { title: "bez id" }], removed: [] }, { songs: "x", removed: { b: "nije broj" } });
  assert.deepStrictEqual(ids(m), ["a"]);
});
console.log(n + " testova prošlo");
