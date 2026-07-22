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
      // The 180 matches the fade in styles.css; the word is swapped at the far
      // end of it, while it is invisible. Change the two together.
      setInterval(function () {
        rotatorWord.classList.add("is-swapping");
        setTimeout(function () {
          wIndex = (wIndex + 1) % words.length;
          rotatorWord.textContent = words[wIndex];
          rotatorWord.classList.remove("is-swapping");
        }, 180);
      }, 1400);
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
// THE LIVE 3D STAGE ("See it running")
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
  var picks = document.querySelectorAll(".stage__pick");
  if (!frame || !poster || !caption || !picks.length) return;

  var convertCopy = document.getElementById("stage-convert-copy");
  var convertCta = document.getElementById("stage-convert-cta");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // No WebGL means no live scene, so there is nothing to mount and nothing to drag.
  // That visitor is served exactly like the reduced-motion one: the still, and the
  // offer, which is the part that actually matters.
  function webglOK() {
    try {
      if (!window.WebGLRenderingContext) return false;
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  }
  var still = reduce || !webglOK();

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
    var num = b.querySelector(".stage__pick-num");
    return {
      viz: b.getAttribute("data-viz"),
      title: b.getAttribute("data-title"),
      shot: b.getAttribute("data-shot"),
      alt: b.getAttribute("data-alt"),
      caption: b.getAttribute("data-caption"),
      num: num ? num.textContent.trim() : ""
    };
  }

  // --------------------------------------------------------------------------
  // THE OFFER
  //
  // The way into the loaded project sits under the model and under the rail, and it
  // is simply always there. It used to be earned: a panel that grew in only once a
  // visitor had genuinely dragged the model for a spell. That gate read pointer
  // events by reaching into the same-origin iframe, with a focus-loss heuristic as
  // the fallback, and neither could see a touch inside a cross-origin frame, so the
  // one visitor most likely to be holding a phone could be left with no way through.
  // A permanent button costs nothing and cannot fail to appear. Its text is still
  // rebuilt from the rail data in paint(), so it always names the loaded system.
  // --------------------------------------------------------------------------

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
    for (var i = 0; i < picks.length; i++) {
      var on = i === selected;
      picks[i].classList.toggle("is-on", on);
      picks[i].setAttribute("aria-pressed", on ? "true" : "false");
    }

    // The offer is rebuilt from the same data the rail just switched to, so it always
    // names the system that is actually loaded, whichever one that is.
    if (convertCopy) {
      convertCopy.innerHTML = "";
      var hold = document.createElement("strong");
      hold.textContent = "You are holding " + c.title + ".";
      convertCopy.appendChild(hold);
      if (c.num) convertCopy.appendChild(document.createTextNode(" " + c.num + "."));
    }
    if (convertCta) {
      convertCta.href = "projects/" + c.viz + ".html";
      convertCta.textContent = "Open " + c.title + " →";
    }
  }

  function sync() {
    if (still) return;                        // the still is the whole experience here
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

  // Reduced motion, or a browser with no WebGL, gets the still and the switcher, and is
  // told so plainly rather than being left to wonder why the promised drag does nothing.
  // The offer is shown to them at once: there is no drag to earn it with, and the offer
  // is the point of the whole stage.
  if (still) {
    if (grab) {
      grab.textContent = reduce
        ? "Reduced motion: showing the still instead of the live 3D"
        : "This browser has no 3D support: showing the still instead";
    }
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
// CARD PREVIEW: the live 3D that is already playing when the card arrives
//
// A card plays because it is on the screen. There is no hover to find and no tap to
// spend: a visitor who never touches anything still sees the work moving, which is
// the whole point of having built it in 3D.
//
// The cost is real and the cap is the answer to it. An earlier attempt mounted every
// card's viz on scroll behind a cap of six and took scroll from 57.7 fps to 29.7 fps,
// because a fresh three.js realm and a scene build is per-frame JavaScript that no
// graphics card takes off you. So the budget here is deliberately small (4 contexts
// with a mouse, 2 with a finger), the LRU is enforced rather than assumed, and a card
// that leaves the screen hands its context straight back. THIS IS THE WHOLE POLICY;
// the frame-rate cost above was measured at a cap of six, so raising these past it is
// how this section becomes the problem it used to be. Re-measure if you touch them.
//
// The other half of the old problem was legibility, and the viz files now solve it
// themselves: ?compact=1 hides the title panel, the legend and the control HUD, so
// at card width the scene is the whole frame instead of being buried under four
// panels written for a large one.
//
// THE RULE THAT MAKES THIS SAFE ON A PHONE: the iframe is pointer-events: none. It
// is a preview, not a control. A finger can never be caught by it, a vertical swipe
// that starts on a card scrolls the page exactly as if the card were a picture, and
// a tap anywhere on the card, including on the live canvas, still opens the project.
// Dragging a scene with your hands lives on the stage above and on the project pages.
// That rule is why a preview can play unasked without ever costing a visitor a scroll.
// ============================================================================
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;  // the still is the whole experience

  // A card plays because it is on the screen, not because it was pointed at: a
  // visitor should never have to discover that a still is secretly alive. The cap is
  // what keeps that affordable: a hard budget of WebGL contexts, so a scroll down the
  // 38-card wall runs the few cards actually in front of the visitor and hands every
  // other context straight back.
  // WHAT THE CAP IS WORTH, MEASURED. On the homepage with the wall open, sitting still,
  // under a software rasterizer (this machine has no hardware GL in headless Chrome, so
  // these are NOT real-GPU numbers and must not be quoted as any visitor's frame rate):
  //
  //     live scenes:   0      1      2      3
  //     idle fps:      60.6   31.9   17.8   12.8
  //
  // The cost is per playing scene and close to linear, so the cap IS the performance
  // policy: every point of it is paid for on the weakest device that loads this page.
  // Raise these numbers only against a measurement on real hardware.
  var DESKTOP_CAP = 4;      // WebGL contexts the cards may hold at once, with a mouse
  var TOUCH_CAP = 2;        // ... and with a finger. The stage holds its own, separately.
  // ASK WHETHER IT IS A PHONE, NOT WHETHER IT IS A DESKTOP. A real touch screen always
  // reports pointer: coarse, but plenty of engines report neither hover: hover nor
  // pointer: fine when they have no opinion (headless Chrome says exactly that at every
  // viewport), and asking the question the other way round quietly demotes those to the
  // phone budget. Unknown means desktop, because only a phone says coarse.
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var CAP = coarse ? TOUCH_CAP : DESKTOP_CAP;

  // ONE CARD IS EXCLUDED. disappearing-text-app renders as a mostly empty frame with one
  // small word and a countdown ring in it: at card size that is a blank box with a
  // speck, which says less than the screenshot it would be replacing. It keeps its
  // still. Every other card gets the live preview.
  var NO_PREVIEW = { "disappearing-text-app": true };

  var cards = document.querySelectorAll(".pcard, .mini");
  if (!cards.length) return;

  // Everything currently holding a context.
  var live = [];
  // Every card currently within the bands below: the candidates, cap or no cap.
  var near = [];

  function vizOf(card) {
    var href = card.getAttribute("href") || "";
    var m = href.match(/projects\/([a-z0-9-]+)\.html$/);
    if (!m || NO_PREVIEW[m[1]]) return null;   // no name, no listeners, no preview
    return m[1];
  }

  function indexOfCard(card) {
    for (var i = 0; i < live.length; i++) if (live[i].card === card) return i;
    return -1;
  }

  function unmount(card) {
    var i = indexOfCard(card);
    if (i < 0) return;
    var e = live.splice(i, 1)[0];
    // about:blank first, so the old document is torn down and its WebGL context
    // released now, rather than whenever garbage collection gets round to it.
    e.f.src = "about:blank";
    if (e.f.parentNode) e.f.parentNode.removeChild(e.f);
  }

  function mount(card) {
    if (indexOfCard(card) >= 0) return;              // already running
    var name = vizOf(card);
    var media = card.querySelector(".pcard__media, .mini__media");
    if (!name || !media) return;
    var f = document.createElement("iframe");
    f.className = "card-viz";
    f.src = "viz/" + name + ".html?compact=1";       // compact: no panels over the scene
    f.setAttribute("title", "Live 3D preview");
    f.setAttribute("aria-hidden", "true");           // decoration: the screenshot's alt text is the real description
    f.setAttribute("tabindex", "-1");                // and it is never a tab stop
    f.setAttribute("scrolling", "no");
    media.appendChild(f);
    live.push({ card: card, f: f });
  }

  // WHY NOT AN LRU. The obvious budget is "evict whatever mounted longest ago", and it
  // is wrong here: three cards arriving together mount in DOM order, so the oldest is
  // the TOP one, which on a scroll down is the one the visitor is looking at. It would
  // be killed to make room for a card entering from the bottom edge, and because it is
  // still on screen no observer would ever fire for it again, so it would stay a still
  // for good. So the budget is spent on position instead: whatever is closest to the
  // middle of the screen plays, and the cap falls on the cards nearest the edges. That
  // is also self-healing. Every pass rebuilds the whole set from where things ARE, so a
  // card can never be left wrongly dead.
  function middle(card) {
    var r = card.getBoundingClientRect();
    return Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
  }

  // A card already playing is worth this many pixels of head start. Without it, the two
  // cards either side of the cap line swap places on the smallest scroll, and each swap
  // is a WebGL context torn down and a three.js scene rebuilt: the ranking has to be
  // sticky, or a slow scroll costs more than no cap at all. A challenger has to be
  // clearly closer to the middle, not a hair closer, before it takes a running slot.
  var STICKY = 240;

  function score(card) {
    return middle(card) - (indexOfCard(card) >= 0 ? STICKY : 0);
  }

  function reconcile() {
    var want = near.slice().sort(function (a, b) { return score(a) - score(b); }).slice(0, CAP);
    for (var i = live.length - 1; i >= 0; i--) {
      if (want.indexOf(live[i].card) < 0) unmount(live[i].card);   // out of view, or capped out
    }
    for (var j = 0; j < want.length; j++) mount(want[j]);
  }

  // NOTHING IS BUILT WHILE THE PAGE IS MOVING. Building a scene is a fresh three.js
  // realm on the main thread, and a pass per scroll frame drops that build into the
  // middle of the scroll it is meant not to spoil. Waiting for the scroll to settle
  // costs nothing a visitor can perceive, since they were not reading a card they were
  // flying past, and a card still on screen when they stop is playing SETTLE ms later.
  //
  // BE HONEST ABOUT WHAT THIS DID AND DID NOT BUY. Deferring the builds was measured at
  // about +1.5 fps, well inside the noise: it is cheap insurance and good manners, not
  // the fix. What actually costs is each scene that is playing at all, and the cap is
  // the only real lever on that. See the note above CAP, and the frame-rate entry in
  // the README's "not yet verified" list before trusting any of it on real hardware.
  var SETTLE = 180;
  var timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(reconcile, SETTLE);
  }

  // No IntersectionObserver means no way to know what is on the screen, and mounting
  // all 38 regardless is exactly the thing the cap exists to prevent. That visitor
  // keeps the screenshots, which is what they were seeing before this ran anyway.
  if (!("IntersectionObserver" in window)) return;

  // ON is deliberately the smaller band and OFF the larger one, and they do not touch.
  // A card mounts a little before it arrives, and holds its context until it is well
  // clear of the screen, so a visitor parked at the edge of one cannot flap it on and
  // off. Eviction stays the LRU's job: when more cards are on screen than the cap
  // allows, the newest arrivals win and the oldest hands its context back.
  var ON = "150px 0px";
  var OFF = "900px 0px";

  var on = new IntersectionObserver(function (es) {
    for (var k = 0; k < es.length; k++) {
      if (es[k].isIntersecting && near.indexOf(es[k].target) < 0) near.push(es[k].target);
    }
    schedule();
  }, { rootMargin: ON, threshold: 0 });

  var off = new IntersectionObserver(function (es) {
    for (var k = 0; k < es.length; k++) {
      if (es[k].isIntersecting) continue;
      var i = near.indexOf(es[k].target);
      if (i >= 0) near.splice(i, 1);
    }
    schedule();
  }, { rootMargin: OFF, threshold: 0 });

  for (var i = 0; i < cards.length; i++) {
    if (!vizOf(cards[i])) continue;                  // no viz, no observer, no preview
    on.observe(cards[i]);
    off.observe(cards[i]);
  }

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
})();

// ============================================================================
// THE FOLDED WALL: one flagship, and 38 projects one button away
//
// Thirty-eight cards asks a stranger to choose, and a stranger who has to choose
// scrolls. So the page leads with one project and folds the rest.
//
// What is NOT done here, on purpose: the 37 other cards are never injected. They ship
// in the HTML, in the ordinary flow, and this only folds them with a class. So the
// markup a crawler reads is the whole portfolio, a visitor with no JavaScript sees the
// whole portfolio (the toggle is not even shown to them), and nothing about the fold
// can lose a card, a hook, a badge or a link.
//
// The button is a real <button> carrying aria-expanded and aria-controls, so a screen
// reader is told there is more and a keyboard can open it. Any in-page link that points
// INTO the folded region (the nav's "Work", the hero's "See what I've built") opens it
// on the way, so no anchor on this page can ever land on nothing.
// ============================================================================
(function () {
  "use strict";

  var btn = document.getElementById("all-toggle");
  var all = document.getElementById("all-projects");
  if (!btn || !all) return;

  var OPEN_LABEL = "See all 38 projects";
  var SHUT_LABEL = "Hide the full list";

  function open() {
    if (all.classList.contains("is-open")) return;
    all.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    btn.textContent = SHUT_LABEL;
  }
  function shut() {
    all.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = OPEN_LABEL;
  }

  btn.addEventListener("click", function () {
    if (all.classList.contains("is-open")) shut(); else open();
  });

  // An anchor into the folded region unfolds it first, then the browser's own hash
  // scroll lands on a target that is actually on the page.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (!id) return;
    var t = document.getElementById(id);
    if (t && all.contains(t)) open();
  });

  // Landing straight on #work from somewhere else has to work too.
  if (window.location.hash.length > 1) {
    var t0 = document.getElementById(window.location.hash.slice(1));
    if (t0 && all.contains(t0)) {
      open();
      requestAnimationFrame(function () { t0.scrollIntoView(); });
    }
  }
})();

// ============================================================================
// EXIT NUDGE: one offer, once, to somebody who is leaving with nothing
//
// It fires only for a visitor who has opened NO project and is showing real leave
// intent: the mouse crossing out of the top of the window, or the foot of the page
// reached with nothing clicked. It is a bar, never a modal: it does not cover the page,
// it does not trap focus, it has a real close button with a real name, and Escape shuts
// it. Dismissed once, it is dismissed for good. Anyone who has already clicked into a
// project never sees it at all, because they do not need it.
// ============================================================================
(function () {
  "use strict";

  var OFF = "sa.nudge.off";        // dismissed: never again
  var OPENED = "sa.project.opened"; // they already went into a project: nothing to nudge

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  // Recorded first, and for everybody: it is what suppresses the nudge on this visit and
  // on the next one. Capture phase, so it is recorded even if something else handles the
  // click on the way down.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="projects/"]') : null;
    if (a) set(OPENED, "1");
  }, true);

  var el = document.getElementById("exit-nudge");
  var x = document.getElementById("exit-nudge-x");
  if (!el || !x) return;
  if (get(OFF) === "1" || get(OPENED) === "1") return;

  var LATEST = 5000;               // no ambush: nothing fires in the first few seconds
  var born = Date.now();
  var shown = false, done = false;

  function show() {
    if (shown || done) return;
    if (Date.now() - born < LATEST) return;
    if (get(OPENED) === "1") return;              // they clicked in while we were waiting
    shown = true;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add("is-in"); });
  }

  function dismiss() {
    if (done) return;
    done = true;
    set(OFF, "1");
    el.classList.remove("is-in");
    setTimeout(function () { el.hidden = true; }, 350);
  }

  x.addEventListener("click", dismiss);
  document.addEventListener("keydown", function (e) {
    if (shown && !done && (e.key === "Escape" || e.key === "Esc")) dismiss();
  });

  // Leave intent, a mouse: out through the top edge of the window and gone.
  document.addEventListener("mouseout", function (e) {
    if (e.relatedTarget || e.clientY > 2) return;
    show();
  });

  // Leave intent, anything: the foot of the page, with nothing opened on the way down.
  window.addEventListener("scroll", function () {
    var d = document.documentElement;
    if (window.pageYOffset + window.innerHeight >= d.scrollHeight - 140) show();
  }, { passive: true });
})();

// ============================================================================
// HERO BACKGROUND: Deploy line
//
// The site is neo-brutalist print: cream paper, 4px black rules, hard offset
// shadows with no blur, zero border radius, and hover states that snap in 0.1s
// rather than easing. A soft, glowing, floating background would read as a
// different website pasted behind the headline. So the background is built on the
// material already in the CSS (the 24px dot grid) and all motion is STEPPED, never
// interpolated. Rules grow one 24px cell at a time. Nothing fades.
//
// WHAT SHIPS: deploy. A 2px rule travels the grid, stops, and drops a square with a
// hard offset shadow: a commit landing, work shipping. Rules and squares are
// geometrically excluded from the copy box and the portrait, so a black rule can
// never cross the black headline or the face.
//
// WHAT DOES NOT: two other modes were built, then cut. Their code is still here and
// still correct, but nothing calls it while MODE is "deploy". They are kept so that
// switching back is a one-word edit rather than a rewrite:
//
//   grid   Live grid. The dot grid breathes on a quantized diagonal wave and single
//          dots snap into hard coral or yellow squares, like a check turning green.
//   print  Misregistration. Three dot grids (coral, yellow, purple) drift out of
//          register and snap back, multiply blended, like a risograph pull.
//
// To bring one back: set MODE below to "grid" or "print". To offer the visitor the
// choice again, restore the switcher markup (.hero__bgbar in index.html) and the
// .bgswitch rules in styles.css from git history, and call setMode from its clicks.
//
// Cost control: one 2D canvas, no libraries, DPR capped at 2, a single rAF that
// stops entirely when the hero scrolls away or the tab is hidden, and a repaint gate
// so a frame whose stepped state has not moved does no work at all. Init is deferred
// past load so it cannot touch LCP. Reduced motion and low-core devices get one
// static frame and no loop.
// ============================================================================
(function () {
  "use strict";

  // The one background that ships. "grid" and "print" still work; see the note above.
  var MODE = "deploy";

  var canvas = document.getElementById("hero-bg");
  var hero = document.querySelector(".hero");
  if (!canvas || !hero) return;

  var ctx = canvas.getContext && canvas.getContext("2d");
  // No canvas, or no Path2D (which the batched dot drawing below depends on): leave
  // the CSS dot grid exactly as it was.
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
  var CORAL = token("--coral", "#F03E3E");
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
  var mode = MODE;
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

  // Kept for the cut modes: this is the whole cost of switching one back on at
  // runtime. Nothing calls it now that MODE is fixed, and init() sets the mode
  // directly instead.
  function setMode(next) {
    mode = next;
    pops = [];
    events = [];
    lastDeploy = -1;   // re-arm, so switching into deploy shows a rule within FIRST_DEPLOY
    invalidate();      // different mode: whatever is on the canvas is now wrong
    if (still || !running) paintOnce();
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

    measure();

    if (still) { paintOnce(); return; }   // one held frame, no loop

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

/* ==========================================================================
   BOOK A CALL: size the Cal.com frame to the calendar inside it

   The frame was a fixed 700px box. A cross-origin iframe cannot be measured
   from out here, so that number was a guess, and it was wrong in both
   directions at once: a band of dead white above the calendar and a wider one
   below it, on all 39 pages the section appears on. Picking a slot then opens a
   booking form taller than 700px, which the fixed box cut off.

   Cal.com solves this without their embed script. A booker loaded with ?embed=
   posts its own rendered height to the parent window, once on load and again
   whenever the view inside it changes. Listening for that one message is the
   whole fix.

   Deliberately NOT their embed.js. That is a third-party script pulled in on
   every page load, where the frame here is one lazy iframe that loads only if a
   visitor scrolls to it. privacy.html promises exactly that, and names the
   outside hosts this site contacts. This keeps both true.
   ========================================================================== */
(function () {
  var frame = document.querySelector(".book__embed iframe");
  if (!frame) return;

  window.addEventListener("message", function (e) {
    // Only Cal.com's own frame may resize anything on this page.
    if (e.origin !== "https://cal.com" || e.source !== frame.contentWindow) return;
    var m = e.data;
    if (!m || m.originator !== "CAL" || m.type !== "__dimensionChanged") return;
    var h = m.data && m.data.iframeHeight;
    // A number well under the calendar's own minimum means the frame is
    // mid-teardown; collapsing the section to it would be a visible jump.
    if (typeof h !== "number" || !isFinite(h) || h < 200) return;
    frame.style.height = Math.round(h) + "px";
  });
})();
