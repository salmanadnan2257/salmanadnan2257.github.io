/* Salman Adnan portfolio behavior. No frameworks, no external calls. */

// ============================================================================
// GitHub handle. Every "View code" / GitHub link is built from this one value.
// Repos are not pushed yet, so links point at handle/repo-name and will 404
// until the owner pushes them. Change this in one place to update all links.
const GITHUB_HANDLE = "salmanadnan2257";
// ============================================================================

(function () {
  "use strict";

  var base = "https://github.com/" + GITHUB_HANDLE;

  // Wire every repo link from its data-repo attribute.
  // An empty data-repo points at the profile itself.
  var repoLinks = document.querySelectorAll("a[data-repo]");
  for (var i = 0; i < repoLinks.length; i++) {
    var repo = repoLinks[i].getAttribute("data-repo");
    repoLinks[i].setAttribute("href", repo ? base + "/" + repo : base);
    repoLinks[i].setAttribute("rel", "noopener");
    repoLinks[i].setAttribute("target", "_blank");
  }

  // Current year in the footer.
  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  // Hero headline word rotator: cycles through data-words, fades between them.
  // The h1 min-height is locked to its tallest layout ("customers") so swapping
  // to shorter words never collapses the headline and pushes the photo up/down.
  var rotatorWord = document.querySelector(".word-rotator__word");
  var rotatorBox = document.querySelector(".word-rotator");
  if (rotatorWord && rotatorBox) {
    var words = (rotatorWord.getAttribute("data-words") || "").split(",").filter(Boolean);

    var heroTitle = document.getElementById("hero-title");
    if (heroTitle && words.length > 0) {
      var resizeTimer;
      var lockHeight = function () {
        var cur = rotatorWord.textContent;

        // Lock word-rotator box width to the widest word so the h1 never reflows.
        rotatorBox.style.minWidth = "";
        var maxW = 0;
        words.forEach(function (w) {
          rotatorWord.textContent = w;
          maxW = Math.max(maxW, rotatorWord.scrollWidth);
        });
        rotatorBox.style.minWidth = Math.ceil(maxW) + "px";

        // Lock h1 min-height to tallest layout as a secondary guard.
        rotatorWord.textContent = words[0];
        heroTitle.style.minHeight = "";
        heroTitle.style.minHeight = heroTitle.offsetHeight + "px";

        rotatorWord.textContent = cur;
      };
      lockHeight();
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(lockHeight, 150);
      });
    }

    if (words.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var wIndex = 0;
      setInterval(function () {
        rotatorWord.classList.add("is-swapping");
        setTimeout(function () {
          wIndex = (wIndex + 1) % words.length;
          rotatorWord.textContent = words[wIndex];
          rotatorWord.classList.remove("is-swapping");
        }, 350);
      }, 2200);
    }
  }

  // Reveal sections on scroll, but only when motion is welcome.
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var targets = document.querySelectorAll(
    ".pcard, .mini, .section__head, .stat, .step, .about__photo, .about__copy, .skills__group, .proj-stat, .proj-section, .pain-card"
  );

  if (reduce || !("IntersectionObserver" in window)) {
    for (var j = 0; j < targets.length; j++) { targets[j].classList.add("is-in"); }
    return;
  }

  for (var k = 0; k < targets.length; k++) { targets[k].classList.add("reveal"); }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  for (var m = 0; m < targets.length; m++) { io.observe(targets[m]); }
})();

// ============================================================================
// THE LIVE 3D STAGE ("Start here")
//
// Why one stage and not one per card. Every project page embeds its own 3D piece,
// and the obvious move is to drop those same iframes into the 38 homepage cards.
// Two things were measured before that idea was dropped:
//
//   1. Cost. Thirteen cards, auto-mounted on scroll behind an IntersectionObserver
//      with a hard cap of six live frames and LRU eviction, held the cap and leaked
//      nothing, but took scroll from 57.7 fps to 29.7 fps and spent 5.8 s of a 13.8 s
//      scroll inside tasks longer than 50 ms. Most of that is per-frame JavaScript
//      (a fresh three.js realm and a scene build for every iframe), which no graphics
//      card takes away.
//   2. Legibility. Each piece draws its own title panel, legend, hint and control HUD,
//      sized for a large frame. At card width those four panels cover the scene they
//      exist to explain, and the card ends up saying less than the still it replaced.
//
// So: one stage, given enough room to actually be read, and a rail that swaps which
// system is loaded into it. The budget below is the whole policy. Raising it is the
// only thing anyone should need to change.
// ============================================================================
(function () {
  "use strict";

  var LIVE_BUDGET = 1;             // WebGL contexts this page may hold at once
  /* Build it while it is still below the fold, so the flagship is already running by
     the time the first scroll arrives at it and nobody is served a loading box. Hand
     the context back only once the stage is a long way gone: the two bands are far
     apart on purpose, so a visitor parked at the edge cannot flap it on and off. */
  var NEAR = "600px 0px";
  var FAR = "1400px 0px";

  var frame = document.getElementById("stage-frame");
  var poster = document.getElementById("stage-poster");
  var caption = document.getElementById("stage-caption");
  var grab = document.getElementById("stage-grab");
  var cta = document.getElementById("stage-cta");
  var full = document.getElementById("stage-full");
  var picks = document.querySelectorAll(".stage__pick");
  if (!frame || !poster || !caption || !cta || !full || !picks.length) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Everything currently holding a WebGL context. Oldest first, so evicting the
  // front of the list is a plain LRU. At a budget of 1 it holds one iframe, but the
  // rule is enforced rather than assumed: nothing mounts without paying for a slot.
  var liveFrames = [];

  function evictTo(n) {
    while (liveFrames.length > n) {
      var el = liveFrames.shift();
      // about:blank first: the old document is torn down and its WebGL context is
      // released before the element leaves the tree, rather than at the whim of GC.
      el.src = "about:blank";
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }

  function mount(name) {
    evictTo(LIVE_BUDGET - 1);
    var f = document.createElement("iframe");
    f.className = "stage__canvas";
    f.src = "viz/" + name + ".html";
    f.title = "Interactive 3D visualization of the " + current().title;
    f.setAttribute("allow", "fullscreen");
    f.setAttribute("data-viz-live", name);
    frame.appendChild(f);
    liveFrames.push(f);
  }

  var selected = 0;
  function current() {
    var b = picks[selected];
    return {
      viz: b.getAttribute("data-viz"),
      title: b.getAttribute("data-title"),
      shot: b.getAttribute("data-shot"),
      alt: b.getAttribute("data-alt"),
      caption: b.getAttribute("data-caption"),
      cta: b.getAttribute("data-cta")
    };
  }

  var inView = false;

  function paint() {
    var c = current();
    poster.src = c.shot;
    poster.alt = c.alt;
    caption.innerHTML = "";
    var strong = document.createElement("strong");
    strong.textContent = c.title + ".";
    caption.appendChild(strong);
    caption.appendChild(document.createTextNode(" " + c.caption));
    cta.href = "projects/" + c.viz + ".html";
    cta.textContent = c.cta + " →";
    full.href = "viz/" + c.viz + ".html";
    for (var i = 0; i < picks.length; i++) {
      var on = i === selected;
      picks[i].classList.toggle("is-on", on);
      picks[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function sync() {
    if (reduce) return;                       // the still is the whole experience here
    var want = inView ? current().viz : null;
    var have = liveFrames.length ? liveFrames[liveFrames.length - 1].getAttribute("data-viz-live") : null;
    if (want === have) return;
    if (!want) { evictTo(0); return; }
    mount(want);
  }

  for (var p = 0; p < picks.length; p++) {
    (function (i) {
      picks[i].addEventListener("click", function () {
        if (i === selected) return;
        selected = i;
        paint();
        sync();
      });
    })(p);
  }

  // Reduced motion gets the still and the switcher, and is told so plainly rather
  // than being left to wonder why the promised drag does nothing.
  if (reduce) {
    if (grab) grab.textContent = "Reduced motion: showing the still · open it full screen to run it";
    paint();
    return;
  }

  if (!("IntersectionObserver" in window)) { inView = true; paint(); sync(); return; }

  // Near: build it. Far: hand the context back. The two bands do not touch, so a
  // visitor parked at the edge of the stage cannot flap it on and off.
  new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      if (es[i].isIntersecting && !inView) { inView = true; sync(); }
    }
  }, { rootMargin: NEAR, threshold: 0 }).observe(frame);

  new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      if (!es[i].isIntersecting && inView) { inView = false; sync(); }
    }
  }, { rootMargin: FAR, threshold: 0 }).observe(frame);

  paint();
})();

// ============================================================================
// HERO BACKGROUND: three modes, one canvas
//
// The site is neo-brutalist print: cream paper, 4px black rules, hard offset
// shadows with no blur, zero border radius, and hover states that snap in 0.1s
// rather than easing. A soft, glowing, floating background would read as a
// different website pasted behind the headline. So all three modes are built on
// the material already in the CSS (the 24px dot grid) and all motion is STEPPED,
// never interpolated. Dots snap between alpha levels. Rules grow one 24px cell at
// a time. Nothing fades.
//
//   grid    Live grid. The dot grid breathes on a slow diagonal wave, and every
//           second or so one dot pops into a hard coral or yellow square, like a
//           check turning green.
//   deploy  Deploy line. A 2px rule travels the grid, stops, and drops a square
//           with a hard offset shadow: a commit landing, work shipping. Rules and
//           squares are geometrically excluded from the copy box, so a black rule
//           can never cross the black headline.
//   print   Misregistration. Three dot grids (coral, yellow, purple) drift out of
//           register and snap back, like a risograph pull. Multiply blending means
//           the aligned state reads as the familiar dark grid, and only the drift
//           shows colour, always at the margins.
//
// Cost control: one 2D canvas, no libraries, DPR capped at 2, a single rAF that
// stops entirely when the hero scrolls away or the tab is hidden. Init is deferred
// past load so it cannot touch LCP. Reduced motion and low-core devices get one
// static frame and no loop at all; the switcher still works, so the modes remain
// browsable without any animation running.
// ============================================================================
(function () {
  "use strict";

  var canvas = document.getElementById("hero-bg");
  var hero = document.querySelector(".hero");
  var bar = document.getElementById("hero-bgbar");
  var note = document.getElementById("hero-bgnote");
  var picks = document.querySelectorAll(".bgswitch__pick");
  if (!canvas || !hero || !bar || !picks.length) return;

  var ctx = canvas.getContext && canvas.getContext("2d");
  // No canvas, or no Path2D (which the batched dot drawing below depends on): leave
  // the CSS dot grid exactly as it was and never show the switcher.
  if (!ctx || !window.Path2D) return;

  // ---- Tunables -------------------------------------------------------------
  var CELL = 24;              // grid pitch. Must stay in step with the 24px CSS dot grid
  var DOT = 1.5;              // dot radius, matches the CSS radial-gradient stop
  var A_MIN = 0.04;           // quietest dot (black alpha)
  var A_MAX = 0.09;           // loudest dot. Above ~0.12 the headline starts to fight it
  var STEP_HZ = 6;            // wave updates per second. Low on purpose: snap, not glide
  var POP_EVERY = 1100;       // ms between dot pops (live grid)
  var POP_HOLD = 260;         // ms a pop stays up, then snaps out with no fade
  var POP_SIZE = 6;           // px square for a pop
  var DEPLOY_EVERY = 2200;    // ms between deploy events
  var DEPLOY_MAX = 2;         // concurrent deploy events. More than 2 reads as noise
  var GROW_MS = 900;          // rule travel time
  var HOLD_MS = 900;          // how long the dropped square sits there
  var RETRACT_MS = 500;       // rule pulling back
  var RULE_W = 2;             // rule thickness
  var SQ = 10;                // dropped square size
  var SQ_OFF = 4;             // its hard shadow offset, the site's --shadow-sm language
  var PRINT_CYCLE = 16000;    // ms for one full out-of-register and back
  var PRINT_AMP = 7;          // px of maximum misregistration
  var PRINT_ALPHA = 0.40;     // per-layer alpha before multiply, out at the margins
  var PRINT_QUIET = 0.12;     // and behind the copy, where the text has to win
  var SAFE_PAD = 14;          // px of clearance kept around the copy box
  var MAX_DPR = 2;            // retina cap. Past 2 the cost doubles and nobody can tell
  // ---------------------------------------------------------------------------

  // Colours come from the CSS custom properties, never from hardcoded hexes here.
  // If the palette changes in :root, this background follows it.
  var css = getComputedStyle(document.documentElement);
  function token(name, fallback) {
    var v = css.getPropertyValue(name).trim();
    return v || fallback;
  }
  var CREAM = token("--cream", "#FFFDF5");
  var INK = token("--ink", "#000000");
  var CORAL = token("--coral", "#FF6B6B");
  var YELLOW = token("--yellow", "#FFD93D");
  var PURPLE = token("--purple", "#C4B5FD");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Two cores or fewer: draw the still and never start a loop. A phone that cannot
  // hold 60fps is better served by a clean static grid than by a stuttering one.
  var lowPower = (navigator.hardwareConcurrency || 4) <= 2;
  var still = reduce || lowPower;

  var W = 0, H = 0, dpr = 1;
  // Everything the background must keep off: the copy box (eyebrow through links)
  // and the portrait. A 2px black rule across a black headline is unreadable, and a
  // rule across the face is worse, so both are treated as solid and drawn around.
  var blocks = [];
  var rows = [];       // free horizontal runs on the grid, where a rule may actually fit
  var mode = "grid";
  var raf = 0, running = false, inView = false;
  var pops = [], events = [];
  var lastPop = 0, lastDeploy = -1;   // -1: the first event is scheduled on the first frame
  var stillEvent = null;              // the single held rule drawn in reduced-motion mode
  var FIRST_DEPLOY = 700;             // ms before the first rule runs. Long enough to
                                      // not compete with the headline landing, short
                                      // enough that nobody misses the idea and scrolls on.

  function snap(v) { return Math.round(v / CELL) * CELL; }

  function measure() {
    var r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    blocks = [];
    var sel = [".hero__copy", ".hero__photo"];
    for (var i = 0; i < sel.length; i++) {
      var el = hero.querySelector(sel[i]);
      if (!el) continue;
      var b = el.getBoundingClientRect();
      blocks.push({
        x0: b.left - r.left - SAFE_PAD,
        y0: b.top - r.top - SAFE_PAD,
        x1: b.right - r.left + SAFE_PAD,
        y1: b.bottom - r.top + SAFE_PAD
      });
    }
    computeRows();
  }

  // Is this point sitting under the copy. Used to calm the print layers where they
  // pass behind text: the fringe belongs at the margins, not under the lead.
  function underCopy(x, y) {
    var b = blocks[0];
    return !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  // Does a rect touch anything we must keep clear.
  function blocked(x, y, w, h) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (x < b.x1 && x + w > b.x0 && y < b.y1 && y + h > b.y0) return true;
    }
    return false;
  }

  // The free space is worked out up front rather than by rejection sampling, which
  // wasted most spawns (the copy box alone covers most of the stacked mobile hero)
  // and left long dead stretches. For each grid row, subtract the blocked rects from
  // the full width: what is left is a list of runs a rule can actually live in.
  function computeRows() {
    var m = CELL;                 // one cell of margin off every edge
    var minRun = 5 * CELL;        // shorter than this is not a rule, it is a dash
    rows = [];
    var total = 0;

    for (var y = m; y <= H - m; y += CELL) {
      // Start with the whole width, then cut out every block this row passes through.
      var runs = [{ x0: m, x1: W - m }];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (y + RULE_W < b.y0 || y > b.y1) continue;    // this row misses the block
        var next = [];
        for (var j = 0; j < runs.length; j++) {
          var run = runs[j];
          if (b.x1 <= run.x0 || b.x0 >= run.x1) { next.push(run); continue; }
          if (b.x0 > run.x0) next.push({ x0: run.x0, x1: b.x0 });   // piece left of it
          if (b.x1 < run.x1) next.push({ x0: b.x1, x1: run.x1 });   // piece right of it
        }
        runs = next;
      }
      for (var k = 0; k < runs.length; k++) {
        if (runs[k].x1 - runs[k].x0 < minRun) continue;
        var row = { y: y, x0: runs[k].x0, x1: runs[k].x1 };
        row.w = row.x1 - row.x0;     // weight by length: long runs host more events
        total += row.w;
        rows.push(row);
      }
    }
    for (var n = 0; n < rows.length; n++) rows[n].w /= total || 1;
  }

  function pickRow() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < rows.length; i++) {
      acc += rows[i].w;
      if (r <= acc) return rows[i];
    }
    return rows.length ? rows[rows.length - 1] : null;
  }

  // --- Shared: the dot grid --------------------------------------------------
  // Dots land at the centre of each 24px tile, which is where the CSS
  // radial-gradient puts them, so swapping CSS for canvas moves nothing.
  //
  // Every dot at the same alpha goes into one path and is filled once. The naive
  // version (set fillStyle, beginPath, arc, fill, per dot) cost one fill call per
  // dot: about 2,000 per layer, and print mode draws three layers, so over 6,000
  // fills a frame. That measured 45fps. Batching by alpha takes it to a handful of
  // fills a frame, because every mode here only ever uses a few distinct alphas.
  var TAU = Math.PI * 2;

  function dots(alphaAt, color, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    var levels = {};    // alpha -> Path2D holding every dot at that alpha

    for (var y = CELL / 2; y < H + CELL; y += CELL) {
      for (var x = CELL / 2; x < W + CELL; x += CELL) {
        var a = alphaAt(x, y);
        if (a <= 0) continue;
        var key = a.toFixed(3);
        var p = levels[key];
        if (!p) { p = levels[key] = new Path2D(); }
        var cx = x + ox, cy = y + oy;
        p.moveTo(cx + DOT, cy);          // move first: without it each arc is joined
        p.arc(cx, cy, DOT, 0, TAU);      // to the last by a stray line
      }
    }

    ctx.fillStyle = color;
    for (var k in levels) {
      if (!Object.prototype.hasOwnProperty.call(levels, k)) continue;
      ctx.globalAlpha = parseFloat(k);
      ctx.fill(levels[k]);
    }
    ctx.globalAlpha = 1;
  }

  // Three alpha levels, chosen by a quantized diagonal wave. The quantization is
  // the whole point: a smooth sine would look like every other gradient background.
  function waveAlpha(t) {
    var tq = Math.floor(t / 1000 * STEP_HZ) / STEP_HZ;   // time in visible steps
    return function (x, y) {
      var w = Math.sin((x * 0.014) + (y * 0.022) - tq * 1.6);
      if (w < -0.33) return A_MIN;
      if (w < 0.33) return (A_MIN + A_MAX) / 2;
      return A_MAX;
    };
  }
  function flatAlpha() { return function () { return 0.05; }; }

  // --- Mode: live grid -------------------------------------------------------
  function drawGrid(t) {
    if (still) {
      if (!changed("still-grid")) return;
      ctx.clearRect(0, 0, W, H);
      dots(flatAlpha(), INK, 0, 0);
      return;
    }

    if (t - lastPop > POP_EVERY) {
      lastPop = t;
      // Pops keep off the copy and the portrait: a hard coral square under the lead
      // paragraph, or on a cheekbone, is exactly the kind of small thing that costs
      // you a read.
      for (var tries = 0; tries < 8; tries++) {
        var px = snap(Math.random() * W) + CELL / 2;
        var py = snap(Math.random() * H) + CELL / 2;
        if (px > W - CELL || py > H - CELL) continue;
        if (blocked(px - POP_SIZE / 2, py - POP_SIZE / 2, POP_SIZE, POP_SIZE)) continue;
        pops.push({ x: px, y: py, c: Math.random() < 0.5 ? CORAL : YELLOW, born: t });
        break;
      }
    }

    for (var i = pops.length - 1; i >= 0; i--) {
      if (t - pops[i].born > POP_HOLD) pops.splice(i, 1);   // snaps out, never fades
    }

    // The wave only moves STEP_HZ times a second and pops snap on and off, so most
    // frames would repaint pixel-for-pixel what is already on screen. Paint only when
    // the state that is actually visible has changed.
    var tq = Math.floor(t / 1000 * STEP_HZ);
    var sig = "g" + tq + ":" + pops.length + ":" + (pops.length ? pops[0].born : 0);
    if (!changed(sig)) return;

    ctx.clearRect(0, 0, W, H);
    dots(waveAlpha(t), INK, 0, 0);
    for (var k = 0; k < pops.length; k++) {
      var p = pops[k];
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - POP_SIZE / 2, p.y - POP_SIZE / 2, POP_SIZE, POP_SIZE);
    }
  }

  // --- Mode: deploy line -----------------------------------------------------
  // A rule is only ever drawn in the horizontal gaps left by the copy box, so a
  // 2px black line physically cannot run through the headline.
  function rule(y, xa, xb) {
    if (xb <= xa) return;

    // Clip the run against every block, so even if the layout shifts between
    // measures a rule can never be painted across the headline or the portrait.
    var runs = [{ x0: xa, x1: xb }];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (y + RULE_W < b.y0 || y > b.y1) continue;
      var next = [];
      for (var j = 0; j < runs.length; j++) {
        var run = runs[j];
        if (b.x1 <= run.x0 || b.x0 >= run.x1) { next.push(run); continue; }
        if (b.x0 > run.x0) next.push({ x0: run.x0, x1: b.x0 });
        if (b.x1 < run.x1) next.push({ x0: b.x1, x1: run.x1 });
      }
      runs = next;
    }

    ctx.fillStyle = INK;
    for (var k = 0; k < runs.length; k++) {
      ctx.fillRect(runs[k].x0, y, runs[k].x1 - runs[k].x0, RULE_W);
    }
  }

  // Returns true only if an event was actually created, so a failed spawn does not
  // burn the interval and leave the hero empty for another few seconds.
  function spawnDeploy(t) {
    var row = pickRow();
    if (!row) return false;

    var room = Math.floor((row.x1 - row.x0) / CELL);        // whole cells this run can hold
    if (room < 5) return false;
    var cells = Math.min(room, 4 + Math.floor(Math.random() * 9));   // 4 to 12 cells long
    var slack = room - cells;
    var x0 = row.x0 + Math.floor(Math.random() * (slack + 1)) * CELL;
    var x1 = x0 + cells * CELL;
    var y = row.y;

    // The square is the loudest thing this mode draws, so it gets its own check:
    // it must sit entirely clear of the copy and the portrait, shadow included.
    if (blocked(x1 - SQ / 2, y - SQ / 2, SQ + SQ_OFF, SQ + SQ_OFF)) return false;

    events.push({
      y: y, x0: x0, cells: cells, born: t,
      c: Math.random() < 0.5 ? CORAL : PURPLE
    });
    return true;
  }

  function drawDeploy(t) {
    if (still) {
      // One finished event, held. It shows what the mode is without moving. The row
      // is picked from the same free runs, so the still obeys the same exclusions.
      if (!stillEvent && rows.length) {
        var mid = rows[Math.floor(rows.length / 2)];
        var cs = Math.min(Math.floor((mid.x1 - mid.x0) / CELL), 8);
        stillEvent = { y: mid.y, x0: mid.x0, x1: mid.x0 + cs * CELL };
      }
      if (!changed("still-deploy")) return;
      ctx.clearRect(0, 0, W, H);
      dots(flatAlpha(), INK, 0, 0);
      if (stillEvent) {
        rule(stillEvent.y, stillEvent.x0, stillEvent.x1);
        square(stillEvent.x1, stillEvent.y, CORAL);
      }
      return;
    }

    // Anchor the schedule to the first frame we actually render. Without this the
    // clock is time-since-navigation, so the first rule lands whenever load happened
    // to finish, which is neither predictable nor pleasant.
    if (lastDeploy < 0) lastDeploy = t - (DEPLOY_EVERY - FIRST_DEPLOY);

    if (t - lastDeploy > DEPLOY_EVERY && events.length < DEPLOY_MAX) {
      if (spawnDeploy(t)) lastDeploy = t;                   // only a real event resets the clock
    }

    // Work out the stepped geometry of every live event, then paint only if it
    // differs from what is already on screen. A rule gains a whole cell at a time,
    // so between steps there is nothing new to draw.
    var LIFE = GROW_MS + HOLD_MS + RETRACT_MS;
    var shown = [];
    for (var i = events.length - 1; i >= 0; i--) {
      var e = events[i];
      var age = t - e.born;
      if (age > LIFE) { events.splice(i, 1); continue; }

      var xa = e.x0, xb, showSquare = false;

      if (age < GROW_MS) {
        // Stepped growth: the rule gains whole 24px cells, never fractions of one.
        xb = e.x0 + Math.round(e.cells * (age / GROW_MS)) * CELL;
      } else if (age < GROW_MS + HOLD_MS) {
        xb = e.x0 + e.cells * CELL;
        showSquare = true;
      } else {
        var k = (age - GROW_MS - HOLD_MS) / RETRACT_MS;
        xa = e.x0 + Math.round(e.cells * k) * CELL;         // retracts from the left
        xb = e.x0 + e.cells * CELL;
        showSquare = k < 0.6;
      }

      shown.push({ y: e.y, xa: xa, xb: xb, sq: showSquare, c: e.c });
    }

    var sig = "d";
    for (var s = 0; s < shown.length; s++) {
      sig += "|" + shown[s].y + "," + shown[s].xa + "," + shown[s].xb + "," + (shown[s].sq ? 1 : 0);
    }
    if (!changed(sig)) return;

    ctx.clearRect(0, 0, W, H);
    dots(flatAlpha(), INK, 0, 0);                           // the quiet bed
    for (var n = 0; n < shown.length; n++) {
      rule(shown[n].y, shown[n].xa, shown[n].xb);
      if (shown[n].sq) square(shown[n].xb, shown[n].y, shown[n].c);
    }
  }

  function square(x, y, shadow) {
    var sx = x - SQ / 2, sy = y - SQ / 2 + RULE_W / 2;
    ctx.fillStyle = shadow;                                  // hard offset shadow first,
    ctx.fillRect(sx + SQ_OFF, sy + SQ_OFF, SQ, SQ);          // no blur, the site's own idiom
    ctx.fillStyle = INK;
    ctx.fillRect(sx, sy, SQ, SQ);
  }

  // --- Mode: misregistration -------------------------------------------------
  // Multiply needs an opaque backdrop to blend into, so this mode paints the cream
  // itself. It reads identically to the page behind it because the fill is the same
  // --cream token. Aligned, the three layers stack into one dark dot; drifting, they
  // fringe into coral, yellow and purple.
  var PRINT_DIRS = [[1, 0.6], [-0.8, 1], [0.3, -1]];
  var PRINT_COLORS = [CORAL, YELLOW, PURPLE];

  function printAmp(t) {
    if (still) return 0;                                     // locked in register
    var u = (t % PRINT_CYCLE) / PRINT_CYCLE;
    if (u < 0.35) return 0;                                  // long hold, in register
    var s = (u - 0.35) / 0.65;
    return Math.round(Math.sin(s * Math.PI) * PRINT_AMP);    // out and back, whole px only
  }

  function drawPrint(t) {
    var amp = printAmp(t);

    // The offset is rounded to whole pixels, so it holds each value for many frames
    // and sits at zero for a third of the cycle. Repainting an unchanged offset is
    // pure waste: three full dot layers and three blends for an identical picture.
    if (!changed("p" + amp)) return;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "multiply";
    // Three layers at full strength would put a busy coloured grid under the lead
    // paragraph. Behind the copy they drop to PRINT_QUIET, so the drift still reads
    // at the margins while the text keeps a near-clean cream backdrop.
    var alpha = function (x, y) { return underCopy(x, y) ? PRINT_QUIET : PRINT_ALPHA; };
    for (var i = 0; i < 3; i++) {
      dots(alpha, PRINT_COLORS[i], PRINT_DIRS[i][0] * amp, PRINT_DIRS[i][1] * amp);
    }
    ctx.restore();
  }

  // --- Loop ------------------------------------------------------------------
  // Every mode here is stepped, so most frames would repaint exactly what is already
  // on screen. Each mode hands its visible state to changed(); if that state has not
  // moved, the frame does no clearing, no path building and no blending at all. The
  // rAF loop keeps running (it is what notices the next step), but it costs almost
  // nothing between steps.
  var lastSig = null;
  function changed(sig) {
    if (sig === lastSig) return false;
    lastSig = sig;
    return true;
  }
  function invalidate() { lastSig = null; }   // force the next frame to repaint

  function frame(t) {
    if (mode === "deploy") drawDeploy(t);
    else if (mode === "print") drawPrint(t);
    else drawGrid(t);
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (still || running || !inView) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function paintOnce() { frame(performance.now()); }        // one frame, no loop

  function setMode(next, remember) {
    mode = next;
    pops = [];
    events = [];
    lastDeploy = -1;   // re-arm, so switching into deploy shows a rule within FIRST_DEPLOY
    invalidate();      // different mode: whatever is on the canvas is now wrong
    for (var i = 0; i < picks.length; i++) {
      var on = picks[i].getAttribute("data-bg") === next;
      picks[i].classList.toggle("is-on", on);
      picks[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (remember) {
      try { localStorage.setItem("hero-bg", next); } catch (err) { /* private mode: fine */ }
    }
    if (still || !running) paintOnce();
  }

  for (var i = 0; i < picks.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        setMode(btn.getAttribute("data-bg"), true);
      });
    })(picks[i]);
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      measure();
      stillEvent = null;   // rows moved, so the held still must be re-placed
      invalidate();        // and the canvas was resized, which clears it anyway
      if (still || !running) paintOnce();
    }, 150);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  function init() {
    hero.classList.add("is-canvas");    // the CSS dot grid steps aside, canvas takes over
    bar.hidden = false;                 // only now is the switcher real, so only now is it shown
    if (still && note) note.hidden = false;

    measure();

    var saved = null;
    try { saved = localStorage.getItem("hero-bg"); } catch (err) { saved = null; }
    setMode(saved === "deploy" || saved === "print" ? saved : "grid", false);

    if (still) { paintOnce(); return; }

    if (!("IntersectionObserver" in window)) { inView = true; start(); return; }
    new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        inView = entries[j].isIntersecting;
        if (inView) start(); else stop();
      }
    }, { threshold: 0 }).observe(hero);
  }

  // Deferred past load: the header background must never be on the critical path
  // to the largest paint, which is the headline and the portrait, not this.
  function defer() {
    if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 1200 });
    else setTimeout(init, 200);
  }
  if (document.readyState === "complete") defer();
  else window.addEventListener("load", defer);
})();
