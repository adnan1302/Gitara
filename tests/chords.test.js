// Pokretanje: node tests/chords.test.js
const assert = require("assert");
const C = require("../chords.js");
let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error("PAD: " + name + "\n", e.message); process.exitCode = 1; } }

t("prepoznavanje akorda", () => {
  for (const c of ["A", "Am", "H7", "F#m", "Bb", "Cmaj7", "Dsus4", "G/H", "E7#9", "Am7b5", "C6/9", "(Am)", "Fadd9", "hm", "a"]) assert(C.isChord(c), c);
  for (const c of ["Da", "I", "Kad", "am!", "Ref", "to", "Hej", "Add", "dim", "ja"]) assert(!C.isChord(c), c);
});
t("red s akordima naspram teksta", () => {
  assert(C.isChordLine("C           E     Am               F"));
  assert(C.isChordLine("| Am | G | x2"));
  assert(C.isChordLine("a d E a"));
  assert(!C.isChordLine("A gomila decurlije gledala me iz avlije"));
  assert(!C.isChordLine("I rekla mi, hej, pa to sam ja."));
  assert(!C.isChordLine("a"));
  assert(!C.isChordLine("E moj druze"));
});
t("akordi iznad riječi", () => {
  const r = C.importText("C           E     Am               F\nKad sam isao u Pancevo, zivot me prvi put naceo\n   C      B Am G\nU Vojvode Stepe 1A.");
  assert.strictEqual(r.format, "over");
  assert.strictEqual(r.chordpro, "[C]Kad sam isao [E]u Pan[Am]cevo, zivot me pr[F]vi put naceo\nU V[C]ojvode [B]St[Am]epe [G]1A.");
});
t("akordi bez teksta ispod i oznake dijelova", () => {
  const r = C.importText("[Intro]\nAm  G  F  E\n\nRefren:\n Fmaj7 E\n  To sam ja\n\nSolo: Am G");
  assert.strictEqual(r.chordpro, "{c: Intro}\n[Am]  [G]  [F]  [E]\n\n{c: Refren}\n  [Fmaj7]To sa[E]m ja\n\n{c: Solo}\n[Am] [G]");
});
t("ChordPro ulaz", () => {
  const r = C.importText("{title: Lipe cvatu}\n{artist: Bijelo dugme}\n{soc}\n[Am]Lipe cvatu, [G]sve je isto ko i lani\n{eoc}\nSamo srce [H7]moje");
  assert.strictEqual(r.format, "chordpro");
  assert.deepStrictEqual(r.meta, { title: "Lipe cvatu", artist: "Bijelo dugme" });
  assert.strictEqual(r.chordpro, "{c: Refren}\n[Am]Lipe cvatu, [G]sve je isto ko i lani\nSamo srce [H7]moje");
  assert(r.hasH);
});
t("dijakritika ostaje netaknuta", () => {
  const r = C.importText("Hm         G\nŠta će mi život, đavo čeka žrtvu ćutke");
  assert.strictEqual(r.chordpro, "[Hm]Šta će mi ž[G]ivot, đavo čeka žrtvu ćutke");
});
t("izvođač i naslov iz prvog reda", () => {
  const r = C.importText("Zabranjeno pušenje - Zenica blues\n\nAm      E\nZenica blues");
  assert.strictEqual(r.meta.artist, "Zabranjeno pušenje");
  assert.strictEqual(r.meta.title, "Zenica blues");
  assert.strictEqual(r.chordpro, "[Am]Zenica b[E]lues");
});
t("H u B samo na zahtjev, uz pregled", () => {
  const cp = "[H7]Jedan [B]dva [Hm/F#]tri [hm]cetiri [C/H]pet [Bb]sest";
  assert.deepStrictEqual(C.germanToEnglishPreview(cp).map(x => x.from + ">" + x.to), ["H7>B7", "B>Bb", "Hm/F#>Bm/F#", "hm>bm", "C/H>C/B"]);
  assert.strictEqual(C.germanToEnglish(cp), "[B7]Jedan [Bb]dva [Bm/F#]tri [bm]cetiri [C/B]pet [Bb]sest");
  assert.strictEqual(C.importText("H7     E\nNeka pjesma").chordpro, "[H7]Neka pj[E]esma");
});
t("transpozicija", () => {
  assert.strictEqual(C.transpose("[Am]a [G/B]b [F#m7]c", 2, "en"), "[Bm]a [A/C#]b [G#m7]c");
  assert.strictEqual(C.transpose("[Hm]a [B]b [G]c", 1, "de"), "[Cm]a [H]b [G#]c");
  assert.strictEqual(C.transpose("[Am]a [E]b", -2, "de"), "[Gm]a [D]b");
  assert.strictEqual(C.transpose("[A]a", 1, "de"), "[B]a");
  assert.strictEqual(C.transpose("[A]a", 1, "en"), "[Bb]a");
  assert.strictEqual(C.transpose("[Eb]a [Bb]b", 2, "en"), "[F]a [C]b");
  assert.strictEqual(C.transpose("[Eb]a [Ab]b", 1, "en"), "[E]a [A]b");
  assert.strictEqual(C.transpose("[C]a {x}", 12, "en"), "[C]a {x}");
  assert.strictEqual(C.transpose("[a]x [d]y", 2, "en"), "[b]x [e]y");
});
t("parse i serialize su povratni", () => {
  const cp = "{c: Refren}\n[Am]Lipe [G]cvatu\n\n[C] [G]\n{sot}\ne|--0--|\n{eot}\nkraj[E]";
  assert.strictEqual(C.serialize(C.parse(cp)), cp);
});
t("tablatura se čuva doslovno", () => {
  const r = C.importText("e|--0--2--3--|\nB|--1--3--0--|\nTekst");
  assert.strictEqual(r.chordpro, "{sot}\ne|--0--2--3--|\nB|--1--3--0--|\n{eot}\nTekst");
});
t("uglaste zagrade u tekstu ne postaju akordi", () => {
  assert.strictEqual(C.importText("Am\nPjevaj [2x] opet").chordpro, "[Am]Pjevaj (2x) opet");
});
console.log(n + " testova prošlo");
