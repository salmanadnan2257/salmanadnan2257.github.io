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
  // The box is locked to the widest word's width first, so swapping words
  // never reflows the surrounding headline.
  var rotatorWord = document.querySelector(".word-rotator__word");
  var rotatorBox = document.querySelector(".word-rotator");
  if (rotatorWord && rotatorBox) {
    var words = (rotatorWord.getAttribute("data-words") || "").split(",").filter(Boolean);

    if (words.length > 1) {
      // Locks the box to the widest word's rendered width so swapping words
      // never reflows the headline. Re-measured on resize since the hero
      // font size scales with viewport width (clamp with vw).
      var measurer = rotatorWord.cloneNode(false);
      measurer.style.cssText = "position:absolute; visibility:hidden; white-space:nowrap; left:-9999px; top:-9999px;";
      document.body.appendChild(measurer);

      var lockWidth = function () {
        var maxWidth = 0;
        for (var w = 0; w < words.length; w++) {
          measurer.textContent = words[w];
          maxWidth = Math.max(maxWidth, measurer.getBoundingClientRect().width);
        }
        rotatorBox.style.minWidth = Math.ceil(maxWidth) + "px";
      };
      lockWidth();

      var resizeTimer;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(lockWidth, 150);
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
