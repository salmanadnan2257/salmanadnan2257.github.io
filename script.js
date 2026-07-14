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
