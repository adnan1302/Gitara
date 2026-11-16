/* Gitara: uvoz teksta s akordima, ChordPro (podskup), transpozicija.
   Radi u pregledniku (window.Chords) i u Nodeu (require). Bez zavisnosti. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Chords = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ACC = "[#b♯♭]";
  var CHORD_RE = new RegExp(
    "^([A-Ha-h])(" + ACC + "?)" +
    "((?:maj|min|dim|aug|sus|add|mi|m|M|\\d|\\+|-|°|ø|\\(|\\)|#|b|♯|♭|\\/\\d)*)" +
    "(?:\\/([A-Ha-h])(" + ACC + "?))?$"
  );
  // Tokeni koji smiju stajati u redu s akordima, a nisu akordi.
  var FILLER_RE = /^(\|+:?|:?\|+|-+|–|—|\/|%|\*+|x\d+|\d+x|\(x\d+\)|\(\d+x\)|N\.?C\.?|→|:)$/i;
  var DIRECTIVE_RE = /^\s*\{\s*([A-Za-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/;
  var SECTION_WORDS = "intro|uvod|verse|strofa|kitica|chorus|refren|ref|bridge|prelaz|prijelaz|most|solo|outro|kraj|pre-?chorus|interlude|instrumental|coda|završetak";
  var SECTION_RE = new RegExp("^\\s*((?:" + SECTION_WORDS + ")\\.?(?:\\s*\\d+)?\\.?)\\s*(?::|$)\\s*(.*)$", "i");
  var BRACKET_LABEL_RE = /^\s*\[([^\]]+)\]\s*$/;
  var TAB_CHARS_RE = /^\s*[A-Ha-h]?[#b]?\s*[|:]?[-\u2013|0-9hpbrsx\/\\~()^<>.* ]+\|?\s*$/;
  var TAB_RE = { test: function (line) { return TAB_CHARS_RE.test(line) && (line.match(/[-\u2013]/g) || []).length >= 4; } };

  function stripParens(tok) {
    return tok.replace(/^\((.+)\)$/, "$1").replace(/[,;]$/, "");
  }
  function isChord(tok) {
    if (!tok) return false;
    return CHORD_RE.test(stripParens(tok));
  }
  function expandTabs(line) {
    var out = "";
    for (var i = 0; i < line.length; i++) {
      if (line[i] === "\t") { do { out += " "; } while (out.length % 8); }
      else out += line[i];
    }
    return out;
  }
  function tokens(line) {
    var res = [], re = /\S+/g, m;
    while ((m = re.exec(line))) res.push({ text: m[0], col: m.index });
    return res;
  }
  // Red je akordni samo ako su SVI tokeni akordi (ili dozvoljeni znakovi poput | i x2).
  function isChordLine(line) {
    var toks = tokens(line);
    if (!toks.length) return false;
    var chords = 0, lowerOnly = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].text;
      if (isChord(t)) {
        chords++;
        if (/^[a-h]/.test(stripParens(t))) lowerOnly++;
      } else if (!FILLER_RE.test(t)) return false;
    }
    if (!chords) return false;
    // Mala slova (a, d, e = mol) prihvatamo samo ako red ima barem dva akorda.
    if (lowerOnly && chords < 2) return false;
    return true;
  }
  function hasInlineChords(line) {
    var re = /\[([^\]]+)\]/g, m, any = false;
    while ((m = re.exec(line))) { if (isChord(m[1])) any = true; }
    return any;
  }

  /* Model reda:
     {t:"l", text:"...", chords:[{pos, name}]}  tekst s akordima na pozicijama
     {t:"c", text}                              oznaka dijela / komentar
     {t:"tab", lines:[...]}                     tablatura, doslovno
     {t:"e"}                                    prazan red */
  function lyricFromInline(line, loose) {
    var text = "", chords = [], re = /\[([^\]]*)\]/g, last = 0, m;
    while ((m = re.exec(line))) {
      text += line.slice(last, m.index);
      last = m.index + m[0].length;
      var name = m[1].trim();
      if (!name) continue;
      if (loose && !isChord(name) && !FILLER_RE.test(name)) text += "(" + name + ")";
      else chords.push({ pos: text.length, name: name });
    }
    text += line.slice(last);
    return { t: "l", text: text.replace(/\s+$/, ""), chords: chords };
  }
  function mergeChordLine(chordLine, lyric) {
    var toks = tokens(chordLine), text = lyric.replace(/\s+$/, ""), chords = [];
    for (var i = 0; i < toks.length; i++) {
      var pos = toks[i].col;
      // Akord jedan znak ispred riječi pripada toj riječi.
      if (text[pos] === " " && pos + 1 < text.length && text[pos + 1] !== " " &&
          (i + 1 >= toks.length || toks[i + 1].col > pos + 1)) pos++;
      chords.push({ pos: pos, name: toks[i].text });
    }
    var max = chords.length ? chords[chords.length - 1].pos : 0;
    while (text.length < max) text += " ";
    return { t: "l", text: text, chords: chords };
  }
  function chordOnlyLine(chordLine) {
    var toks = tokens(chordLine), text = "", chords = [];
    for (var i = 0; i < toks.length; i++) {
      if (i > 0) {
        var gap = toks[i].col - (toks[i - 1].col + toks[i - 1].text.length);
        text += new Array(Math.max(1, Math.min(gap, 6)) + 1).join(" ");
      }
      chords.push({ pos: text.length, name: toks[i].text });
    }
    return { t: "l", text: text, chords: chords };
  }
  function cleanLyric(line) {
    // Zagrade koje bi ChordPro protumačio kao akord ili direktivu pretvaramo u obične.
    return line.replace(/\[/g, "(").replace(/\]/g, ")").replace(/^\s*\{/, "(").replace(/\s+$/, "");
  }

  function parseLines(text, loose) {
    var raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n").map(expandTabs);
    var out = [], meta = {}, stats = { inline: 0, over: 0, directives: 0 }, inTab = false, tab = null;
    function pushTab(line) {
      var prev = out[out.length - 1];
      if (prev && prev.t === "tab") prev.lines.push(line); else out.push({ t: "tab", lines: [line] });
    }
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i];
      var d = DIRECTIVE_RE.exec(line);
      if (d) {
        stats.directives++;
        var name = d[1].toLowerCase(), val = (d[2] || "").trim();
        if (name === "sot" || name === "start_of_tab") { inTab = true; tab = { t: "tab", lines: [] }; out.push(tab); }
        else if (name === "eot" || name === "end_of_tab") { inTab = false; tab = null; }
        else if (name === "title" || name === "t") meta.title = val;
        else if (name === "artist" || name === "subtitle" || name === "st") { if (!meta.artist) meta.artist = val; }
        else if (name === "key") meta.key = val;
        else if (name === "capo") meta.capo = val;
        else if (name === "c" || name === "comment" || name === "ci" || name === "comment_italic" || name === "cb" || name === "comment_box") out.push({ t: "c", text: val });
        else if (name === "soc" || name === "start_of_chorus") out.push({ t: "c", text: val || "Refren" });
        else if (name === "sov" || name === "start_of_verse") { if (val) out.push({ t: "c", text: val }); }
        else if (name === "sob" || name === "start_of_bridge") out.push({ t: "c", text: val || "Prelaz" });
        // ostale direktive (eoc, eov, tempo...) preskačemo
        continue;
      }
      if (inTab) { tab.lines.push(line); continue; }
      if (!line.trim()) { out.push({ t: "e" }); continue; }
      if (!loose) { out.push(lyricFromInline(line, false)); continue; }

      var bl = BRACKET_LABEL_RE.exec(line);
      if (bl && !isChord(bl[1]) && !isChordLine(bl[1])) { out.push({ t: "c", text: bl[1].trim() }); continue; }
      var sec = SECTION_RE.exec(line);
      if (sec && !isChordLine(line)) {
        var rest = sec[2];
        if (!rest) { out.push({ t: "c", text: sec[1].replace(/[.:]$/, "") }); continue; }
        if (isChordLine(rest) || hasInlineChords(rest)) {
          out.push({ t: "c", text: sec[1].replace(/[.:]$/, "") });
          line = new Array(line.length - rest.length + 1).join(" ") + rest;
        }
      }
      if (TAB_RE.test(line) && !isChordLine(line)) { pushTab(line); continue; }
      if (hasInlineChords(line)) { stats.inline++; out.push(lyricFromInline(line, true)); continue; }
      if (isChordLine(line)) {
        stats.over++;
        var next = raw[i + 1];
        var mergeable = next != null && next.trim() && !isChordLine(next) && !DIRECTIVE_RE.test(next) &&
          !hasInlineChords(next) && !TAB_RE.test(next) && !BRACKET_LABEL_RE.test(next) &&
          !(SECTION_RE.test(next) && !SECTION_RE.exec(next)[2]);
        if (mergeable) { out.push(mergeChordLine(line, cleanLyric(next))); i++; }
        else out.push(chordOnlyLine(line.replace(/^\s+/, "")));
        continue;
      }
      out.push({ t: "l", text: cleanLyric(line), chords: [] });
    }
    // bez praznih redova na početku i kraju, najviše jedan prazan red zaredom
    var res = [];
    for (var j = 0; j < out.length; j++) {
      if (out[j].t === "e" && (!res.length || res[res.length - 1].t === "e")) continue;
      res.push(out[j]);
    }
    while (res.length && res[res.length - 1].t === "e") res.pop();
    return { lines: res, meta: meta, stats: stats };
  }

  function serializeLine(ln) {
    if (ln.t === "e") return "";
    if (ln.t === "c") return "{c: " + ln.text + "}";
    if (ln.t === "tab") return "{sot}\n" + ln.lines.join("\n") + "\n{eot}";
    var cs = ln.chords.slice().sort(function (a, b) { return a.pos - b.pos; });
    var text = ln.text, out = "", last = 0;
    for (var i = 0; i < cs.length; i++) {
      var p = Math.max(0, cs[i].pos);
      while (text.length < p) text += " ";
      out += text.slice(last, p) + "[" + cs[i].name + "]";
      last = p;
    }
    return out + text.slice(last);
  }
  function serialize(lines) { return lines.map(serializeLine).join("\n"); }

  /** Stroga obrada sačuvanog ChordPro teksta. */
  function parse(chordpro) { return parseLines(chordpro, false).lines; }

  /** Uvoz zalijepljenog teksta: prepoznaje ChordPro, [Am] u tekstu i akorde iznad riječi. */
  function importText(text) {
    var r = parseLines(text, true), meta = r.meta, lines = r.lines;
    // "Izvođač - Naslov" u prvom redu, prije ijednog akorda
    if (!meta.title && lines.length > 1 && lines[0].t === "l" && !lines[0].chords.length && lines[1].t === "e") {
      var m = /^(.{2,60}?)\s+[-–—]\s+(.{2,80})$/.exec(lines[0].text.trim());
      if (m) { meta.artist = meta.artist || m[1].trim(); meta.title = m[2].trim(); lines = lines.slice(2); }
    }
    var format = (r.stats.directives || r.stats.inline > r.stats.over) ? "chordpro" : r.stats.over ? "over" : "plain";
    var chordpro = serialize(lines);
    return { chordpro: chordpro, meta: meta, format: format, hasH: usesH(chordpro), chordCount: listChords(chordpro).length };
  }

  function mapChords(chordpro, fn) {
    var inTab = false;
    return String(chordpro || "").split("\n").map(function (line) {
      var d = DIRECTIVE_RE.exec(line);
      if (d) {
        var n = d[1].toLowerCase();
        if (n === "sot" || n === "start_of_tab") inTab = true;
        if (n === "eot" || n === "end_of_tab") inTab = false;
        return line;
      }
      if (inTab) return line;
      return line.replace(/\[([^\]]*)\]/g, function (all, name) {
        var t = name.trim();
        return isChord(t) ? "[" + fn(t) + "]" : all;
      });
    }).join("\n");
  }
  function listChords(chordpro) {
    var seen = {}, res = [];
    mapChords(chordpro, function (c) { if (!seen[c]) { seen[c] = 1; res.push(c); } return c; });
    return res;
  }
  function usesH(chordpro) {
    return listChords(chordpro).some(function (c) {
      var m = CHORD_RE.exec(stripParens(c));
      return m && (/[Hh]/.test(m[1]) || (m[4] && /[Hh]/.test(m[4])));
    });
  }

  var LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9 };
  var SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var MIXED = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  function noteValue(letter, acc, notation) {
    var l = letter.toLowerCase(), flat = acc === "b" || acc === "♭", sharp = acc === "#" || acc === "♯";
    if (l === "h") return (11 + (sharp ? 1 : flat ? -1 : 0) + 12) % 12;
    if (l === "b") {
      if (flat) return 10; // "Bb" je uvijek B-mol ton, u obje notacije
      return ((notation === "de" ? 10 : 11) + (sharp ? 1 : 0)) % 12;
    }
    return (LETTER[l] + (sharp ? 1 : flat ? -1 : 0) + 12) % 12;
  }
  function noteName(value, style, notation, lower) {
    var table = style === "flat" ? FLAT : style === "sharp" ? SHARP : MIXED, name = table[value];
    if (notation === "de") { if (value === 10) name = "B"; else if (value === 11) name = "H"; }
    return lower ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  }
  function accidentalStyle(chordpro) {
    var sharps = 0, flats = 0;
    listChords(chordpro).forEach(function (c) {
      var m = CHORD_RE.exec(stripParens(c));
      if (!m) return;
      if (m[2] === "#" || m[2] === "♯") sharps++;
      if ((m[2] === "b" || m[2] === "♭")) flats++;
    });
    return sharps && !flats ? "sharp" : flats && !sharps ? "flat" : "mixed";
  }
  function rewriteChord(chord, fnNote) {
    var open = /^\(/.test(chord) && /\)$/.test(chord), core = open ? chord.slice(1, -1) : chord;
    var tail = "", tm = /[,;]$/.exec(core);
    if (tm) { tail = tm[0]; core = core.slice(0, -1); }
    var m = CHORD_RE.exec(core);
    if (!m) return chord;
    var out = fnNote(m[1], m[2]) + m[3] + (m[4] ? "/" + fnNote(m[4], m[5] || "") : "") + tail;
    return open ? "(" + out + ")" : out;
  }
  function transposeChord(chord, semitones, notation, style) {
    var n = ((semitones % 12) + 12) % 12;
    if (!n) return chord;
    return rewriteChord(chord, function (letter, acc) {
      var v = (noteValue(letter, acc, notation) + n) % 12;
      return noteName(v, style || "mixed", notation, letter === letter.toLowerCase());
    });
  }
  function transpose(chordpro, semitones, notation) {
    if (!(((semitones % 12) + 12) % 12)) return chordpro;
    var style = accidentalStyle(chordpro);
    return mapChords(chordpro, function (c) { return transposeChord(c, semitones, notation, style); });
  }
  /** Njemačka u englesku notaciju: H postaje B, a B postaje Bb. Ostalo se ne dira. */
  function germanToEnglishChord(chord) {
    return rewriteChord(chord, function (letter, acc) {
      var lower = letter === letter.toLowerCase(), l = letter.toLowerCase(), out;
      if (l === "h") out = acc === "b" || acc === "♭" ? "Bb" : "B" + acc;
      else if (l === "b") out = acc ? "B" + acc : "Bb";
      else return letter + acc;
      return lower ? out.charAt(0).toLowerCase() + out.slice(1) : out;
    });
  }
  function germanToEnglish(chordpro) { return mapChords(chordpro, germanToEnglishChord); }
  /** Pregled izmjena za potvrdu: [{from, to, count}] */
  function germanToEnglishPreview(chordpro) {
    var counts = {}, order = [];
    mapChords(chordpro, function (c) {
      var to = germanToEnglishChord(c);
      if (to !== c) { if (!counts[c]) { counts[c] = { from: c, to: to, count: 0 }; order.push(c); } counts[c].count++; }
      return c;
    });
    return order.map(function (k) { return counts[k]; });
  }

  /** ChordPro s naslovom i izvođačem, za izvoz jedne pjesme. */
  function exportChordPro(song) {
    var head = [];
    if (song.title) head.push("{title: " + song.title + "}");
    if (song.artist) head.push("{artist: " + song.artist + "}");
    return head.join("\n") + (head.length ? "\n\n" : "") + (song.chordpro || "") + "\n";
  }

  return {
    isChord: isChord, isChordLine: isChordLine, parse: parse, serialize: serialize, importText: importText,
    mapChords: mapChords, listChords: listChords, usesH: usesH, transpose: transpose, transposeChord: transposeChord,
    germanToEnglish: germanToEnglish, germanToEnglishPreview: germanToEnglishPreview, exportChordPro: exportChordPro
  };
});
