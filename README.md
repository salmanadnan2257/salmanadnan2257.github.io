# Portfolio website

The personal site for Salman Adnan: a homepage plus 38 project detail pages, each with its own
self-contained 3D visualization. Static files, no build step. Deployed to https://salmanadnan.com.

```
index.html          the homepage
projects/*.html     38 project detail pages
viz/*.html          38 self-contained Three.js visualizations
assets/             screenshots, Open Graph cards, favicons
tests/              headless-Chrome checks (see below)
deploy.sh           rsync to the VPS, gated on [deploy] in the latest commit message
```

## Deploying

`deploy.sh` rsyncs this folder to the VPS. It only runs when the latest commit message contains
`[deploy]`, so a commit without that marker is safe to make at any time.

The absolute base URL is `https://salmanadnan.com`. It appears in `robots.txt`, `sitemap.xml`, and
the head of every HTML file. If the domain ever moves, change it in all three places together.

## Tests

The checks drive a real headless Chrome. They are not wired to CI; run them by hand.

```bash
cd tests
npm install                 # puppeteer-core, pngjs, pixelmatch
node test-viz.mjs           # all 38 viz: drag orbits, reset restores exactly, wheel zooms
```

| Harness | What it asserts |
|---|---|
| `test-viz.mjs` | All 38 visualizations: drag changes the render, reset restores the framing to exactly 0.000, wheel zooms. |
| `test-drift.mjs` | The camera-runaway class of bug. Four scenes ease the camera from its own current position, so they can read the viewer's orbit back as their own starting point and compound away. Runs a no-drag control per scene first, because sparse pulsing scenes vary on their own. |
| `test-embed.mjs` | An embedded visualization never hijacks host-page scrolling before the visitor engages with it. |
| `test-a11y.mjs` | Keyboard orbit and zoom, reset via `r`, visible focus ring, `prefers-reduced-motion`, aria labels. |
| `test-home.mjs` | 38 cards, each with a distinct curiosity hook and a metric badge; every card click navigates to its project page. |
| `test-hooks.mjs` | At 1280x800, 390x844 and 360x740: no card CTA or badge spills its card, and the page never scrolls horizontally. |
| `test-mobile.mjs` | Tap targets, no horizontal pan, and the scroll-trap check: a vertical swipe starting on a visualization must still scroll the page. |
| `test-stage.mjs` | The "Start here" stage: one live WebGL context at a time, no scroll trap, no layout shift, reduced-motion path. |
| `test-compact.mjs` | Compact mode (`?compact=1`) at card size: the title panel, legend and HUD are hidden, the scene still renders and still responds to a drag. |
| `check-runtime-identical.mjs` | The load-bearing invariant: the shared runtime block is byte-identical across all 38 viz files, apart from each file's own PNG download name. If this fails, the 38 have forked and any future patch will hit them unevenly. |

Chrome path is hardcoded to `/usr/bin/google-chrome`. On a machine without a GPU, Chrome falls back
to software rendering, so absolute frame rates from these runs are not representative of real
hardware; treat them as relative only.

## Not yet verified

The following shipped after the owner chose to cut the verification passes for speed. Each is
implemented, and where a claim is made below it was observed; everything else is untested and
should be checked before it is relied on.

**Observed working:** the rail loads and swaps systems; the fullscreen button is gone; hovering a
card mounts `viz/<name>.html?compact=1` with `pointer-events: none` in the identical box as the
screenshot (so there is no layout shift), and it tears down when the pointer leaves; compact mode
hides the panels and the HUD and the canvas still draws; zero JS errors and no horizontal scroll at
1280x800 and 390x844; the shared runtime block is still one hash across all 38 files.

**Implemented but NOT verified, in priority order:**

1. **The touch path on the cards.** A quick tap should navigate to the project; a long press or a
   swipe should keep the preview playing and NOT navigate; a vertical swipe starting on a card must
   still scroll the page. The scroll-trap case is the one that matters: if it regressed, a phone
   visitor gets stuck. `test-mobile.mjs` covers the equivalent case for the embedded viz.
2. **The full regression suite, after the compact-mode patch.** `test-viz`, `test-drift`,
   `test-embed`, `test-a11y`, `test-mobile` were last green BEFORE compact mode landed. The patch
   changed four existing statements, each an identity when compact mode is off, but that argument is
   a diff argument, not a test result.
3. **Homepage performance with live card previews.** Peak simultaneous WebGL contexts, frame rate
   while scrolling, and JS heap growth across two full scrolls (to catch a teardown leak). The cap
   is 2 contexts on desktop and 1 on touch, enforced with explicit LRU eviction and `about:blank`
   before removal, but it was not measured after the final wiring.
4. **`test-home`, `test-hooks`, `test-mobile`, `test-stage` after the last two changes** (the stage
   re-curation and the cursor motif / conversion levers). `test-stage.mjs` was updated to expect the
   fullscreen button to be absent, but was not executed.
5. **Legibility of every scene at card size.** 20 of the 38 were checked and read clearly. Two are
   marginal: `space-race-analysis` (fine dust) and `vector-db` (blue on navy, low contrast).
   `disappearing-text-app` is excluded from live preview by design and keeps its screenshot.

### The 2026-07-14 conversion batch: what was observed, and what is left

Four levers shipped together: the headline cursor motif, the stage conversion panel, the folded
project wall behind one flagship, and the exit nudge. One smoke run at 1280x800 and 390x844 was
executed (headless Chromium, the page served over `http://`), and nothing beyond it.

**Observed in that run, on both viewports:** zero JS errors and zero horizontal scroll, at load,
after the wall is opened, and after the nudge appears; all 38 cards present in the DOM while the
wall is folded (`display: none`, not injected) and all 38 laid out and visible once it is opened;
the toggle carries `aria-expanded=false` then `true` and swaps its label; the cursor glyphs render
at 1280 (`display: block`) and are gone at 390 (`display: none`), with `pointer-events: none` on
both; a real 2.1-second mouse drag inside the stage iframe reveals the conversion panel, and the
panel's copy names the loaded system correctly ("You are holding Trade Intelligence Copilot. 15 /
15 SQL answers correct."); the exit nudge stays hidden until leave intent, then appears with
`role="region"`.

**Left to check, in priority order:**

6. **The exit nudge's suppression rules, end to end, in a real browser.** Dismiss it, reload, and
   confirm it never returns (`localStorage` key `sa.nudge.off`). Then clear storage, click into any
   project, come back, and confirm it never appears at all (`sa.project.opened`). Both keys were
   read and written in the smoke run only implicitly; neither round trip was exercised across a
   real navigation.
7. **The exit nudge's real leave-intent trigger.** The smoke run dispatched a synthetic `mouseout`.
   A genuine mouse leaving the top of the window, and the bottom-of-page trigger after a real
   scroll, were not driven. Also unchecked: that the bar never covers the cal.com booking embed it
   sits over at the foot of the page, and that it is announced sanely by a screen reader.
8. **The stage conversion panel's fallback engagement path.** The primary path reaches into the
   same-origin iframe and attaches capture-phase pointer listeners, and that is the path that was
   observed working. The `file://` fallback (window blur while the pointer is over the stage, then
   still over it `DWELL_MS` later) has never been run. Anyone opening `index.html` straight off the
   disk is on that path, and on a phone it will not fire at all, because a touch that starts inside
   a cross-origin frame never reaches the host. Served over `http(s)`, which is how the site
   actually ships, the fallback is dead code.
9. **The conversion panel's reduced-motion and no-WebGL paths.** Both are wired to reveal the panel
   at once (there is no drag to earn it with), and neither was exercised. Check with
   `prefers-reduced-motion: reduce` forced on, and with WebGL disabled, that the poster shows, the
   grab hint changes its wording, and the panel is visible and not animated.
10. **The folded wall under a real crawler.** The 37 other cards sit inside a `display: none`
    container. They are in the HTML source, which is what a crawler parses, and the container is
    folded only for scripted visitors (the `js` class is set by the one inline script in the head;
    with JS off the wall ships open and the toggle is not rendered at all). Confirm with Google's
    URL Inspection tool after deploy that all 38 project links are still discovered, and re-run
    `test-a11y` for the disclosure: keyboard open and close, focus order into the revealed grid,
    and that nothing inside the folded region is a tab stop while it is folded.
11. **Deep links into the folded region.** `#work`, `#more`, `#apps`, `#production` from the nav and
    the hero buttons unfold the wall on click, and a page loaded with one of those hashes already in
    the URL unfolds and scrolls. The in-page click path was exercised; the cold load with a hash was
    not, and neither was a back-button return to a hash.
12. **The flagship card is a second link to `sqlmill`.** The page now links that project twice, from
    the flagship and from its card inside the wall. That is harmless for SEO and correct for the
    visitor, but if click analytics are ever added, the two must be told apart.
13. **The cursor motif across browsers and at zoom.** It renders in Chromium at 1280. Not checked in
    Firefox or Safari, at 200% browser zoom, or at exactly 1240px, which is the breakpoint where it
    appears. The failure mode to look for is a glyph crossing the headline text or pushing a
    horizontal scrollbar; it is absolutely positioned inside the `h1` and hidden below 1240px
    precisely to make that impossible, but it was not measured at the boundary.

## Open questions for the owner

- **"5+ years shipping production software"** on the achievements tile is not corroborated by
  anything on the site. The visible record is a 2023 client engagement, an internship, coursework,
  and the agency. It is a career fact only the owner can confirm.
- **"Seven live clients"** is the owner's own count. The repositories cannot back it: the pipeline
  config holds seven site profiles, which is five external client sites, the agency's own product
  site, and a local test fixture, and the SaaS keeps its client roster in the production database
  rather than in code. The owner has confirmed the number; it just is not checkable from the code,
  so be ready to answer that.
