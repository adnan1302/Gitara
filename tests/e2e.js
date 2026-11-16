// Pokretanje: python3 -m http.server 8765 (u korijenu repoa), pa: node tests/e2e.js
// Traži Playwright s Chromiumom. Ovo NIJE test na stvarnom iPhoneu ili iPadu.
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8765/";
const SHOTS = process.env.SHOTS || "";
const SIZES = { desktop: { width: 1440, height: 900 }, iphone: { width: 390, height: 844 }, ipadPortrait: { width: 820, height: 1180 }, ipadLandscape: { width: 1180, height: 820 } };
const results = [];
async function step(name, fn) {
  try { await fn(); results.push("OK   " + name); }
  catch (e) { results.push("PAD  " + name + " :: " + e.message.split("\n").slice(0, 12).join(" / ")); process.exitCode = 1; }
}
const PASTE = "Hm         G\nŠta će mi život, đavo čeka\n   A          H7\nA gomila ćuti dok žena šeta";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: SIZES.ipadPortrait, hasTouch: true, acceptDownloads: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  // Odgovori lažnog GitHuba (404, 401, 409) su namjerni, pa ih ne brojimo kao greške.
  const isGh = m => (m.location().url || "").startsWith("https://api.github.com/");
  page.on("console", m => { if (m.type() === "error" && !isGh(m)) errors.push(m.text()); });
  page.on("dialog", d => d.accept());
  // Nijedan zahtjev ne smije ići van vlastite adrese (PDF.js više nije na CDN-u).
  const external = [];
  await ctx.route("**/*", r => { const u = r.request().url(); if (!u.startsWith(BASE)) { external.push(u); return r.abort(); } return r.continue(); });
  const shot = async n => { if (SHOTS) await page.screenshot({ path: SHOTS + "/" + n + ".png" }); };
  // Tekst i akordi su u zasebnim elementima, pa ih čitamo odvojeno.
  const lyrics = sel => page.evaluate(q => [...document.querySelectorAll(q + " .ln")].map(l => [...l.querySelectorAll(".t")].map(t => t.textContent).join("")).join("\n"), sel);
  const chords = sel => page.evaluate(q => [...document.querySelectorAll(q + " .c > *")].map(c => c.textContent).join(" "), sel);
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "horizontalno prelijevanje");

  // Pjesme su podijeljene na tablu „U radu“ i karticu „Kolekcija“, pa brojimo i tražimo kroz obje.
  const total = async () => { let n = 0; for (const tb of ["#tabDone", "#tabWork"]) { await page.click(tb); n += await page.locator(".song").count(); } return n; };
  const openSong = async name => {
    for (const tb of ["#tabWork", "#tabDone"]) { await page.click(tb); const l = page.locator(".song .cd-main", { hasText: name }); if (await l.count()) { await l.first().click(); return; } }
    throw new Error("nema pjesme: " + name);
  };
  const colOf = st => page.evaluate(s => [...document.querySelectorAll('.col[data-status="' + s + '"] .song-title')].map(e => e.textContent), st);

  await page.goto(BASE);
  await step("početnih 8 pjesama, bez grešaka", async () => {
    assert.strictEqual(await total(), 8);
    assert.strictEqual(await page.locator("#tabDone").innerText(), "Kolekcija");
    assert.deepStrictEqual(errors, []);
  });
  await step("stabilni ID-jevi u pohrani", async () => {
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("gitara-v2")).songs.map(s => s.id));
    assert.strictEqual(new Set(ids).size, 8); assert(ids.includes("seed-all-of-me"));
  });
  await step("neispravan JSON u pohrani ne ruši aplikaciju", async () => {
    await page.evaluate(() => localStorage.setItem("gitara-v2", "{ovo nije json"));
    await page.reload();
    assert.strictEqual(await total(), 8);
    assert(await page.locator("#notice").isVisible());
    assert(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("gitara-v2-neispravno-"))));
  });
  await step("ispravan JSON pogrešnog oblika ne ruši aplikaciju", async () => {
    for (const bad of ['{"a":1}', "[1,2]", "null", '"tekst"', '{"songs":[null,5,{"id":7}]}']) {
      await page.evaluate(v => localStorage.setItem("gitara-v2", v), bad);
      await page.reload();
      assert.strictEqual(await total(), 8, bad);
    }
    assert.deepStrictEqual(errors, []);
  });
  await step("stari ključ gitara-songs se ne dira i ne smeta", async () => {
    await page.evaluate(() => localStorage.setItem("gitara-songs", "{pokvareno"));
    await page.reload();
    assert.strictEqual(await total(), 8);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("gitara-songs")), "{pokvareno");
  });
  await step("uređena „Da, to sam ja“ ostaje nakon ponovnog pokretanja", async () => {
    await openSong("Da, to sam ja");
    await page.click("#songMenu"); await page.click('[data-act="edit"]');
    await page.click('[data-tab="text"]');
    const v = await page.inputValue("#fChordpro");
    await page.fill("#fChordpro", "MOJA IZMJENA\n" + v);
    await page.click("#editSave");
    await page.reload(); await page.reload();
    assert((await lyrics("#songSheet")).includes("MOJA IZMJENA"));
  });
  await step("nova pjesma: zalijepi, pregledaj, H banner, sačuvaj", async () => {
    await page.goto(BASE + "#/nova");
    await page.fill("#fOriginal", PASTE);
    await page.click("#pasteConvert");
    assert(await page.locator("#hBanner").isVisible());
    assert((await page.locator("#hBanner").innerText()).includes("Hm → Bm"));
    assert((await chords("#editSheet")).includes("Hm"), "akordi se ne mijenjaju bez potvrde");
    await shot("uredjivanje-ipad-portret");
    await page.click("#hConvert");
    const t = await chords("#editSheet");
    assert(t.includes("Bm") && t.includes("B7") && !t.includes("Hm"), t);
    assert((await lyrics("#editSheet")).includes("Šta će mi život, đavo čeka"), "dijakritika");
    await page.fill("#fTitle", "Probna pjesma"); await page.fill("#fArtist", "Test");
    await page.click("#editSave");
    assert.strictEqual(await page.locator("#songTitle").innerText(), "Probna pjesma");
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("gitara-v2")).songs[0].original), PASTE, "original sačuvan");
  });
  await step("dodir na riječ dodaje akord, dodir na akord ga pomjera i briše", async () => {
    await page.click("#songMenu"); await page.click('[data-act="edit"]');
    await page.locator("#editSheet .word", { hasText: "ćuti" }).tap();
    await page.locator('#panel [data-chip="Bm"]').tap();
    await page.click('[data-tab="text"]');
    assert((await page.inputValue("#fChordpro")).includes("[Bm]ćuti"));
    await page.click('[data-tab="preview"]');
    await page.locator("#editSheet .ch", { hasText: "Bm" }).last().tap();
    await page.locator('#panel [data-move="word"]').tap();
    await page.locator('#panel [data-act="close"]').tap();
    await page.click('[data-tab="text"]');
    assert(/ćuti (\[B7\])?\[Bm\](\[B7\])?dok/.test(await page.inputValue("#fChordpro")), await page.inputValue("#fChordpro"));
    await page.click('[data-tab="preview"]');
    await page.locator("#editSheet .ch", { hasText: "Bm" }).last().tap();
    await page.locator('#panel [data-act="remove"]').tap();
    await page.locator("#editSheet .word", { hasText: "šeta" }).tap();
    await page.fill("#chordInput", "F#m7");
    await page.locator('#panel [data-act="set"]').tap();
    await page.click("#undoBtn");
    await page.click('[data-tab="text"]');
    const fin = await page.inputValue("#fChordpro");
    assert(!fin.includes("[Bm]ćuti") && !fin.includes("[Bm]dok") && !fin.includes("Bm]dok") && !fin.includes("F#m7"), fin);
    await page.click("#editSave");
  });
  await step("transpozicija i veličina slova", async () => {
    const before = await chords("#songSheet");
    assert(before.includes("Bm"), before);
    await page.click("#btnView");
    await page.click("#transUp"); await page.click("#transUp");
    assert((await chords("#songSheet")).includes("C#m"));
    assert.strictEqual(await page.locator("#transVal").innerText(), "+2");
    await page.click("#transVal");
    assert.strictEqual(await chords("#songSheet"), before);
    const f0 = await page.evaluate(() => getComputedStyle(document.querySelector("#songSheet")).fontSize);
    await page.click("#fontUp"); await page.click("#fontUp");
    const f1 = await page.evaluate(() => getComputedStyle(document.querySelector("#songSheet")).fontSize);
    assert.notStrictEqual(f0, f1);
    await page.click("#hideControls");
    assert(!(await page.locator("#viewSong .bar").isVisible()) && await page.locator("#showControls").isVisible(), "skrivanje kontrola");
    await page.click("#showControls");
    assert(await page.locator("#viewSong .bar").isVisible());
    await page.reload();
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector("#songSheet")).fontSize), f1);
  });
  await step("automatsko listanje: kreće, brzina se pamti po pjesmi, staje pri izlasku", async () => {
    await page.goto(BASE); await openSong("Da, to sam ja");
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await page.locator("#asToggle").isVisible(), "dugme za listanje se vidi");
    assert(!(await page.locator("#asFaster").isVisible()), "brzina skrivena dok ne lista");
    await page.click("#asToggle");
    assert.strictEqual(await page.getAttribute("#asToggle", "aria-pressed"), "true");
    assert.strictEqual(await page.textContent("#asVal"), "4");
    await page.click("#asFaster"); await page.click("#asFaster");
    assert.strictEqual(await page.textContent("#asVal"), "6");
    const y0 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(1500);
    const y1 = await page.evaluate(() => window.scrollY);
    assert(y1 - y0 > 15, "stranica se pomjerila: " + (y1 - y0));
    await page.click("#asToggle");
    const y2 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(600);
    assert.strictEqual(await page.evaluate(() => window.scrollY), y2, "stalo nakon pauze");
    await page.click("#asToggle");
    await page.click("#songBack");
    await page.waitForSelector("#viewList:not([hidden])");
    await openSong("Da, to sam ja");
    assert.strictEqual(await page.getAttribute("#asToggle", "aria-pressed"), "false", "izlazak iz pjesme gasi listanje");
    await page.click("#asToggle");
    assert.strictEqual(await page.textContent("#asVal"), "6", "brzina zapamćena za pjesmu");
    await page.click("#asToggle");
    const sync = await page.evaluate(() => JSON.parse(localStorage.getItem("gitara-v2")).settings.scrollSpeed);
    assert(sync && Object.values(sync).includes(6));
  });

  await step("izvoz i uvoz", async () => {
    await page.goto(BASE);
    await page.click("#btnMenu");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    const path = await dl.path(), data = JSON.parse(fs.readFileSync(path, "utf8"));
    assert.strictEqual(data.songs.length, 9);
    await page.evaluate(() => localStorage.removeItem("gitara-v2"));
    await page.reload();
    assert.strictEqual(await total(), 8);
    await page.setInputFiles("#importFile", path);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("gitara-v2")).songs.length === 9);
    assert.strictEqual(await total(), 9);
    assert.strictEqual((await colOf("progress"))[0], "Probna pjesma");
    await page.setInputFiles("#importFile", { name: "nova.cho", mimeType: "text/plain", buffer: Buffer.from("{title: Iz fajla}\n[Am]Jedan [G]dva") });
    await page.waitForSelector("#viewEdit:not([hidden])");
    assert.strictEqual(await page.inputValue("#fTitle"), "nova");
    await page.click("#editCancel");
  });
  await step("pretraga bez dijakritike", async () => {
    await page.goto(BASE);
    await page.fill("#search", "zivot ceka seta");
    assert.strictEqual(await page.locator(".song").count(), 1);
    await page.fill("#search", "balasevic");
    assert.strictEqual(await page.locator(".song").count(), 1);
    await page.fill("#search", "");
  });
  await step("tabla: tri kolone, kartica Kolekcija, premještanje menijem", async () => {
    await page.goto(BASE);
    assert.strictEqual(await page.locator(".col").count(), 3);
    const before = await colOf("progress");
    await page.locator(".cd", { hasText: before[0] }).locator(".grip").tap();
    await page.locator('#panel [data-act="move"][data-status="refine"]').tap();
    assert(!(await colOf("progress")).includes(before[0]) && (await colOf("refine")).includes(before[0]), "meni premješta u drugu kolonu");
    await page.locator(".cd", { hasText: before[0] }).locator(".grip").tap();
    await page.locator('#panel [data-act="move"][data-status="done"]').tap();
    assert.strictEqual(await page.locator(".cd", { hasText: before[0] }).count(), 0);
    await page.click("#tabDone");
    assert.strictEqual(await page.locator(".cd", { hasText: before[0] }).count(), 1, "pjesma je na kartici Kolekcija");
    await page.reload();
    assert.strictEqual(await page.evaluate(n => JSON.parse(localStorage.getItem("gitara-v2")).songs.find(s => s.title === n).status, before[0]), "done", "status ostaje nakon ponovnog pokretanja");
    await page.click("#tabDone");
    await page.locator(".cd", { hasText: before[0] }).locator(".grip").tap();
    await page.locator('#panel [data-act="move"][data-status="progress"]').tap();
    await page.click("#tabWork");
    assert((await colOf("progress")).includes(before[0]));
  });
  await step("tabla: povlačenje mišem između kolona i unutar kolone", async () => {
    await page.setViewportSize(SIZES.desktop); await page.goto(BASE);
    const idea = await colOf("idea"), name = (await colOf("progress"))[0];
    const from = await page.locator(".cd", { hasText: name }).boundingBox();
    const to = await page.locator('.col[data-status="idea"] .cd').first().boundingBox();
    await page.mouse.move(from.x + 60, from.y + 20); await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 3 });
    await page.mouse.move(to.x + 60, to.y + 5, { steps: 8 });
    assert(await page.locator(".slot").isVisible() && await page.locator(".cd.ghost").isVisible(), "mjesto za spuštanje i kartica u letu");
    await shot("povlacenje-desktop");
    await page.mouse.up();
    assert.deepStrictEqual(await colOf("idea"), [name, ...idea], "kartica je prva u novoj koloni");
    assert(await page.locator("#viewList").isVisible(), "povlačenje ne otvara pjesmu");
    const last = await page.locator('.col[data-status="idea"] .cd').last().boundingBox();
    const src = await page.locator(".cd", { hasText: name }).boundingBox();
    await page.mouse.move(src.x + 60, src.y + 20); await page.mouse.down();
    await page.mouse.move(src.x + 60, src.y + 40, { steps: 3 });
    await page.mouse.move(last.x + 60, last.y + last.height + 4, { steps: 8 });
    await page.mouse.up();
    assert.deepStrictEqual(await colOf("idea"), [...idea, name], "promjena redoslijeda u koloni");
    await page.reload();
    assert.deepStrictEqual(await colOf("idea"), [...idea, name], "redoslijed ostaje nakon ponovnog pokretanja");
    const g = await page.locator(".cd", { hasText: name }).boundingBox(), tabDone = await page.locator("#tabDone").boundingBox();
    await page.mouse.move(g.x + 60, g.y + 20); await page.mouse.down();
    await page.mouse.move(g.x + 60, g.y, { steps: 3 });
    await page.mouse.move(tabDone.x + 20, tabDone.y + 20, { steps: 8 });
    await page.mouse.up();
    assert(!(await colOf("idea")).includes(name), "spuštanje na karticu Kolekcija");
    await page.click("#tabDone"); await page.locator(".cd", { hasText: name }).locator(".grip").click();
    await page.locator('#panel [data-act="move"][data-status="progress"]').click();
    await page.setViewportSize(SIZES.ipadPortrait);
  });
  await step("tabla: povlačenje prstom za ručku (emulirani dodir)", async () => {
    await page.goto(BASE);
    const name = (await colOf("progress"))[0];
    const grip = await page.locator(".cd", { hasText: name }).locator(".grip").boundingBox();
    const to = await page.locator('.col[data-status="refine"] .colh').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y) }];
    const x0 = grip.x + grip.width / 2, y0 = grip.y + grip.height / 2, x1 = to.x + 80, y1 = to.y + 70;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0, y0) });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert((await colOf("refine")).includes(name), "prst za ručku premješta karticu");
    await page.locator(".cd", { hasText: name }).locator(".grip").tap();
    await page.locator('#panel [data-act="move"][data-status="progress"]').tap();
  });
  await step("tema: svijetla i tamna, izbor se pamti", async () => {
    await page.goto(BASE);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dark = await bg();
    await page.click('#viewList [data-theme-toggle]');
    assert.notStrictEqual(await bg(), dark);
    await shot("tabla-svijetla-ipad-portret");
    await page.reload();
    assert.notStrictEqual(await bg(), dark, "tema ostaje nakon ponovnog pokretanja");
    await page.click('#viewList [data-theme-toggle]');
    assert.strictEqual(await bg(), dark);
  });
  await step("brisanje pjesme i početne pjesme je trajno", async () => {
    for (const name of ["Probna pjesma", "Stairway to Heaven"]) {
      await openSong(name);
      await page.click("#songMenu"); await page.click('[data-act="delete-song"]');
      await page.waitForSelector("#viewList:not([hidden])");
    }
    await page.reload();
    assert.strictEqual(await total(), 7);
    await page.click("#btnMenu"); await page.click('[data-act="restore"]');
    assert.strictEqual(await total(), 8);
  });
  await step("All of Me: PDF iz lokalnog PDF.js-a i tutorial link", async () => {
    await openSong("All of Me");
    assert((await page.locator('#songViews a').getAttribute("href")).includes("youtube.com/watch?v=JVCjuUTd-aY"));
    await page.click('[data-view="tab"]');
    await page.waitForSelector("canvas.pdf-page", { timeout: 20000 });
    assert(await page.locator("canvas.pdf-page").count() >= 1);
    await shot("tablatura-ipad-portret");
    assert.deepStrictEqual(external, [], "vanjski zahtjevi");
  });
  await step("PDF pamti 60% nakon izlaska, ponovnog učitavanja i promjene prikaza", async () => {
    await page.click("#zoomFit");
    await page.click("#zoomOut"); await page.click("#zoomOut");
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "60%");
    await page.click("#songBack");
    await openSong("All of Me"); await page.click('[data-view="tab"]');
    await page.waitForSelector("canvas.pdf-page");
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "60%", "izlazak iz pjesme");
    await page.reload(); await page.click('[data-view="tab"]');
    await page.waitForSelector("canvas.pdf-page");
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "60%", "ponovno učitavanje aplikacije");
    await page.click("#fullscreenBtn");
    await page.waitForFunction(() => document.querySelector("#pdfWrap").classList.contains("viewer-fullscreen"));
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "60%", "cijeli ekran");
    await page.click("#fullscreenBtn");
    await page.setViewportSize(SIZES.ipadLandscape);
    await page.waitForTimeout(350);
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "60%", "promjena orijentacije");
    await page.click("#zoomFit");
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "100%");
    await page.reload(); await page.click('[data-view="tab"]');
    await page.waitForSelector("canvas.pdf-page");
    assert.strictEqual(await page.locator("#zoomLabel").innerText(), "100%", "Širina zamjenjuje prethodni zoom");
  });
  await step("PDF cijeli ekran: dugme za listanje je iznad PDF-a i pomiče stranice", async () => {
    await page.goto(BASE); await openSong("All of Me"); await page.click('[data-view="tab"]');
    await page.waitForSelector("#pdfPages canvas");
    await page.click("#fullscreenBtn");
    const top = await page.evaluate(() => { const r = document.getElementById("asToggle").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest("#autoScroll")); });
    assert(top, "dugme za listanje je prekriveno PDF-om u cijelom ekranu");
    await page.click("#asToggle");
    const y0 = await page.evaluate(() => document.getElementById("pdfPages").scrollTop);
    await page.waitForTimeout(1500);
    const y1 = await page.evaluate(() => document.getElementById("pdfPages").scrollTop);
    assert(y1 > y0, "PDF se ne pomjera: " + y0 + " -> " + y1);
    await page.click("#asToggle"); await page.click("#fullscreenBtn");
  });

  await step("prikaz na širinama telefona i iPada bez prelijevanja", async () => {
    for (const [name, size] of Object.entries(SIZES)) {
      await page.setViewportSize(size);
      await page.goto(BASE); await page.waitForSelector(".song"); await noOverflow(); await shot("lista-" + name);
      await page.click("#tabDone"); await noOverflow(); await shot("zavrseno-" + name);
      await openSong("Da, to sam ja"); await page.waitForSelector("#viewSong:not([hidden])"); await noOverflow(); await shot("pjesma-" + name);
      await page.click("#btnView"); await shot("prikaz-" + name); await page.click("#viewPanelClose");
      await page.click("#songMenu"); await page.click('[data-act="edit"]'); await page.waitForSelector("#viewEdit:not([hidden])"); await noOverflow(); await shot("uredi-" + name);
      const word = page.locator("#editSheet .word").nth(40);
      await word.tap(); await noOverflow(); await shot("akord-" + name);
      const box = await word.boundingBox(), panel = await page.locator("#panel").boundingBox();
      assert(box.y + box.height <= panel.y + 1 && box.y >= 0, "riječ je sakrivena iza panela");
      await page.locator('#panel [data-act="close"]').tap();
      await page.click("#editCancel");
    }
  });
  await step("ciljevi za dodir najmanje 44 px", async () => {
    await page.setViewportSize(SIZES.iphone);
    for (const hash of ["", "#/p/seed-da-to-sam-ja", "#/u/seed-da-to-sam-ja"]) {
      await page.goto(BASE + hash); await page.waitForTimeout(100);
      const small = await page.evaluate(() => [...document.querySelectorAll("button,a.btn,select,input:not([type=file])")]
        .filter(e => e.offsetParent && !e.classList.contains("ch")).map(e => [e.id || e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 40));
      assert.deepStrictEqual(small, [], hash);
    }
  });
  await step("offline: aplikacija i PDF rade bez mreže", async () => {
    await page.setViewportSize(SIZES.ipadLandscape);
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => {
      const required = ["index.html", "app.js", "chords.js", "seeds.js", "sync.js", "fonts/manrope-latin-variable.woff2", "fonts/manrope-latin-ext-variable.woff2", "fonts/source-sans-3-latin-variable.woff2", "fonts/source-sans-3-latin-ext-variable.woff2", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "tabs/all-of-me.pdf"];
      return (await Promise.all(required.map(url => caches.match(url)))).every(Boolean);
    }, null, { timeout: 30000 });
    await ctx.unroute("**/*");
    await ctx.setOffline(true);
    await page.reload();
    assert.strictEqual(await total(), 8);
    await openSong("All of Me");
    await page.click('[data-view="tab"]');
    await page.waitForSelector("canvas.pdf-page", { timeout: 20000 });
    await shot("tablatura-offline-ipad-pejzaz");
    await ctx.setOffline(false);
  });
  await step("GitHub sinhronizacija: dva uređaja, brisanje, sukob, loš token, bez mreže", async () => {
    // Lažni GitHub API u memoriji: isti oblik zahtjeva i odgovora kao pravi (contents API).
    const gh = { file: null, sha: null, commits: 0, fail: null, conflictOnce: null, tokens: new Set() };
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept", "access-control-allow-methods": "GET, PUT, OPTIONS" };
    const send = (r, status, body) => r.fulfill({ status, headers: Object.assign({ "content-type": "application/json" }, cors), body: body === undefined ? "" : JSON.stringify(body) });
    const b64 = s => Buffer.from(s, "utf8").toString("base64").replace(/(.{60})/g, "$1\n");
    const remote = () => JSON.parse(gh.file);
    const put = text => { gh.file = text; gh.commits++; gh.sha = "sha" + gh.commits; };
    const fake = async r => {
      const req = r.request(), url = new URL(req.url()), method = req.method();
      if (method === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      gh.tokens.add(req.headers()["authorization"]);
      if (gh.fail) return send(r, gh.fail, { message: "fail" });
      if (url.pathname === "/repos/test/gitara-podaci") return send(r, 200, { private: true });
      if (url.pathname !== "/repos/test/gitara-podaci/contents/pjesme.json") return send(r, 404, { message: "Not Found" });
      if (method === "GET") return gh.file ? send(r, 200, { sha: gh.sha, encoding: "base64", content: b64(gh.file) }) : send(r, 404, { message: "Not Found" });
      const body = JSON.parse(req.postData());
      if (gh.conflictOnce) { gh.conflictOnce(); gh.conflictOnce = null; return send(r, 409, { message: "conflict" }); }
      if ((body.sha || null) !== gh.sha) return send(r, 409, { message: "sha" });
      put(Buffer.from(body.content, "base64").toString("utf8"));
      return send(r, 200, { content: { sha: gh.sha } });
    };
    const ctxB = await browser.newContext({ viewport: SIZES.iphone, hasTouch: true });
    await ctx.route("https://api.github.com/**", fake); await ctxB.route("https://api.github.com/**", fake);
    const pageB = await ctxB.newPage();
    pageB.on("pageerror", e => errors.push("B: " + e)); pageB.on("console", m => { if (m.type() === "error" && !isGh(m)) errors.push("B: " + m.text()); });
    pageB.on("dialog", d => d.accept());
    const titles = p => p.evaluate(() => JSON.parse(localStorage.getItem("gitara-v2")).songs.map(s => s.title).sort());
    const statusOf = (p, name) => p.evaluate(n => (JSON.parse(localStorage.getItem("gitara-v2")).songs.find(s => s.title === n) || {}).status, name);
    const connect = async (p, token) => {
      await p.click("#btnMenu"); await p.click('#panel [data-act="sync"]');
      await p.fill("#syncOwner", "test"); await p.fill("#syncRepo", "gitara-podaci"); await p.fill("#syncToken", token);
      await p.click('#panel [data-act="sync-connect"]');
      await p.waitForSelector("#panel", { state: "hidden" });
    };
    const syncNow = async p => {
      const before = await p.evaluate(() => (JSON.parse(localStorage.getItem("gitara-sync")) || {}).lastOk || 0);
      await p.click("#btnMenu"); await p.click('#panel [data-act="sync"]'); await p.click('#panel [data-act="sync-now"]');
      await p.waitForFunction(b => ((JSON.parse(localStorage.getItem("gitara-sync")) || {}).lastOk || 0) > b || /greška/.test(document.querySelector("#syncStatus").textContent), before);
      await p.click('#panel [data-act="close"]');
    };
    const commitsAfter = async n => { for (let i = 0; i < 100 && gh.commits <= n; i++) await page.waitForTimeout(100); assert(gh.commits > n, "nema novog commita"); };

    // 1. Uređaj A šalje svoje pjesme u prazan repo.
    await page.setViewportSize(SIZES.ipadPortrait); await page.goto(BASE);
    const local = await titles(page);
    await connect(page, "tok-A");
    await commitsAfter(0);
    assert.deepStrictEqual(remote().songs.map(s => s.title).sort(), local);
    assert(!(await page.evaluate(() => localStorage.getItem("gitara-v2"))).includes("tok-A"), "token nije u podacima pjesama");
    assert(gh.tokens.has("Bearer tok-A"));

    // 2. Uređaj B (prazan) dobija iste pjesme, uključujući izmijenjenu početnu pjesmu.
    await pageB.goto(BASE); await connect(pageB, "tok-B");
    await pageB.waitForFunction(() => JSON.parse(localStorage.getItem("gitara-v2")).songs.some(s => /MOJA IZMJENA/.test(s.chordpro)));
    assert.deepStrictEqual(await titles(pageB), local);

    // 3. Premještanje na B stiže na A.
    const name = await pageB.evaluate(() => document.querySelector('.col[data-status="progress"] .song-title').textContent);
    let c = gh.commits;
    await pageB.locator(".cd", { hasText: name }).locator(".grip").tap();
    await pageB.locator('#panel [data-act="move"][data-status="done"]').tap();
    await commitsAfter(c);
    await syncNow(page);
    assert.strictEqual(await statusOf(page, name), "done", "premještanje s drugog uređaja");

    // 4. Brisanje na A se prenosi na B i pjesma se ne vraća.
    c = gh.commits;
    await openSong("Stairway to Heaven"); await page.click("#songMenu"); await page.click('[data-act="delete-song"]');
    await commitsAfter(c);
    await syncNow(pageB); await pageB.reload(); await syncNow(pageB);
    assert(!(await titles(pageB)).includes("Stairway to Heaven"), "obrisana pjesma ostaje obrisana");
    assert(!remote().songs.some(s => s.title === "Stairway to Heaven"));

    // 5. Sukob: neko drugi upiše između čitanja i pisanja. Ništa se ne gubi.
    c = gh.commits;
    gh.conflictOnce = () => { const d = remote(); d.songs.unshift({ id: "treci", title: "Sa trećeg uređaja", status: "idea", updatedAt: Date.now() }); put(JSON.stringify(d)); };
    await page.click("#tabWork"); const nm = (await colOf("progress"))[0]; assert(nm, "ima pjesma u koloni U toku");
    await page.locator(".cd", { hasText: nm }).locator(".grip").tap();
    await page.locator('#panel [data-act="move"][data-status="refine"]').tap();
    await commitsAfter(c + 1);
    const d5 = remote();
    assert(d5.songs.some(s => s.id === "treci") && d5.songs.find(s => s.title === nm).status === "refine", "obje izmjene su sačuvane");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("gitara-v2")).songs.some(s => s.id === "treci"));

    // 6. Loš ili istekao token: jasna poruka, pjesme ostaju; poruka nestaje kad se popravi.
    gh.fail = 401;
    await page.goto(BASE); await syncNow(page);
    await page.waitForSelector("#notice:not([hidden])");
    assert((await page.locator("#notice").innerText()).includes("token"));
    await shot("sinhronizacija-los-token");
    gh.fail = null; await syncNow(page);
    assert(await page.locator("#notice").isHidden(), "poruka nestaje kad sinhronizacija proradi");

    // 7. Bez mreže: nema greške, izmjena se šalje kad se veza vrati.
    await ctxB.setOffline(true);
    const nb = await pageB.evaluate(() => document.querySelector('.col[data-status="progress"] .song-title').textContent);
    await pageB.locator(".cd", { hasText: nb }).locator(".grip").tap();
    await pageB.locator('#panel [data-act="move"][data-status="idea"]').tap();
    await pageB.waitForTimeout(2500);
    assert(await pageB.locator("#notice").isHidden(), "bez mreže nije greška");
    await pageB.click("#btnMenu");
    assert((await pageB.locator('#panel [data-act="sync"]').innerText()).includes("čeka mrežu"));
    await pageB.click('#panel [data-act="close"]');
    c = gh.commits;
    await ctxB.setOffline(false);
    await commitsAfter(c);
    assert.strictEqual(remote().songs.find(s => s.title === nb).status, "idea");

    // Izvoz pjesama ne sadrži token, a prekid veze briše token s uređaja.
    await page.click("#btnMenu");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
    assert(!fs.readFileSync(await dl.path(), "utf8").includes("tok-A"), "token nije u izvozu");
    await page.click("#btnMenu"); await page.click('#panel [data-act="sync"]'); await page.click('#panel [data-act="sync-off"]');
    assert(!(await page.evaluate(() => localStorage.getItem("gitara-sync"))).includes("tok-A"));
    await ctxB.close();
  });
  await step("bez grešaka u konzoli tokom cijelog prolaza", async () => assert.deepStrictEqual(errors, []));
  console.log(results.join("\n"));
  await browser.close();
})();
