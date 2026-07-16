// Drives the real homepage: does a card play with nothing touching it, does the cap
// hold on a scroll down the wall, and do the three flagship cards sit in two rows?
import puppeteer from "puppeteer-core";
import path from "node:path";

const SITE = "file://" + path.resolve("/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const browser = await puppeteer.launch({
  headless: "new", executablePath: "/usr/bin/google-chrome",
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.setViewport({ width: 1280, height: 800 });
await page.goto(SITE, { waitUntil: "networkidle2" });
await sleep(1500);

// the header stage is at the top: check it before scrolling anywhere
const stageEarly = await page.evaluate(() =>
  document.querySelector("#stage-frame iframe.stage__canvas")?.getAttribute("src") || null);

// bring the Start-here section into view, then leave the pointer completely alone
await page.evaluate(() => document.getElementById("flagship").scrollIntoView({ block: "center" }));
await sleep(2500);

// 1. autoplay, untouched: the flagship cards carry live iframes with no pointer input
const flag = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#flagship .pcard")];
  return cards.map((c) => ({
    title: c.querySelector(".pcard__title")?.textContent.trim(),
    live: !!c.querySelector("iframe.card-viz"),
    src: c.querySelector("iframe.card-viz")?.getAttribute("src") || null,
  }));
});
console.log("\nSTART-HERE CARDS (untouched):");
for (const f of flag) console.log(`   ${f.live ? "LIVE" : "still"}  ${f.title}  ${f.src || ""}`);
ok(flag.every((f) => f.live), "every Start-here card plays with no hover");
ok(flag.every((f) => !f.src || f.src.includes("compact=1")), "card previews use ?compact=1");

// 2. the header stage is live too
console.log("\nHEADER STAGE ON LOAD: " + (stageEarly || "NOT MOUNTED"));
ok(!!stageEarly, "header stage mounted its viz on load, untouched");

// 3. two rows: card 01 alone on the first row, 02 and 03 sharing the second
const rows = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#flagship .pcard")];
  return cards.map((c) => {
    const r = c.getBoundingClientRect();
    return { top: Math.round(r.top), w: Math.round(r.width) };
  });
});
console.log("\nFLAGSHIP GEOMETRY: " + JSON.stringify(rows));
const tops = [...new Set(rows.map((r) => r.top))];
ok(tops.length === 2, `the 3 cards occupy exactly 2 rows (found ${tops.length})`);
ok(rows[0].w > rows[1].w * 1.5, "card 01 is full width, 02 and 03 are half");
ok(rows[1].top === rows[2].top, "cards 02 and 03 share a row");

// 4. no horizontal scroll, no JS errors
const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!hscroll, "no horizontal page scroll");

// 5. the cap holds while scrolling the whole wall open
await page.evaluate(() => document.getElementById("all-toggle")?.click());
await sleep(600);
let peak = 0;
for (let y = 0; y < 14; y++) {
  await page.evaluate(() => window.scrollBy(0, 700));
  await sleep(450);
  const n = await page.evaluate(() => document.querySelectorAll("iframe.card-viz").length);
  peak = Math.max(peak, n);
}
console.log(`\nPEAK LIVE CARD PREVIEWS DURING A FULL SCROLL: ${peak}`);
ok(peak > 0, "cards played during the scroll without being touched");
ok(peak <= 4, `the desktop cap of 4 held (peak ${peak})`);

console.log("\nJS ERRORS: " + (errs.length ? errs.join("\n") : "none"));
ok(errs.length === 0, "no page errors");

await browser.close();
console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(bad ? 1 : 0);
