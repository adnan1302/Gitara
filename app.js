/* Gitara: lični repertoar. Bez builda i bez vanjskih zavisnosti (PDF.js je u vendor/). */
(function () {
  "use strict";
  var KEY = "gitara-v2";
  var LABELS = { idea: "Ideja", progress: "U toku", refine: "Za doradu", done: "Kolekcija" };
  var DEFAULT_CHIPS = { en: ["C", "D", "Dm", "E", "Em", "F", "G", "A", "Am", "B7"], de: ["C", "D", "Dm", "E", "Em", "F", "G", "A", "Am", "H7"] };
  var SEEDS = window.GITARA_SEEDS || [];

  function $(s) { return document.querySelector(s); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function fold(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  }
  function str(v) { return typeof v === "string" ? v : ""; }

  /* ---------- Pohrana ---------- */
  var state = { v: 2, songs: [], deletedSeeds: [], settings: {}, songDetails: [], removed: {}, orderAt: 0 };
  var startupNotice = "";

  function normalizeSong(s) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !s.id) return null;
    return {
      id: s.id, title: str(s.title) || "Bez naslova", artist: str(s.artist),
      status: LABELS[s.status] ? s.status : "idea", meta: str(s.meta),
      chordpro: str(s.chordpro), original: str(s.original),
      notation: s.notation === "de" ? "de" : "en",
      transpose: Number.isFinite(s.transpose) ? Math.round(s.transpose) % 12 : 0,
      tabUrl: str(s.tabUrl), tutorialUrl: str(s.tutorialUrl),
      updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : 0
    };
  }
  function seedToSong(seed) {
    var s = Object.assign({}, seed);
    if (seed.source) { s.original = seed.source; s.chordpro = Chords.importText(seed.source).chordpro; }
    delete s.source;
    return normalizeSong(s);
  }
  function load() {
    var raw = null, data = null;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { startupNotice = "Preglednik ne dozvoljava pohranu, pa izmjene neće ostati sačuvane nakon zatvaranja."; }
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) { data = null; }
      if (!data || typeof data !== "object" || !Array.isArray(data.songs)) {
        // Neispravan sadržaj ne ruši aplikaciju: sklonimo ga u stranu i krenemo od početnih pjesama.
        try { localStorage.setItem(KEY + "-neispravno-" + Date.now(), raw); } catch (e) { /* nema mjesta */ }
        data = null;
        startupNotice = "Sačuvani podaci su bili neispravni i nisu učitani. Kopija je ostavljena u pohrani preglednika, a lista je vraćena na početne pjesme.";
      }
    }
    if (data) {
      state.songs = data.songs.map(normalizeSong).filter(Boolean);
      state.songDetails = GitaraDetails.merge([], data.songDetails);
      state.deletedSeeds = Array.isArray(data.deletedSeeds) ? data.deletedSeeds.filter(function (x) { return typeof x === "string"; }) : [];
      state.settings = data.settings && typeof data.settings === "object" ? data.settings : {};
      state.removed = data.removed && typeof data.removed === "object" && !Array.isArray(data.removed) ? data.removed : {};
      state.orderAt = Number.isFinite(data.orderAt) ? data.orderAt : 0;
    }
    // Brisanja iz vremena prije sinhronizacije dobijaju zapis o brisanju, da se pjesma ne vrati s drugog uređaja.
    state.deletedSeeds.forEach(function (id) { if (!state.removed[id]) state.removed[id] = 1; });
    if (!state.settings.firstUse) state.settings.firstUse = Date.now();
    // Početne pjesme se samo DODAJU ako nedostaju. Postojeće se nikad ne prepisuju.
    var added = false;
    SEEDS.forEach(function (seed) {
      if (state.deletedSeeds.indexOf(seed.id) >= 0 || state.removed[seed.id]) return;
      if (state.songs.some(function (s) { return s.id === seed.id; })) return;
      var song = seedToSong(seed);
      if (song) { state.songs.push(song); added = true; }
    });
    if (added || !raw) save(true);
  }
  function save(quiet) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!quiet) toast("Nije sačuvano: pohrana preglednika je nedostupna ili puna."); return false; }
    if (!quiet && typeof scheduleSync === "function") scheduleSync(1500);
    return true;
  }
  function findSong(id) { return state.songs.filter(function (s) { return s.id === id; })[0] || null; }

  /* ---------- Sitnice interfejsa ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function openPanel(html) { $("#panelBody").innerHTML = html; $("#panel").hidden = false; $("#backdrop").hidden = false; }
  function closePanel() { document.querySelectorAll("#editSheet .w.sel").forEach(function (x) { x.classList.remove("sel"); }); $("#panel").hidden = true; $("#viewPanel").hidden = true; $("#backdrop").hidden = true; $("#panelBody").innerHTML = ""; panelChord = null; }
  $("#backdrop").addEventListener("click", closePanel);
  function show(view) {
    ["viewList", "viewSong", "viewEdit"].forEach(function (v) { $("#" + v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }
  function deliver(name, text, type) {
    var blob = new Blob([text], { type: type });
    try {
      var file = new File([blob], name, { type: type });
      if (navigator.maxTouchPoints > 0 && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function () { /* korisnik je odustao */ });
        return;
      }
    } catch (e) { /* idemo na obično preuzimanje */ }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function fileSlug(s) { return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pjesma"; }

  /* ---------- Prikaz pjesme s akordima ---------- */
  function sheetHTML(lines, edit) {
    var rows = lines.map(function (ln, li) {
      if (ln.t === "e") return '<div class="ln gap"></div>';
      if (ln.t === "c") return '<div class="ln sec">' + esc(ln.text) + "</div>";
      if (ln.t === "tab") return '<pre class="tabpre">' + esc(ln.lines.join("\n")) + "</pre>";
      var text = ln.text, len = text.length;
      var chords = ln.chords.map(function (c, i) { return { pos: Math.min(c.pos, len), name: c.name, i: i }; });
      var units = [], re = /\S+\s*|\s+/g, m;
      while ((m = re.exec(text))) units.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (!units.length || chords.some(function (c) { return c.pos >= len; })) units.push({ start: len, end: len + 1, text: "" });
      // Akord širi od sloga ispod sebe smije preći preko teksta desno, ako do sljedećeg akorda ima mjesta.
      // Tako riječi ostaju cijele umjesto da se razmaknu.
      var stops = chords.map(function (c) { return c.pos; }).sort(function (a, b) { return a - b; });
      function room(p) { for (var k = 0; k < stops.length; k++) if (stops[k] > p) return stops[k] - p; return len - p; }
      var parts = units.map(function (u) {
        var cs = chords.filter(function (c) { return c.pos >= u.start && c.pos < u.end; }).sort(function (a, b) { return a.pos - b.pos; });
        var cuts = [u.start], glue = false;
        cs.forEach(function (c) { if (cuts.indexOf(c.pos) < 0) cuts.push(c.pos); });
        cuts.sort(function (a, b) { return a - b; });
        var segs = cuts.map(function (p, k) {
          var end = Math.min(k + 1 < cuts.length ? cuts[k + 1] : u.end, len);
          var here = cs.filter(function (c) { return c.pos === p; });
          var width = here.reduce(function (n, c) { return n + c.name.length + 1; }, 0);
          var over = here.length && end - p < width + 1 && room(p) >= width + 2;
          if (over && k === cuts.length - 1) glue = true;
          var ch = here.map(function (c) {
            return edit ? '<button type="button" class="ch" data-l="' + li + '" data-i="' + c.i + '">' + esc(c.name) + "</button>" : "<span>" + esc(c.name) + "</span>";
          }).join("");
          return '<span class="sg' + (over ? " ov" : "") + '"><span class="c">' + ch + '</span><span class="t">' + esc(text.slice(p, end)) + "</span></span>";
        }).join("");
        var isWord = /\S/.test(u.text);
        var html = edit && isWord ? '<span class="w word" role="button" tabindex="0" data-l="' + li + '" data-p="' + u.start + '">' + segs + "</span>" : '<span class="w">' + segs + "</span>";
        return { html: html, glue: glue };
      });
      // Riječ čiji akord prelazi udesno ostaje u istom redu sa sljedećom riječi.
      var html = "", open = 0;
      parts.forEach(function (p, k) {
        if (p.glue && k + 1 < parts.length) { html += '<span class="w">' + p.html; open++; }
        else { html += p.html; while (open) { html += "</span>"; open--; } }
      });
      while (open) { html += "</span>"; open--; }
      return '<div class="ln' + (chords.length ? "" : " nc") + '">' + html + "</div>";
    });
    if (edit) return rows.join("");
    // Za sviranje: dijelovi pjesme su blokovi s oznakom na margini, a refren je izdvojen.
    // Blok je pasus (do praznog reda). Refren je blok s oznakom Refren/Pripjev/Chorus ili, bez oznake, pasus čiji su svi redovi uvučeni.
    var blocks = [], cur = null, labelled = false, pending = "";
    lines.forEach(function (ln, i) {
      if (ln.t === "c") { pending = ln.text; labelled = true; cur = null; return; }
      if (ln.t === "e") { cur = null; return; }
      if (!cur) { cur = { label: pending, ref: /^(ref|prip|chorus)/i.test(pending), rows: [], hc: ln.t === "l" && ln.chords.length > 0, ind: !pending }; pending = ""; blocks.push(cur); }
      if (ln.t !== "l" || !/^\s/.test(ln.text)) cur.ind = false;
      cur.rows.push(rows[i]);
    });
    blocks.forEach(function (b) { if (b.ind) b.ref = true; });
    return blocks.map(function (b) {
      return '<div class="blk' + (b.ref ? " ref" : "") + (b.hc ? " hc" : "") + '">' + (labelled ? '<div class="sec">' + esc(b.label) + "</div>" : "") +
        '<div class="lines">' + b.rows.join("") + "</div></div>";
    }).join("") + (labelled ? "<!--lab-->" : "");
  }

  /* ---------- Početna: tabla „U radu“ i lista „Kolekcija“ ---------- */
  var tab = "work", newStatus = "", menuSong = null;
  var COLUMNS = ["idea", "progress", "refine"];
  var EDGE = ["#ff9a76", "#7ad3c0", "#f4c95d", "#b9a2ff", "#7fb8ff", "#ff8fb1", "#a6d57a", "#f2a65a"];
  function edge(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return EDGE[h % EDGE.length]; }
  function cardHTML(s, withStatus) {
    var meta = [withStatus ? LABELS[s.status] : "", s.meta, s.tabUrl ? "PDF" : ""].filter(Boolean).join(" · ");
    var commentCount = details(s.id).comments.filter(function (c) { return !c.deleted && c.text.trim(); }).length;
    var commentMark = commentCount ? '<span class="comment-mark" role="img" aria-label="Ima komentare" title="Komentari: ' + commentCount + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z"/><path d="M8 8h8M8 12h5"/></svg></span>' : "";
    return '<div class="song cd" role="link" tabindex="0" data-id="' + esc(s.id) + '" style="--k:' + edge(s.id) + '"><span class="cd-main"><span class="song-title">' + labelDot(details(s.id).label) + esc(s.title) +
      "</span>" + (s.artist ? "<small>" + esc(s.artist) + "</small>" : "") + (meta || commentMark ? '<span class="mt">' + (meta ? '<span class="meta-text">' + esc(meta) + "</span>" : "") + commentMark + "</span>" : "") +
      '</span><button type="button" class="grip" aria-label="Premjesti pjesmu ' + esc(s.title) + '">⋮⋮</button></div>';
  }
  function renderList() {
    var q = fold($("#search").value.trim());
    var filter = $("#contentFilter").value;
    var eligible = state.songs.filter(function (s) { var label = details(s.id).label; return filter === "all" || (filter === "none" ? !label : label === filter); });
    var done = eligible.filter(function (s) { return s.status === "done"; });
    $("#tabWork").classList.toggle("on", !q && tab === "work"); $("#tabDone").classList.toggle("on", !q && tab === "done");
    var board = $("#board"), rows = $("#songs"), empty = $("#empty");
    if (q) {
      // Pretraga ide kroz sve pjesme, bez obzira na karticu i kolonu.
      var hits = eligible.filter(function (s) {
        var hay = fold(s.title + " " + s.artist + " " + s.meta + " " + s.chordpro.replace(/\[[^\]]*\]/g, ""));
        return q.split(/\s+/).every(function (word) { return hay.indexOf(word) >= 0; });
      });
      board.hidden = true; board.innerHTML = ""; rows.hidden = false;
      rows.innerHTML = hits.map(function (s) { return cardHTML(s, true); }).join("");
      empty.hidden = hits.length > 0; empty.textContent = "Nijedna pjesma ne odgovara pretrazi.";
    } else if (tab === "done") {
      board.hidden = true; board.innerHTML = ""; rows.hidden = false;
      rows.innerHTML = done.map(function (s) { return cardHTML(s, false); }).join("");
      empty.hidden = done.length > 0; empty.textContent = filter === "all" ? "Kolekcija je još prazna. Premjesti pjesmu ovdje kad je naučiš." : "Nema pjesama s ovom oznakom u Kolekciji.";
    } else {
      rows.hidden = true; rows.innerHTML = ""; empty.hidden = true; board.hidden = false;
      empty.hidden = filter === "all" || eligible.some(function (s) { return s.status !== "done"; });
      empty.textContent = "Nema pjesama s ovom oznakom u radu.";
      board.innerHTML = COLUMNS.map(function (st) {
        var list = eligible.filter(function (s) { return s.status === st; });
        return '<section class="col" data-status="' + st + '"><div class="colh"><b>' + LABELS[st] + "</b><span>" + list.length +
          '</span><button type="button" class="btn" data-new="' + st + '" aria-label="Dodaj pjesmu u kolonu ' + LABELS[st] + '">+</button></div><div class="cards">' +
          list.map(function (s) { return cardHTML(s, false); }).join("") + "</div></section>";
      }).join("");
    }
    var msg = [startupNotice, syncNotice(), backupReminder()].filter(Boolean).join(" ");
    var n = $("#notice"); n.hidden = !msg; n.textContent = msg;
  }
  function homeTab(t) { tab = t; $("#search").value = ""; renderList(); window.scrollTo(0, 0); }
  $("#tabWork").addEventListener("click", function () { homeTab("work"); });
  $("#tabDone").addEventListener("click", function () { homeTab("done"); });

  /* Premještanje: meni na ručki kartice (radi svuda) i povlačenje (miš cijelom karticom, prst za ručku). */
  function moveSong(id, status, beforeId) {
    var song = findSong(id); if (!song || !LABELS[status]) return;
    var changed = song.status !== status;
    state.songs.splice(state.songs.indexOf(song), 1);
    song.status = status; if (changed) song.updatedAt = Date.now();
    state.orderAt = Date.now();
    var at = -1;
    if (beforeId) at = state.songs.indexOf(findSong(beforeId));
    if (at < 0) { for (var i = state.songs.length - 1; i >= 0; i--) if (state.songs[i].status === status) { at = i + 1; break; } }
    if (at < 0) at = state.songs.length;
    state.songs.splice(at, 0, song);
    save(); renderList();
    return changed;
  }
  function moveMenu(song) {
    menuSong = song;
    openPanel("<h3>" + esc(song.title) + '</h3><p class="hint">Premjesti u:</p><div class="menu">' + Object.keys(LABELS).map(function (k) {
      return '<button type="button" class="btn' + (k === song.status ? " active" : "") + '" data-act="move" data-status="' + k + '"' + (k === song.status ? " disabled" : "") + ">" + LABELS[k] + (k === song.status ? " (sada)" : "") + "</button>";
    }).join("") + "</div>" + labelOptions(song) + '<button type="button" class="btn" data-act="close">Zatvori</button>');
  }
  var drag = null, dragTimer = 0, skipClick = false;
  function dragStart() {
    var card = drag.card, r = card.getBoundingClientRect();
    drag.active = true; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
    var ghost = card.cloneNode(true); ghost.classList.add("ghost"); ghost.removeAttribute("tabindex");
    ghost.style.width = r.width + "px"; ghost.style.height = r.height + "px";
    document.body.appendChild(ghost); drag.ghost = ghost;
    var slot = document.createElement("div"); slot.className = "slot"; slot.style.height = r.height + "px";
    card.parentNode.insertBefore(slot, card); drag.slot = slot;
    card.classList.add("lifted"); document.body.classList.add("dragging");
    dragTimer = setInterval(dragScroll, 16);
  }
  function dragScroll() {
    if (!drag || !drag.active) return;
    var b = $("#board"), r = b.getBoundingClientRect(), x = drag.x, y = drag.y, m = 48;
    if (b.scrollWidth > b.clientWidth + 1) {
      if (x < r.left + m) b.scrollLeft -= 10; else if (x > r.right - m) b.scrollLeft += 10;
    }
    if (y < m + 60) window.scrollBy(0, -10); else if (y > window.innerHeight - m) window.scrollBy(0, 10);
    dragPlace();
  }
  function dragPlace() {
    var el = document.elementFromPoint(drag.x, drag.y), slot = drag.slot;
    var overDone = !!(el && el.closest("#tabDone"));
    $("#tabDone").classList.toggle("drop", overDone);
    drag.toDone = overDone; slot.hidden = overDone;
    var col = el && el.closest(".col"); if (!col) return;
    var box = col.querySelector(".cards"), next = null;
    Array.prototype.some.call(box.querySelectorAll(".cd:not(.lifted)"), function (c) {
      var cr = c.getBoundingClientRect();
      if (drag.y < cr.top + cr.height / 2) { next = c; return true; }
      return false;
    });
    if (next) { if (slot.nextElementSibling !== next || slot.parentNode !== box) box.insertBefore(slot, next); }
    else if (box.lastElementChild !== slot) box.appendChild(slot);
  }
  function dragEnd(apply) {
    var d = drag; drag = null;
    clearInterval(dragTimer);
    if (!d || !d.active) return;
    skipClick = true; setTimeout(function () { skipClick = false; }, 0);
    var status = null, before = null;
    if (apply) {
      if (d.toDone) status = "done";
      else {
        status = d.slot.closest(".col").dataset.status;
        var n = d.slot.nextElementSibling; while (n && n.classList.contains("lifted")) n = n.nextElementSibling;
        before = n ? n.dataset.id : null;
      }
    }
    d.ghost.remove(); document.body.classList.remove("dragging"); $("#tabDone").classList.remove("drop");
    if (status) { if (moveSong(d.id, status, before) && status === "done") toast("Premješteno u Kolekciju."); }
    else renderList();
  }
  $("#board").addEventListener("pointerdown", function (e) {
    var card = e.target.closest(".cd"); if (!card || e.button || drag) return;
    var grip = !!e.target.closest(".grip");
    if (e.pointerType !== "mouse" && !grip) return; // prst na kartici lista stranicu; povlači se za ručku
    drag = { id: card.dataset.id, card: card, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active) { if (Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) < 8) return; dragStart(); }
    drag.ghost.style.left = (drag.x - drag.dx) + "px"; drag.ghost.style.top = (drag.y - drag.dy) + "px";
    dragPlace();
  });
  document.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.pid) dragEnd(true); });
  document.addEventListener("pointercancel", function (e) { if (drag && e.pointerId === drag.pid) dragEnd(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drag) dragEnd(false); });
  document.addEventListener("touchmove", function (e) { if (drag && drag.active) e.preventDefault(); }, { passive: false });

  function listTap(e) {
    if (skipClick) return;
    var add = e.target.closest("[data-new]");
    if (add) { newStatus = add.dataset["new"]; location.hash = "#/nova"; return; }
    var card = e.target.closest(".cd[data-id]"); if (!card) return;
    if (e.target.closest(".grip")) { var s = findSong(card.dataset.id); if (s) moveMenu(s); return; }
    location.hash = "#/p/" + encodeURIComponent(card.dataset.id);
  }
  $("#board").addEventListener("click", listTap);
  $("#songs").addEventListener("click", listTap);
  $("#viewList").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.classList.contains("cd")) location.hash = "#/p/" + encodeURIComponent(e.target.dataset.id);
  });
  $("#search").addEventListener("input", renderList);
  $("#contentFilter").addEventListener("change", renderList);
  $("#btnNew").addEventListener("click", function () { newStatus = ""; location.hash = "#/nova"; });

  function applyTheme() {
    var light = state.settings.theme !== "dark";
    document.documentElement.dataset.theme = light ? "light" : "dark";
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = light ? "#dfe1df" : "#232425";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-label", light ? "Uključi tamni mod" : "Uključi svijetli mod");
      button.setAttribute("aria-pressed", light ? "false" : "true");
    });
  }
  function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applyTheme(); save(true);
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (button) { button.addEventListener("click", toggleTheme); });

  /* ---------- Podaci: izvoz i uvoz ---------- */
  $("#btnMenu").addEventListener("click", function () {
    openPanel('<div class="menu"><button type="button" class="btn" data-act="theme">' + (state.settings.theme !== "dark" ? "Tamna tema" : "Svijetla tema") + "</button>" +
      '<button type="button" class="btn" data-act="sync">Sinhronizacija: ' + esc(syncLabel()) + "</button>" +
      '<button type="button" class="btn" data-act="import">Uvezi iz fajla (.json, .cho, .txt)</button>' +
      '<button type="button" class="btn" data-act="export">Izvezi sve pjesme (.json)</button>' +
      (state.deletedSeeds.length ? '<button type="button" class="btn" data-act="restore">Vrati obrisane početne pjesme (' + state.deletedSeeds.length + ")</button>" : "") +
      '</div><p class="hint">' + (syncCfg() ? "Pjesme se čuvaju na ovom uređaju i u tvom GitHub repou " + esc(syncCfg().owner + "/" + syncCfg().repo) + ". Svaka izmjena ostaje kao verzija u historiji repoa." :
        "Pjesme se čuvaju samo u ovom pregledniku na ovom uređaju. Poveži GitHub ili ih povremeno izvezi kao rezervnu kopiju.") + "</p>" +
      '<div class="menu"><button type="button" class="btn" data-act="close">Zatvori</button></div>');
  });
  /* ---------- Oznake sadržaja i komentari (nezavisni od statusa učenja) ---------- */
  var CONTENT_LABELS = { red: "Nedostaje / nije dobro", yellow: "Treba doradu", "": "Bez oznake" };
  function details(id) { return state.songDetails.find(function (d) { return d.id === id; }) || { id: id, label: "", labelAt: 0, comments: [] }; }
  function labelDot(label, decorative) {
    return label ? '<span class="content-dot ' + label + '" ' + (decorative ? 'aria-hidden="true"' : 'role="img" aria-label="' + CONTENT_LABELS[label] + '"') + ' title="' + CONTENT_LABELS[label] + '"></span>' : "";
  }
  function labelOptions(song) {
    var selected = details(song.id).label;
    return '<h3 class="label-heading">Oznaka sadržaja</h3><p class="hint">Za tekst, akorde ili tablaturu. Ne mijenja status pjesme.</p><div class="menu">' + ["red", "yellow", ""].map(function (label) {
      return '<button type="button" class="btn" data-act="content-label" data-label="' + label + '" aria-pressed="' + (selected === label) + '">' + labelDot(label, true) + CONTENT_LABELS[label] + (selected === label ? " ✓" : "") + '</button>';
    }).join("") + "</div>";
  }
  function commitDetails(d) {
    var before = state.songDetails;
    state.songDetails = GitaraDetails.merge(state.songDetails, [d]);
    if (!save()) { state.songDetails = before; return false; }
    updateDetailsUI(); return true;
  }
  function setContentLabel(label) {
    if (!menuSong || !Object.prototype.hasOwnProperty.call(CONTENT_LABELS, label)) return;
    var d = JSON.parse(JSON.stringify(details(menuSong.id)));
    d.label = label; d.labelAt = Math.max(Date.now(), d.labelAt + 1);
    if (commitDetails(d)) { closePanel(); renderList(); toast(label ? "Oznaka je sačuvana." : "Oznaka je uklonjena."); }
  }
  function updateDetailsUI() {
    if (!current) return;
    var d = details(current.id), count = d.comments.filter(function (c) { return !c.deleted; }).length;
    $("#songLabel").innerHTML = labelDot(d.label) || '<span aria-hidden="true">⚑</span>';
    $("#songLabel").setAttribute("aria-label", "Oznaka sadržaja: " + CONTENT_LABELS[d.label]);
    $("#commentsCount").textContent = count || "";
    $("#commentsToggle").setAttribute("aria-label", "Komentari" + (count ? " (" + count + ")" : ""));
    if (!$("#commentsPanel").hidden) renderComments();
  }
  $("#songLabel").addEventListener("click", function () { menuSong = current; openPanel(labelOptions(current) + '<button type="button" class="btn" data-act="close">Zatvori</button>'); });
  function commentDate(t) {
    var d = new Date(t); function pad(n) { return ("0" + n).slice(-2); }
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + ". · " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function renderComments() {
    if (!current) return;
    var list = details(current.id).comments.filter(function (c) { return !c.deleted; }).sort(function (a, b) { return b.createdAt - a.createdAt || a.id.localeCompare(b.id); });
    $("#commentsSong").textContent = current.title;
    $("#commentsList").innerHTML = list.length ? list.map(function (c) {
      return '<article class="comment"><p>' + esc(c.text) + '</p><div class="comment-meta"><time>' + esc(commentDate(c.createdAt)) + '</time><button type="button" class="btn" data-delete-comment="' + esc(c.id) + '" aria-label="Obriši komentar">Obriši</button></div></article>';
    }).join("") : '<p class="hint">Ovdje zapiši šta želiš popraviti ili uvježbati.</p>';
  }
  function closeComments(focus) {
    $("#commentsPanel").hidden = true;
    $("#commentsToggle").setAttribute("aria-expanded", "false");
    if (focus) $("#commentsToggle").focus();
  }
  $("#commentsToggle").addEventListener("click", function () {
    if (!$("#commentsPanel").hidden) { closeComments(true); return; }
    asStop(); closePanel(); $("#commentsPanel").hidden = false;
    $("#commentsToggle").setAttribute("aria-expanded", "true");
    $("#commentText").value = (state.settings.commentDrafts || {})[current.id] || "";
    renderComments(); $("#commentsClose").focus();
  });
  $("#commentsClose").addEventListener("click", function () { closeComments(true); });
  $("#commentText").addEventListener("input", function () {
    if (!current) return;
    if (!state.settings.commentDrafts) state.settings.commentDrafts = {};
    state.settings.commentDrafts[current.id] = this.value; save(true);
  });
  $("#commentForm").addEventListener("submit", function (e) {
    e.preventDefault(); if (!current) return;
    var text = $("#commentText").value.trim(); if (!text) { $("#commentText").focus(); return; }
    var d = JSON.parse(JSON.stringify(details(current.id))), now = Date.now();
    d.comments.push({ id: uid(), text: text, createdAt: now, updatedAt: now, deleted: false });
    if (commitDetails(d)) { $("#commentText").value = ""; if (state.settings.commentDrafts) delete state.settings.commentDrafts[current.id]; save(true); $("#commentText").focus(); }
  });
  $("#commentsList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-delete-comment]"); if (!b || !current) return;
    var d = JSON.parse(JSON.stringify(details(current.id))), c = d.comments.find(function (x) { return x.id === b.dataset.deleteComment; });
    if (c) { c.deleted = true; c.updatedAt = Math.max(Date.now(), c.updatedAt + 1); commitDetails(d); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!$("#commentsPanel").hidden) closeComments(true); else closePanel(); } });

  // Poseban fajl štiti nove dopune od starije produkcijske aplikacije.
  function syncDetails(cfg) {
    var gh = GitaraSync.client(Object.assign({}, cfg, { path: "oznake-komentari.json" }), { api: cfg.api });
    function attempt(tries) {
      return gh.read().then(function (r) {
        if (r.doc && r.doc.app !== "gitara-details") throw new Error("Fajl oznake-komentari.json ima drugi format; nije promijenjen.");
        var merged = GitaraDetails.merge(state.songDetails, r.doc && r.doc.songs);
        state.songDetails = merged; if (!save(true)) throw new Error("Dopune nisu sačuvane na uređaju.");
        updateDetailsUI();
        if (r.doc && JSON.stringify(merged) === JSON.stringify(GitaraDetails.merge([], r.doc.songs))) return;
        if (!r.doc && !merged.length) return;
        return gh.write({ app: "gitara-details", v: 1, songs: merged }, r.sha, "Gitara: oznake i komentari").catch(function (e) {
          if (e.kind === "conflict" && tries > 0) return attempt(tries - 1);
          throw e;
        });
      });
    }
    return attempt(3);
  }

  function exportAll() {
    var d = new Date(), stamp = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    state.settings.lastExport = Date.now(); save(true);
    deliver("gitara-pjesme-" + stamp + ".json", JSON.stringify({ app: "gitara", v: 2, exportedAt: d.toISOString(), songs: state.songs, songDetails: state.songDetails }, null, 2), "application/json");
  }
  function mergeSongs(list, extra) {
    state.songDetails = GitaraDetails.merge(state.songDetails, extra);
    var added = 0, updated = 0, skipped = 0;
    list.forEach(function (rawSong) {
      var s = normalizeSong(rawSong);
      if (!s) { skipped++; return; }
      // Uvezena pjesma je namjerno vraćena, pa poništava ranije brisanje.
      if (state.removed[s.id]) { s.updatedAt = Math.max(s.updatedAt, state.removed[s.id] + 1); delete state.removed[s.id]; }
      var cur = findSong(s.id);
      if (!cur) { state.songs.unshift(s); state.orderAt = Date.now(); added++; }
      else if (s.updatedAt > cur.updatedAt) { state.songs[state.songs.indexOf(cur)] = s; updated++; }
      else skipped++;
      var di = state.deletedSeeds.indexOf(s.id); if (di >= 0) state.deletedSeeds.splice(di, 1);
    });
    save(); renderList();
    toast("Uvoz: " + added + " novih, " + updated + " ažuriranih, " + skipped + " preskočenih.");
  }
  $("#importFile").addEventListener("change", function () {
    var file = this.files && this.files[0]; this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast("Fajl se nije mogao pročitati."); };
    reader.onload = function () {
      var text = String(reader.result || ""), data = null;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      var list = Array.isArray(data) ? data : data && Array.isArray(data.songs) ? data.songs : null;
      if (list) { mergeSongs(list, data && data.songDetails); return; }
      if (data !== null && /\.json$/i.test(file.name)) { toast("Ovaj JSON ne sadrži listu pjesama."); return; }
      pendingImport = { text: text, name: file.name.replace(/\.[^.]+$/, "") };
      if (location.hash === "#/nova") route(); else location.hash = "#/nova";
    };
    reader.readAsText(file);
  });
  var pendingImport = null;

  /* ---------- Sviranje ---------- */
  var current = null, songView = "text";
  function applyFont() {
    if (state.settings.readerTypography !== 1) {
      if (!Number(state.settings.fontSize) || Number(state.settings.fontSize) === 18) state.settings.fontSize = 16;
      state.settings.readerTypography = 1;
      save(true);
    }
    var fs = Math.max(14, Math.min(44, Number(state.settings.fontSize) || 16));
    state.settings.fontSize = fs;
    document.documentElement.style.setProperty("--fs", fs + "px");
    $("#fontVal").textContent = fs;
  }
  function renderSong() {
    var s = current;
    updateDetailsUI();
    $("#songTitle").textContent = s.title;
    $("#songArtist").textContent = s.artist; $("#songArtist").hidden = !s.artist;
    $("#songMeta").textContent = [LABELS[s.status], s.meta].filter(Boolean).join(" · ");
    var hasChords = Chords.listChords(s.chordpro).length > 0;
    $("#transGroup").hidden = !hasChords;
    var t = s.transpose || 0;
    $("#transVal").textContent = t > 0 ? "+" + t : String(t);
    var views = "";
    if (s.tabUrl) views += '<button type="button" class="btn' + (songView === "text" ? " active" : "") + '" data-view="text">Bilješke</button><button type="button" class="btn' + (songView === "tab" ? " active" : "") + '" data-view="tab">Tablatura</button>';
    if (s.tutorialUrl) views += '<a class="btn" href="' + esc(s.tutorialUrl) + '" target="_blank" rel="noopener">Tutorial ↗</a>';
    $("#songViews").innerHTML = views; $("#songViews").hidden = !views;
    var showTab = songView === "tab" && s.tabUrl;
    $("#songSheet").hidden = !!showTab; $("#pdfWrap").hidden = !showTab;
    if (showTab) { if (currentTabUrl !== s.tabUrl || !pdfDoc) loadPdf(s.tabUrl); else renderPdf(true); }
    else {
      exitViewerFullscreen();
      var body = s.chordpro.trim() ? sheetHTML(Chords.parse(Chords.transpose(s.chordpro, t, s.notation)), false) : '<p class="hint">Pjesma još nema teksta. U meniju ⋯ izaberi Uredi i zalijepi ga.</p>';
      $("#songSheet").classList.toggle("lab", body.slice(-12) === "<!--lab-->");
      $("#songSheet").innerHTML = body;
    }
  }
  $("#songViews").addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]"); if (!b) return;
    songView = b.dataset.view; asStop(); renderSong();
  });
  $("#songBack").addEventListener("click", function () { location.hash = ""; });

  /* ---------- Automatsko listanje ----------
     Brzina 1–10; pamti se po pjesmi samo na ovom uređaju (ne ide u sinhronizaciju).
     Dok je prst na ekranu, listanje stoji, pa se može ručno vratiti ili preskočiti dio. */
  var AS_PX = [6, 9, 12, 16, 20, 25, 31, 38, 46, 56]; // piksela u sekundi za brzine 1–10
  var asOn = false, asRaf = 0, asLast = 0, asCarry = 0, asHold = false;
  function asSpeed() {
    var m = state.settings.scrollSpeed || {}, v = current && m[current.id];
    return typeof v === "number" && v >= 1 && v <= 10 ? v : 4;
  }
  function asTarget() { return songView === "tab" && current && current.tabUrl ? $("#pdfPages") : null; }
  function asUI() {
    var box = $("#autoScroll"), t = $("#asToggle");
    box.classList.toggle("on", asOn);
    t.setAttribute("aria-pressed", asOn ? "true" : "false");
    t.setAttribute("aria-label", asOn ? "Zaustavi automatsko listanje" : "Pokreni automatsko listanje");
    $("#asVal").textContent = asSpeed();
  }
  function asStep(now) {
    if (!asOn) return;
    var dt = asLast ? Math.min(now - asLast, 100) : 0; asLast = now;
    if (!asHold && dt) {
      asCarry += AS_PX[asSpeed() - 1] * dt / 1000;
      var px = Math.floor(asCarry);
      if (px >= 1) {
        asCarry -= px;
        var box = asTarget();
        if (box) {
          if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) { asStop(); return; }
          box.scrollTop += px;
        } else {
          var root = document.scrollingElement || document.documentElement;
          if (window.scrollY + window.innerHeight >= root.scrollHeight - 1) { asStop(); return; }
          window.scrollBy(0, px);
        }
      }
    }
    asRaf = requestAnimationFrame(asStep);
  }
  function asStart() {
    if (!current) return;
    asOn = true; asLast = 0; asCarry = 0; asHold = false; asUI();
    cancelAnimationFrame(asRaf); asRaf = requestAnimationFrame(asStep);
  }
  function asStop() { asOn = false; cancelAnimationFrame(asRaf); asRaf = 0; asUI(); }
  function asSetSpeed(d) {
    if (!current) return;
    var v = Math.max(1, Math.min(10, asSpeed() + d));
    state.settings.scrollSpeed = state.settings.scrollSpeed || {};
    state.settings.scrollSpeed[current.id] = v;
    save(true); asUI();
  }
  $("#asToggle").addEventListener("click", function () { if (asOn) asStop(); else asStart(); });
  $("#asSlower").addEventListener("click", function () { asSetSpeed(-1); });
  $("#asFaster").addEventListener("click", function () { asSetSpeed(1); });
  // Prst na tekstu zaustavlja kretanje dok se ne podigne; dodir na kontrolama se ne računa.
  document.addEventListener("touchstart", function (e) { if (asOn && !e.target.closest("#autoScroll")) asHold = true; }, { passive: true });
  ["touchend", "touchcancel"].forEach(function (ev) { document.addEventListener(ev, function () { asHold = false; asLast = 0; }, { passive: true }); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState !== "visible") asStop(); });
  $("#btnView").addEventListener("click", function () { $("#viewPanel").hidden = false; $("#backdrop").hidden = false; });
  $("#viewPanelClose").addEventListener("click", closePanel);
  $("#songMenu").addEventListener("click", function () {
    openPanel('<div class="menu"><button type="button" class="btn" data-act="edit">Uredi pjesmu</button>' +
      '<button type="button" class="btn" data-act="label-menu">Oznaka sadržaja</button>' +
      '<button type="button" class="btn" data-act="export-song">Izvezi pjesmu (.cho)</button>' +
      '<button type="button" class="btn danger" data-act="delete-song">Obriši pjesmu</button>' +
      '<button type="button" class="btn" data-act="close">Zatvori</button></div>');
  });
  /* Skrivanje kontrola tokom sviranja */
  function setImmersive(on) {
    document.body.classList.toggle("immersive", !!on);
    $("#showControls").hidden = !on;
  }
  $("#hideControls").addEventListener("click", function () { closePanel(); setImmersive(true); });
  $("#showControls").addEventListener("click", function () { setImmersive(false); });
  function deleteSong(song) {
    if (!window.confirm("Obrisati pjesmu „" + song.title + "“? Ovo se ne može poništiti.")) return;
    var id = song.id;
    state.songs = state.songs.filter(function (s) { return s.id !== id; });
    state.removed[id] = Date.now(); state.orderAt = Date.now();
    if (SEEDS.some(function (s) { return s.id === id; }) && state.deletedSeeds.indexOf(id) < 0) state.deletedSeeds.push(id);
    save(); toast("Pjesma je obrisana.");
    location.hash = ""; route();
  }
  $("#fontDown").addEventListener("click", function () { state.settings.fontSize = (state.settings.fontSize || 16) - 2; applyFont(); save(true); });
  $("#fontUp").addEventListener("click", function () { state.settings.fontSize = (state.settings.fontSize || 16) + 2; applyFont(); save(true); });
  function setTranspose(v) {
    if (!current) return;
    current.transpose = ((v + 6) % 12 + 12) % 12 - 6; // raspon od -6 do +5
    save(true); renderSong();
  }
  $("#transDown").addEventListener("click", function () { setTranspose((current.transpose || 0) - 1); });
  $("#transUp").addEventListener("click", function () { setTranspose((current.transpose || 0) + 1); });
  $("#transVal").addEventListener("click", function () { setTranspose(0); });

  /* Ekran ostaje upaljen dok je pjesma otvorena (Screen Wake Lock). */
  var wakeLock = null, wakeWanted = false;
  var wakeSupported = "wakeLock" in navigator;
  function updateWakeUI() {
    var b = $("#wakeBtn");
    if (!wakeSupported) { b.textContent = "Nije podržano"; b.disabled = true; return; }
    b.classList.toggle("active", !!wakeLock);
    b.setAttribute("aria-pressed", wakeLock ? "true" : "false");
    b.textContent = wakeLock ? "Uključeno" : "Isključeno";
  }
  function acquireWake() {
    if (!wakeSupported || wakeLock || document.visibilityState !== "visible") { updateWakeUI(); return; }
    navigator.wakeLock.request("screen").then(function (lock) {
      if (!wakeWanted) { lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener("release", function () { if (wakeLock === lock) wakeLock = null; updateWakeUI(); });
      updateWakeUI();
    }).catch(function () { wakeLock = null; updateWakeUI(); });
  }
  function releaseWake() {
    wakeWanted = false;
    if (wakeLock) { var l = wakeLock; wakeLock = null; l.release().catch(function () {}); }
    updateWakeUI();
  }
  $("#wakeBtn").addEventListener("click", function () {
    if (wakeLock) { state.settings.keepAwake = false; releaseWake(); }
    else { state.settings.keepAwake = true; wakeWanted = true; acquireWake(); }
    save(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && wakeWanted && !wakeLock) acquireWake();
  });

  /* ---------- PDF tablatura (PDF.js iz vendor/, učitava se tek kad zatreba) ---------- */
  var pdfDoc = null, pdfZoom = 1, fitScale = 1, currentTabUrl = null, pdfLib = null;
  function savedPdfZoom(url) {
    var value = state.settings.pdfZoom && state.settings.pdfZoom[url];
    return typeof value === "number" && Number.isFinite(value) && value >= .5 && value <= 3 ? value : 1;
  }
  function setPdfZoom(value, refit) {
    pdfZoom = Math.max(.5, Math.min(3, Math.round(value * 100) / 100));
    if (currentTabUrl) {
      if (!state.settings.pdfZoom || typeof state.settings.pdfZoom !== "object" || Array.isArray(state.settings.pdfZoom)) state.settings.pdfZoom = {};
      state.settings.pdfZoom[currentTabUrl] = pdfZoom;
      save(true);
    }
    renderPdf(!!refit);
  }
  function loadPdfLib() {
    if (pdfLib) return pdfLib;
    pdfLib = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "vendor/pdfjs/pdf.min.js";
      s.onload = function () {
        if (!window.pdfjsLib) return reject(new Error("pdfjsLib"));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { pdfLib = null; reject(new Error("pdf.js")); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  function loadPdf(url) {
    currentTabUrl = url; pdfDoc = null; pdfZoom = savedPdfZoom(url); renderToken++;
    $("#pdfPages").innerHTML = '<div class="pdf-loading">Učitavanje tablature…</div>';
    loadPdfLib().then(function (lib) { return lib.getDocument(url).promise; }).then(function (doc) {
      if (currentTabUrl !== url) return;
      pdfDoc = doc; return renderPdf(true);
    }).catch(function () {
      $("#pdfPages").innerHTML = '<div class="pdf-loading">Nisam uspio prikazati PDF. <a href="' + esc(url) + '" target="_blank" rel="noopener">Otvori ga direktno</a>.</div>';
    });
  }
  var renderToken = 0;
  async function renderPdf(fit) {
    if (!pdfDoc) return;
    var token = ++renderToken, doc = pdfDoc, box = $("#pdfPages"), scrollTop = box.scrollTop;
    var first = await doc.getPage(1), base = first.getViewport({ scale: 1 });
    if (token !== renderToken) return;
    if (fit) fitScale = Math.max(.2, (box.clientWidth - 20) / base.width);
    var scale = fitScale * pdfZoom, ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    $("#zoomLabel").textContent = Math.round(pdfZoom * 100) + "%";
    var frag = document.createDocumentFragment();
    for (var n = 1; n <= doc.numPages; n++) {
      var page = await doc.getPage(n), vp = page.getViewport({ scale: scale }), canvas = document.createElement("canvas");
      if (token !== renderToken) return;
      canvas.className = "pdf-page";
      canvas.width = Math.floor(vp.width * ratio); canvas.height = Math.floor(vp.height * ratio);
      canvas.style.width = vp.width + "px"; canvas.style.height = vp.height + "px";
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
      if (token !== renderToken) return;
      frag.appendChild(canvas);
    }
    box.innerHTML = ""; box.appendChild(frag);
    box.scrollTop = fit ? 0 : scrollTop;
  }
  function exitViewerFullscreen() {
    $("#pdfWrap").classList.remove("viewer-fullscreen");
    $("#fullscreenBtn").textContent = "Cijeli ekran";
  }
  $("#fullscreenBtn").addEventListener("click", function () {
    var on = $("#pdfWrap").classList.toggle("viewer-fullscreen");
    this.textContent = on ? "Izađi" : "Cijeli ekran";
    setTimeout(function () { renderPdf(true); }, 80);
  });
  $("#zoomIn").addEventListener("click", function () { setPdfZoom(pdfZoom + .2, false); });
  $("#zoomOut").addEventListener("click", function () { setPdfZoom(pdfZoom - .2, false); });
  $("#zoomFit").addEventListener("click", function () { setPdfZoom(1, true); });
  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (!$("#pdfWrap").hidden && !$("#viewSong").hidden) renderPdf(true); }, 250);
  });

  /* ---------- Dodavanje i uređivanje ---------- */
  var draft = null, draftIsNew = false, draftSnapshot = "", undoStack = [], editTab = "paste", hKeep = false, lastImport = "", panelChord = null;
  function snapshot() { return JSON.stringify([draft.title, draft.artist, draft.status, draft.meta, draft.notation, draft.chordpro, draft.original]); }
  function isDirty() { return !!draft && snapshot() !== draftSnapshot; }
  function readFields() {
    draft.title = $("#fTitle").value.trim(); draft.artist = $("#fArtist").value.trim();
    draft.status = $("#fStatus").value; draft.meta = $("#fMeta").value.trim(); draft.notation = $("#fNotation").value;
    draft.original = $("#fOriginal").value;
    if (editTab === "text") draft.chordpro = $("#fChordpro").value.replace(/\r\n?/g, "\n");
  }
  function writeFields() {
    $("#fTitle").value = draft.title; $("#fArtist").value = draft.artist; $("#fStatus").value = draft.status;
    $("#fMeta").value = draft.meta; $("#fNotation").value = draft.notation; $("#fOriginal").value = draft.original;
  }
  function startEdit(song) {
    draftIsNew = !song;
    draft = song ? JSON.parse(JSON.stringify(song)) : { id: uid(), title: "", artist: "", status: LABELS[newStatus] ? newStatus : "progress", meta: "", chordpro: "", original: "", notation: "en", transpose: 0, tabUrl: "", tutorialUrl: "", updatedAt: 0 };
    newStatus = "";
    undoStack = []; hKeep = false; lastImport = "";
    $("#fStatus").innerHTML = Object.keys(LABELS).map(function (k) { return '<option value="' + k + '">' + LABELS[k] + "</option>"; }).join("");
    $("#editHeading").textContent = draftIsNew ? "Nova pjesma" : "Uređivanje";
    writeFields();
    draftSnapshot = snapshot();
    if (draftIsNew && pendingImport) {
      draft.original = pendingImport.text; draft.title = pendingImport.name; pendingImport = null;
      writeFields(); setTab("paste"); convert();
    } else setTab(draftIsNew ? "paste" : draft.chordpro.trim() || !draft.original.trim() ? "preview" : "paste");
  }
  function setTab(tab) {
    if (draft && editTab === "text") draft.chordpro = $("#fChordpro").value.replace(/\r\n?/g, "\n");
    editTab = tab;
    document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    $("#tabPaste").hidden = tab !== "paste"; $("#tabPreview").hidden = tab !== "preview"; $("#tabText").hidden = tab !== "text";
    if (tab === "text") $("#fChordpro").value = draft.chordpro;
    if (tab === "preview") renderEdit();
  }
  document.querySelector(".tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab);
  });
  function pushUndo() { undoStack.push(draft.chordpro); if (undoStack.length > 50) undoStack.shift(); }
  function renderEdit() {
    var lines = Chords.parse(draft.chordpro);
    $("#editSheet").innerHTML = lines.length ? sheetHTML(lines, true) : '<p class="hint">Još nema teksta. Zalijepi ga na kartici „1. Zalijepi“ ili ga upiši na kartici „Tekst“.</p>';
    $("#undoBtn").disabled = !undoStack.length;
    var banner = $("#hBanner"), changes = !hKeep && Chords.usesH(draft.chordpro) ? Chords.germanToEnglishPreview(draft.chordpro) : [];
    banner.hidden = !changes.length;
    if (changes.length) {
      banner.innerHTML = "<strong>Pjesma koristi H (njemačka notacija).</strong> Akorde nisam mijenjao. Ako želiš englesku notaciju, ovo bi se promijenilo:" +
        '<div class="changes">' + changes.map(function (c) { return esc(c.from) + " → " + esc(c.to) + " (" + c.count + "×)"; }).join(", ") + "</div>" +
        '<div class="row" style="margin:0"><button type="button" class="btn" id="hConvert">Pretvori H → B</button><button type="button" class="btn plain" id="hKeepBtn">Ostavi kako jeste</button></div>';
    }
  }
  $("#hBanner").addEventListener("click", function (e) {
    if (e.target.id === "hConvert") {
      pushUndo(); draft.chordpro = Chords.germanToEnglish(draft.chordpro); draft.notation = "en"; $("#fNotation").value = "en";
      renderEdit(); toast("Akordi su pretvoreni u englesku notaciju. „Poništi“ vraća staro.");
    } else if (e.target.id === "hKeepBtn") {
      hKeep = true; draft.notation = "de"; $("#fNotation").value = "de"; renderEdit();
    }
  });
  $("#undoBtn").addEventListener("click", function () {
    if (!undoStack.length) return;
    draft.chordpro = undoStack.pop(); renderEdit();
  });
  function convert() {
    var src = $("#fOriginal").value;
    if (!src.trim()) { toast("Prvo zalijepi tekst pjesme."); return; }
    if (draft.chordpro.trim() && draft.chordpro !== lastImport && !window.confirm("Ponovni uvoz zamijenit će trenutnu verziju pjesme tekstom iz originala. Nastaviti?")) return;
    var r = Chords.importText(src);
    pushUndo();
    draft.original = src; draft.chordpro = r.chordpro; lastImport = r.chordpro; hKeep = false;
    if (!$("#fTitle").value.trim() && r.meta.title) $("#fTitle").value = r.meta.title;
    if (!$("#fArtist").value.trim() && r.meta.artist) $("#fArtist").value = r.meta.artist;
    if (!$("#fMeta").value.trim()) {
      var bits = [r.meta.key, r.meta.capo ? "capo " + r.meta.capo : ""].filter(Boolean).join(" · ");
      if (bits) $("#fMeta").value = bits;
    }
    if (r.hasH) $("#fNotation").value = "de";
    readFields();
    setTab("preview");
    toast(r.format === "over" ? "Prepoznati akordi iznad riječi (" + r.chordCount + " različitih)." :
      r.format === "chordpro" ? "Prepoznat ChordPro (" + r.chordCount + " različitih akorda)." : "Nisam našao akorde, tekst je uvezen bez njih.");
  }
  $("#pasteConvert").addEventListener("click", convert);
  $("#pasteClip").addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast("Preglednik ne dozvoljava čitanje međuspremnika. Dodirni polje i izaberi Zalijepi."); return; }
    navigator.clipboard.readText().then(function (text) {
      if (!text) { toast("Međuspremnik je prazan."); return; }
      $("#fOriginal").value = text; draft.original = text;
    }).catch(function () { toast("Nisam dobio dozvolu. Dodirni polje i izaberi Zalijepi."); });
  });

  /* Akord na dodir */
  function wordStarts(text) { var res = [], re = /\S+/g, m; while ((m = re.exec(text))) res.push(m.index); return res; }
  function findChordIndex(ln, pos, name) {
    for (var i = 0; i < ln.chords.length; i++) if (ln.chords[i].pos === pos && ln.chords[i].name === name) return i;
    return -1;
  }
  function chordPanel(target) {
    // target: {l, pos} za novi akord ili {l, i} za postojeći
    var lines = Chords.parse(draft.chordpro), ln = lines[target.l];
    if (!ln || ln.t !== "l") return;
    var existing = target.i != null ? ln.chords[target.i] : null;
    var pos = existing ? existing.pos : target.pos;
    panelChord = { l: target.l, pos: pos, name: existing ? existing.name : null };
    var word = (/\S+/.exec(ln.text.slice(pos)) || [""])[0];
    var chips = Chords.listChords(draft.chordpro);
    if (!chips.length) chips = DEFAULT_CHIPS[$("#fNotation").value] || DEFAULT_CHIPS.en;
    openPanel("<h3>" + (existing ? "Akord " + esc(existing.name) : "Novi akord") + (word ? " na „" + esc(word) + "“" : "") + "</h3>" +
      '<div class="chips">' + chips.map(function (c) { return '<button type="button" class="btn' + (existing && existing.name === c ? " active" : "") + '" data-chip="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
      '<div class="row"><input id="chordInput" type="text" style="flex:1;min-width:120px" placeholder="Drugi akord, npr. Am7" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"><button type="button" class="btn primary" data-act="set">Postavi</button></div>' +
      (existing ? '<div class="row"><button type="button" class="btn" data-move="-word">« riječ</button><button type="button" class="btn" data-move="-1">‹ slovo</button><button type="button" class="btn" data-move="1">slovo ›</button><button type="button" class="btn" data-move="word">riječ »</button></div>' : "") +
      '<div class="row">' + (existing ? '<button type="button" class="btn danger" data-act="remove">Ukloni akord</button>' : "") + '<span style="flex:1"></span><button type="button" class="btn plain" data-act="close">Gotovo</button></div>');    // Riječ na kojoj radimo mora ostati vidljiva iznad panela.
    document.querySelectorAll("#editSheet .w.sel").forEach(function (x) { x.classList.remove("sel"); });
    var words = document.querySelectorAll('#editSheet .word[data-l="' + target.l + '"]'), el = null;
    words.forEach(function (w) { if (+w.dataset.p <= pos) el = w; });
    if (el) {
      el.classList.add("sel");
      var r = el.getBoundingClientRect(), limit = $("#panel").getBoundingClientRect().top - 12;
      if (r.bottom > limit) window.scrollBy(0, r.bottom - limit);
      else if (r.top < 70) window.scrollBy(0, r.top - 90);
    }
  }
  function applyChord(name) {
    name = String(name || "").replace(/[\[\]{}]/g, "").trim();
    if (!name || !panelChord) return;
    var lines = Chords.parse(draft.chordpro), ln = lines[panelChord.l];
    pushUndo();
    var i = panelChord.name != null ? findChordIndex(ln, panelChord.pos, panelChord.name) : -1;
    if (i >= 0) ln.chords[i].name = name; else ln.chords.push({ pos: panelChord.pos, name: name });
    draft.chordpro = Chords.serialize(lines);
    closePanel(); renderEdit();
  }
  function moveChord(how) {
    var lines = Chords.parse(draft.chordpro), ln = lines[panelChord.l];
    var i = findChordIndex(ln, panelChord.pos, panelChord.name); if (i < 0) return;
    var pos = ln.chords[i].pos, starts = wordStarts(ln.text), next = pos;
    if (how === "1") next = Math.min(ln.text.length, pos + 1);
    else if (how === "-1") next = Math.max(0, pos - 1);
    else if (how === "word") { var a = starts.filter(function (s) { return s > pos; }); if (a.length) next = a[0]; }
    else { var b = starts.filter(function (s) { return s < pos; }); if (b.length) next = b[b.length - 1]; }
    if (next === pos) return;
    pushUndo();
    ln.chords[i].pos = next;
    draft.chordpro = Chords.serialize(lines);
    renderEdit();
    var fresh = Chords.parse(draft.chordpro)[panelChord.l], keep = { l: panelChord.l, i: findChordIndex(fresh, next, panelChord.name) };
    if (keep.i >= 0) chordPanel(keep);
  }
  function removeChord() {
    var lines = Chords.parse(draft.chordpro), ln = lines[panelChord.l];
    var i = findChordIndex(ln, panelChord.pos, panelChord.name); if (i < 0) return;
    pushUndo(); ln.chords.splice(i, 1);
    draft.chordpro = Chords.serialize(lines);
    closePanel(); renderEdit();
  }
  function editSheetTap(e) {
    var ch = e.target.closest(".ch");
    if (ch) { chordPanel({ l: +ch.dataset.l, i: +ch.dataset.i }); return; }
    var w = e.target.closest(".word"); if (!w) return;
    var l = +w.dataset.l, pos = +w.dataset.p, ln = Chords.parse(draft.chordpro)[l], at = -1;
    if (ln && ln.t === "l") ln.chords.forEach(function (c, i) { if (c.pos === pos && at < 0) at = i; });
    chordPanel(at >= 0 ? { l: l, i: at } : { l: l, pos: pos });
  }
  $("#editSheet").addEventListener("click", editSheetTap);
  $("#editSheet").addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("word")) { e.preventDefault(); editSheetTap(e); }
  });
  $("#panel").addEventListener("click", function (e) {
    var chip = e.target.closest("[data-chip]"), move = e.target.closest("[data-move]"), act = e.target.closest("[data-act]");
    if (chip) return applyChord(chip.dataset.chip);
    if (move) return moveChord(move.dataset.move);
    if (!act) return;
    var a = act.dataset.act;
    if (a === "close") closePanel();
    else if (a === "label-menu") { menuSong = current; openPanel(labelOptions(current) + '<button type="button" class="btn" data-act="close">Zatvori</button>'); }
    else if (a === "content-label") setContentLabel(act.dataset.label);
    else if (a === "set") { var v = $("#chordInput").value; if (v.trim()) applyChord(v); else toast("Upiši akord ili izaberi jedan od ponuđenih."); }
    else if (a === "remove") removeChord();
    else if (a === "export") { closePanel(); exportAll(); }
    else if (a === "edit") { closePanel(); if (current) location.hash = "#/u/" + encodeURIComponent(current.id); }
    else if (a === "export-song") { closePanel(); if (current) deliver(fileSlug(current.title) + ".cho", Chords.exportChordPro(current), "text/plain"); }
    else if (a === "delete-song") { closePanel(); if (current) deleteSong(current); }
    else if (a === "import") { closePanel(); $("#importFile").click(); }
    else if (a === "theme") { toggleTheme(); closePanel(); }
    else if (a === "sync") syncPanel();
    else if (a === "sync-connect") syncConnect();
    else if (a === "sync-now") { syncNow(true); }
    else if (a === "sync-off") syncDisconnect();
    else if (a === "move") { var ms = menuSong; closePanel(); if (ms) { moveSong(ms.id, act.dataset.status); toast("Premješteno u " + (act.dataset.status === "done" ? "Kolekciju" : LABELS[act.dataset.status]) + "."); } }
    else if (a === "restore") {
      var back = state.deletedSeeds.slice(), now = Date.now();
      back.forEach(function (id) { delete state.removed[id]; });
      state.deletedSeeds = []; closePanel(); save(true); load();
      state.songs.forEach(function (x) { if (back.indexOf(x.id) >= 0) x.updatedAt = now; });
      state.orderAt = now; save(); renderList(); toast("Početne pjesme su vraćene.");
    }
  });
  $("#panel").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "chordInput") { e.preventDefault(); if (e.target.value.trim()) applyChord(e.target.value); }
    if (e.key === "Escape") closePanel();
  });

  var leaveOk = false;
  function leaveEdit(hash) { leaveOk = true; draft = null; location.hash = hash; if (location.hash === hash || (!hash && !location.hash)) route(); }
  $("#editSave").addEventListener("click", function () {
    readFields();
    if (!draft.chordpro.trim() && draft.original.trim()) draft.chordpro = Chords.importText(draft.original).chordpro;
    if (!draft.title) { toast("Upiši naslov pjesme."); $("#fTitle").focus(); return; }
    draft.updatedAt = Date.now();
    var song = normalizeSong(draft), cur = findSong(song.id);
    if (cur) state.songs[state.songs.indexOf(cur)] = song; else { state.songs.unshift(song); state.orderAt = Date.now(); }
    if (!save()) return;
    toast("Sačuvano.");
    leaveEdit("#/p/" + encodeURIComponent(song.id));
  });
  $("#editCancel").addEventListener("click", function () {
    readFields();
    if (isDirty() && !window.confirm("Odbaciti izmjene koje nisu sačuvane?")) return;
    var id = draftIsNew ? null : draft.id;
    leaveEdit(id ? "#/p/" + encodeURIComponent(id) : "");
  });
  window.addEventListener("beforeunload", function (e) {
    if (draft && !$("#viewEdit").hidden) { readFields(); if (isDirty()) { e.preventDefault(); e.returnValue = ""; } }
  });

  /* ---------- Navigacija ---------- */
  var editHash = "";
  function route() {
    var h = location.hash || "", m;
    // Izlazak iz uređivanja tipkom Nazad: pitaj prije nego se izmjene izgube.
    if (draft && !leaveOk && h !== editHash) {
      readFields();
      if (isDirty() && !window.confirm("Odbaciti izmjene koje nisu sačuvane?")) { location.hash = editHash; return; }
      draft = null;
    }
    leaveOk = false;
    closePanel(); closeComments(false);
    if (h === "#/nova") {
      if (!draft) startEdit(null);
      editHash = h; releaseWake(); setImmersive(false); show("viewEdit"); return;
    }
    if ((m = /^#\/u\/(.+)$/.exec(h))) {
      var es = findSong(decodeURIComponent(m[1]));
      if (es) { if (!draft || draft.id !== es.id) startEdit(es); editHash = h; releaseWake(); setImmersive(false); show("viewEdit"); return; }
    }
    draft = null; editHash = "";
    if ((m = /^#\/p\/(.+)$/.exec(h))) {
      var s = findSong(decodeURIComponent(m[1]));
      if (s) {
        if (current !== s) { songView = "text"; asStop(); }
        current = s; show("viewSong"); renderSong(); asUI();
        if (state.settings.keepAwake !== false) { wakeWanted = true; acquireWake(); } else updateWakeUI();
        return;
      }
    }
    current = null; asStop(); releaseWake(); exitViewerFullscreen(); setImmersive(false);
    show("viewList"); renderList();
  }
  window.addEventListener("hashchange", route);

  /* ---------- Sinhronizacija s privatnim GitHub repoom ---------- */
  // Postavke veze (s tokenom) su pod posebnim ključem, da nikad ne uđu u izvoz pjesama.
  var SYNC_KEY = "gitara-sync";
  var syncInfo = { busy: false, again: false, lastOk: 0, error: null, offline: false, sha: null };
  var syncTimer = 0;
  function syncCfg() {
    try { var c = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); return c && c.owner && c.repo && c.token ? c : null; }
    catch (e) { return null; }
  }
  function syncStored() { try { return JSON.parse(localStorage.getItem(SYNC_KEY) || "null") || {}; } catch (e) { return {}; } }
  function storeSync(c) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function hhmm(t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function syncLabel() {
    if (!syncCfg()) return "nije povezano";
    if (syncInfo.busy) return "u toku…";
    if (syncInfo.error) return "greška";
    if (syncInfo.offline) return "čeka mrežu";
    var last = syncInfo.lastOk || syncStored().lastOk;
    return last ? "sačuvano u " + hhmm(last) : "povezano";
  }
  function syncNotice() { return syncCfg() && syncInfo.error ? "Sinhronizacija ne radi: " + syncInfo.error + " Pjesme su i dalje sačuvane na ovom uređaju." : ""; }
  function backupReminder() {
    if (syncCfg()) return "";
    var DAY = 864e5, last = state.settings.lastExport || 0, since = Date.now() - (last || state.settings.firstUse || Date.now());
    if (since < 14 * DAY) return "";
    return "Pjesme su samo na ovom uređaju" + (last ? ", a zadnja rezervna kopija je od prije " + Math.floor(since / DAY) + " dana." : " i još nisu izvezene.") + " Poveži GitHub ili ih izvezi u meniju ⋯.";
  }
  function refreshSyncUI() {
    if (!$("#viewList").hidden && !(drag && drag.active)) renderList();
    var lab = document.querySelector('#panel [data-act="sync"]'); if (lab) lab.textContent = "Sinhronizacija: " + syncLabel();
    var st = $("#syncStatus"); if (st) st.textContent = syncLabel();
  }
  function scheduleSync(ms) {
    if (!syncCfg()) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncNow(false); }, ms || 0);
  }
  function localDoc() { return { songs: state.songs, removed: state.removed, orderAt: state.orderAt }; }
  function applyMerged(m) {
    var before = current ? JSON.stringify(current) : "";
    state.songs = m.songs.map(normalizeSong).filter(Boolean);
    state.removed = m.removed; state.orderAt = m.orderAt;
    state.deletedSeeds = SEEDS.map(function (x) { return x.id; }).filter(function (id) { return state.removed[id] && !findSong(id); });
    save(true);
    if (current) {
      var now = findSong(current.id);
      if (!now) { toast("Ova pjesma je obrisana na drugom uređaju."); current = null; if (!$("#viewSong").hidden) { location.hash = ""; return; } }
      else { current = now; if (!$("#viewSong").hidden && JSON.stringify(now) !== before) renderSong(); }
    }
  }
  function syncNow(manual) {
    var cfg = syncCfg(); if (!cfg) return Promise.resolve();
    if (syncInfo.busy) { syncInfo.again = true; return Promise.resolve(); }
    if (drag && drag.active) { scheduleSync(1500); return Promise.resolve(); }
    if (navigator.onLine === false) { syncInfo.offline = true; refreshSyncUI(); return Promise.resolve(); }
    var gh = GitaraSync.client(cfg, { api: cfg.api });
    syncInfo.busy = true; refreshSyncUI();
    function attempt(tries) {
      return gh.read().then(function (r) {
        var remote = r.doc ? { songs: r.doc.songs.map(normalizeSong).filter(Boolean), removed: r.doc.removed || {}, orderAt: r.doc.orderAt || 0 } : null;
        var merged = remote ? GitaraSync.merge(localDoc(), remote) : localDoc();
        if (!GitaraSync.same(merged, localDoc())) applyMerged(merged);
        if (remote && GitaraSync.same(merged, remote)) return null;
        var doc = { app: "gitara", v: 2, savedAt: new Date().toISOString(), orderAt: state.orderAt, removed: state.removed, songs: state.songs };
        return gh.write(doc, r.sha, "Gitara: izmjene " + new Date().toISOString().slice(0, 16).replace("T", " ")).catch(function (e) {
          if (e.kind === "conflict" && tries > 0) return attempt(tries - 1);
          throw e;
        });
      });
    }
    return attempt(3).then(function () { return syncDetails(cfg); }).then(function () {
      var hadError = syncInfo.error;
      syncInfo.error = null; syncInfo.offline = false; syncInfo.lastOk = Date.now();
      var c = syncStored(); c.lastOk = syncInfo.lastOk; storeSync(c);
      if (manual) toast("Sinhronizovano s GitHubom.");
      else if (hadError) toast("Sinhronizacija ponovo radi.");
    }).catch(function (e) {
      if (e && e.kind === "offline") { syncInfo.offline = true; }
      else if (e && e.kind === "later") { syncInfo.offline = true; scheduleSync(60000); }
      else {
        var msg = (e && e.message) || "Nepoznata greška.";
        if (syncInfo.error !== msg || manual) toast("Sinhronizacija: " + msg);
        syncInfo.error = msg;
      }
    }).then(function () {
      syncInfo.busy = false; refreshSyncUI();
      if (syncInfo.again) { syncInfo.again = false; scheduleSync(300); }
    });
  }
  function syncPanel() {
    var cfg = syncCfg(), st = syncStored();
    if (cfg) {
      var gh = GitaraSync.client(cfg);
      openPanel("<h3>Sinhronizacija</h3>" +
        '<div class="setting"><span>Repo</span><span>' + esc(cfg.owner + "/" + cfg.repo) + "</span></div>" +
        '<div class="setting"><span>Stanje</span><span id="syncStatus">' + esc(syncLabel()) + "</span></div>" +
        (syncInfo.error ? '<p class="hint">' + esc(syncInfo.error) + "</p>" : "") +
        '<p class="hint">Izmjene se šalju same, par sekundi nakon snimanja, i kad se aplikacija ponovo otvori. Svaka verzija ostaje u historiji repoa. Oznake i komentari šalju se odvojeno, pa ih starija verzija aplikacije ne prepisuje.</p>' +
        '<div class="menu"><button type="button" class="btn" data-act="sync-now">Sinhronizuj sada</button>' +
        '<a class="btn" href="' + esc(gh.historyUrl) + '" target="_blank" rel="noopener">Historija na GitHubu ↗</a>' +
        '<button type="button" class="btn danger" data-act="sync-off">Prekini vezu na ovom uređaju</button>' +
        '<button type="button" class="btn" data-act="close">Zatvori</button></div>');
      return;
    }
    openPanel("<h3>Poveži GitHub</h3>" +
      '<p class="hint">Pjesme se čuvaju u tvom privatnom repou kao fajl pjesme.json. Token upisuješ jednom na svakom uređaju; ostaje samo u ovom pregledniku i ne ulazi u izvoz.</p>' +
      '<div class="form-grid">' +
      '<label>GitHub korisnik<input id="syncOwner" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(st.owner || "") + '" placeholder="npr. adnan1302"></label>' +
      '<label>Repo<input id="syncRepo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(st.repo || "gitara-podaci") + '"></label>' +
      '<label class="wide">Token<input id="syncToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label></div>' +
      '<p class="hint">Token napravi na <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a>: samo za ovaj repo, dozvola Contents: Read and write.</p>' +
      '<div class="row" style="margin-bottom:0"><button type="button" class="btn primary" data-act="sync-connect">Poveži</button><span style="flex:1"></span><button type="button" class="btn" data-act="close">Otkaži</button></div>');
  }
  function syncConnect() {
    var st = syncStored();
    var cfg = { owner: $("#syncOwner").value.trim(), repo: $("#syncRepo").value.trim(), token: $("#syncToken").value.trim(), path: "pjesme.json", api: st.api };
    if (!cfg.owner || !cfg.repo || !cfg.token) { toast("Upiši korisnika, repo i token."); return; }
    var btn = document.querySelector('#panel [data-act="sync-connect"]'); if (btn) { btn.disabled = true; btn.textContent = "Provjeravam…"; }
    GitaraSync.client(cfg, { api: cfg.api }).checkRepo().then(function (info) {
      if (info && info.private === false && !window.confirm("Repo " + cfg.owner + "/" + cfg.repo + " je javan, pa bi pjesme vidjeli svi. Ipak ga koristiti?")) throw null;
      if (!storeSync(cfg)) throw { message: "Preglednik ne dozvoljava pohranu postavki." };
      syncInfo.error = null; closePanel();
      return syncNow(false).then(function () {
        if (!syncInfo.error) toast(syncInfo.offline ? "Povezano. Pjesme se šalju kad se veza vrati." : "Povezano. Pjesme su sačuvane na GitHubu.");
        refreshSyncUI();
      });
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Poveži"; }
      if (e) toast(e.kind === "offline" ? "Nema veze s GitHubom. Pokušaj kad budeš na internetu." : e.message || "Povezivanje nije uspjelo.");
    });
  }
  function syncDisconnect() {
    if (!window.confirm("Prekinuti vezu s GitHubom na ovom uređaju? Token se briše s uređaja, a pjesme ostaju i ovdje i na GitHubu.")) return;
    var st = syncStored(); delete st.token; delete st.lastOk; storeSync(st);
    syncInfo.error = null; syncInfo.offline = false; syncInfo.lastOk = 0;
    closePanel(); refreshSyncUI(); toast("Veza s GitHubom je prekinuta na ovom uređaju.");
  }
  window.addEventListener("online", function () { syncInfo.offline = false; scheduleSync(500); });
  window.addEventListener("offline", function () { if (syncCfg()) { syncInfo.offline = true; refreshSyncUI(); } });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - syncInfo.lastOk > 20000) scheduleSync(300);
  });

  load();
  applyTheme();
  applyFont();
  updateWakeUI();
  route();
  scheduleSync(0);
  // Traži od preglednika da pohranu ne briše sam (Safari to inače radi nakon 7 dana bez posjete).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* offline rad nije dostupan */ }); });
  }
})();
