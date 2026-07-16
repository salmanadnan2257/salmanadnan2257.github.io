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

**The rsync deliberately does not use `--delete`, and must not.** The four client demos that the
"Try the live demo" buttons point at (`/demo/agency-blog-saas/`, `/demo/blog-posting-pipeline/`,
`/demo/reelflow-studio/`, `/demo/zarailink/`) live only on the VPS; they are built from the
`*-demo` folders in the Portfolio and are not in this repo. `--delete` would wipe them and break
those four buttons.

The cost of that is stale files accumulating on the server, so check for them after a rename or a
move. Two were found and removed on 2026-07-14, both dating from 2026-07-08 and both still carrying
the old `salmanadnan2257.github.io` canonical: a full stale copy of the old homepage at
`/projects/index.html` (a crawlable duplicate homepage pointing search engines at the dead domain)
and an orphaned `/cpp-ray-tracer.html` at the site root. Backups are in `/root/backups/` on the VPS.
To audit:

```bash
ssh da 'grep -rl "salmanadnan2257.github.io" /root/salmanadnan.com --include=*.html --include=*.xml --include=*.txt'
ssh da 'ls /root/salmanadnan.com/projects/*.html | wc -l'   # must be 38
```

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
| `test-home.mjs` | Opens the folded project wall via the real toggle, then checks 41 card anchors (38 distinct projects plus the three "Start with three" flagship cards, each a deliberate second link to its own wall card), each with a distinct curiosity hook and a metric badge; a card click navigates to its project page. |
| `test-hooks.mjs` | Opens the folded wall, then at 1280x800, 390x844 and 360x740: no card CTA or badge spills its card, and the page never scrolls horizontally (39 cards). |
| `test-mobile.mjs` | Opens the folded wall for the homepage layout checks (tap targets, no horizontal pan). Then, on a project page, the scroll-trap check: a vertical swipe starting on a visualization must still scroll the page, before and after the viz is engaged. |
| `probe-autoplay.mjs` | Card previews play with nothing touching them: the header stage mounts on load, all three "Start with three" cards are live once the section is on screen, the three sit in two rows (01 full width, 02 and 03 half), and the desktop cap of 4 holds across a full scroll of the open wall. |
| `probe-phone-thrash.mjs` | The same at 390x844 and 1280x800, counting mounts and unmounts: the cap holds (2 phone, 4 desktop) and a slow scroll does not tear contexts up and down. |
| `probe-cap-cost.mjs` | Idle frame rate against the number of live card previews, one arm per cap. Software-rasterizer numbers in this sandbox: use it to compare caps, never as a real visitor's frame rate. See "Still not verified". |
| `test-stage.mjs` | The "Start here" stage: one live WebGL context at a time (counted as DOM-connected, non-context-lost canvases, so the homepage's `webglOK()` capability probe is not miscounted), no scroll trap, no layout shift, reduced-motion path. |
| `test-cta-tap.mjs` | Opens the folded wall, then at 390x844 and 360x740 hit-tests each card CTA's centre (the corners are reported but not failed, since the cards' intentional ±1deg rotation moves the axis-aligned bounding box off the visual button). |
| `test-domain.mjs` | Index and three project pages render with zero JS errors and zero failed local requests; canonical/og/twitter tags all carry the real domain, and no old host remains. |
| `test-cpu-leak.mjs` | Six viz pages stop requesting animation frames when hidden, when paused-and-settled, and under `prefers-reduced-motion`, so no page burns a core in the background. |
| `test-compact.mjs` | Compact mode (`?compact=1`) at card size: the title panel, legend and HUD are hidden, the scene still renders and still responds to a drag. Creates its own output dir. One expected non-pass: `disappearing-text-app`, which is excluded from live preview by design and keeps its screenshot. |
| `check-runtime-identical.mjs` | The load-bearing invariant: the shared runtime block is byte-identical across all 38 viz files, apart from each file's own PNG download name. If this fails, the 38 have forked and any future patch will hit them unevenly. |

Probe scripts (added 2026-07-15 to verify the folded-wall and 2026-07-14 conversion batch; not in the table above because they target specific claims rather than a broad surface):
`probe-wall.mjs` (folded → open, 41 anchors / 38 distinct, all CTAs render, whole-card tap resolves),
`probe-conversion.mjs` (exit-nudge suppression + triggers, reduced-motion conversion panel, deep-link cold load),
`probe-stage-ctx.mjs` (locates every WebGL context per frame, live vs released),
`probe-cursor.mjs` (cursor motif at the 1240px breakpoint and 200% zoom),
`probe-nojs.mjs` (with JavaScript off the wall ships open, all 38 links crawlable, toggle not rendered).

Chrome path is hardcoded to `/usr/bin/google-chrome`. On a machine without a GPU, Chrome falls back
to software rendering, so absolute frame rates from these runs are not representative of real
hardware; treat them as relative only.

## Verification status

Updated 2026-07-15: the items below were run in a real headless Chrome and now pass unless marked
otherwise. The homepage layout harnesses (`test-home`, `test-hooks`, `test-cta-tap`, `test-mobile`)
were stale after the 2026-07-14 folded wall shipped: they measured the 38 non-flagship cards while
those cards sat inside the folded wall (`display: none`), so the CTAs read as 0x0 and the tests
failed. They now open the wall via the real toggle before measuring. No site defect was involved;
the failures were the tests, not the page. `test-stage` "2 live contexts" was a counter bug, also
now fixed (see below). Every fix is in the harness, not the site.

**Verified (harness or probe, both viewports unless noted):**

1. **The touch scroll-trap (the case that matters most).** `test-mobile` B1b/B1c: a vertical swipe
   starting on the raft-kv viz scrolls the host page (~245px, matching the plain-body control) and
   still scrolls after the viz is engaged, at 390x844 and 360x740; a horizontal drag engages it
   (B2). Card previews carry `pointer-events: none`, so a touch on a card passes through to the
   wrapping link: `probe-wall` confirms all 39 card centres hit-test to their own project link.
2. **The full committed suite.** `test-viz` 38/38, `test-drift` 4/4, `test-embed` 4/4, `test-a11y`
   8/8, `test-domain` 4/4, `test-cpu-leak` (no rAF leak hidden / paused / reduced-motion),
   `check-runtime-identical` (one hash across all 38), `test-compact` 37/38, and `test-home`,
   `test-hooks`, `test-cta-tap`, `test-stage`, `test-mobile` all green after the folded-wall
   un-staling.
3. **The stage holds one live WebGL context.** `test-stage` S1/S1b now count DOM-connected,
   non-context-lost canvases and read 1 at rest and after six rapid rail switches. The earlier "2"
   was a counter that tallied `getContext` creations and never released them, double-counting the
   homepage's `webglOK()` capability probe: a throwaway canvas that support-tests WebGL and is never
   added to the DOM. One live context, the documented invariant, holds. `probe-stage-ctx` locates
   each context per frame.
4. **The folded wall.** `probe-wall`: folded at load (the three flagship cards visible, wall
   `display: none`, `aria-expanded=false`), opens via the toggle to 41 anchors / 38 distinct hrefs /
   three flagship cards each a deliberate second link to its wall card, all 41 CTAs render >=40px,
   whole-card tap resolves to each card's
   own link, no horizontal scroll, zero JS errors. `probe-nojs`: with JavaScript off the wall ships
   open, all 38 links are in the crawlable source, and the toggle is not rendered.
5. **The exit nudge (items 6 and 7, event path).** `probe-conversion`: dismiss -> reload -> stays
   suppressed (`sa.nudge.off`); open a real project -> back -> never appears (`sa.project.opened`);
   top-edge `mouseout` and foot-of-page scroll both trigger it.
6. **The conversion panel's reduced-motion path (item 9).** `probe-conversion` and `test-stage`
   R1/R2/R3: under `prefers-reduced-motion` the panel reveals with no drag, the grab hint is
   reworded ("Reduced motion: showing the still instead of the live 3D"), and no iframe / WebGL
   context mounts.
7. **Deep links into the folded region (item 11).** `probe-conversion`: a cold load of
   `index.html#work`, `#more`, `#apps`, `#production` unfolds the wall and scrolls to the target.
8. **The flagship duplicate links (item 12).** 41 anchors, 38 distinct hrefs; the three duplicates
   are the "Start with three" flagship cards (agency-blog-saas, inference-engine, raft-kv), each a
   second link to its own wall card; `test-home` tolerates same-href duplicates.
9. **The cursor motif at the breakpoint (item 13, Chromium).** `probe-cursor`: hidden below 1240px,
   appears at 1240 / 1241 / 1440 including 200% zoom, with no horizontal scroll and no glyph past
   the viewport edge.

**Still not verified (need the owner, or an environment this sandbox does not have):**

- **The frame-rate cost of cards that play unasked (2026-07-16), and it is the biggest
  open risk on the page.** Cards now mount their 3D preview when they scroll into view
  instead of when they are hovered, so a visitor who touches nothing still has up to 4
  scenes running (2 on a phone). The cost per playing scene was measured on the homepage
  with the wall open, sitting still: 0 scenes 60.6 fps, 1 scene 31.9, 2 scenes 17.8, 3
  scenes 12.8. **Those are software-rasterizer numbers and must not be quoted as any
  visitor's frame rate.** This sandbox has no hardware GL in headless Chrome, so WebGL
  only comes up under SwiftShader, which renders on the CPU: it exaggerates the cost by
  an unknown factor, and there is no way to measure the real one from here. What the
  numbers do establish is that the cost is per playing scene and close to linear, which
  makes `DESKTOP_CAP` / `TOUCH_CAP` in `script.js` the whole performance policy.
  **The owner should scroll the homepage on a real phone and a real laptop before
  trusting this**; if it stutters, lower the two caps, which is a one-line change and
  needs nothing else touched. Re-run the cap comparison with `node tests/probe-cap-cost.mjs`
  (it prints the table above; on real hardware the numbers should be far better).
  What IS verified here: the caps hold (peak 4 desktop, 2 phone across a full scroll of
  the open wall), nothing thrashes (11 mounts desktop / 4 phone over a 26-step scroll),
  contexts are handed back on scroll-away, and there are no JS errors.
- **Legibility of every scene at card size (item 5).** A visual judgment, not automatable. 20 of 38
  were checked and read clearly; two are marginal, `space-race-analysis` (fine dust) and `vector-db`
  (blue on navy, low contrast). `disappearing-text-app` is excluded from live preview by design and
  keeps its screenshot; it is also `test-compact`'s one expected non-pass.
- **The exit nudge's genuine hardware leave-intent, its overlap with the cal.com embed, and its
  screen-reader read-out (item 7).** The event path is verified; a real cursor leaving the OS
  window, the visual overlap at the foot of the page, and the SR announcement are not.
- **The stage conversion panel's `file://` fallback (item 8).** Dead code when the site is served
  over `http(s)`, which is how it ships; unrunnable and moot in production. Left as-is.
- **The folded wall under a real crawler (item 10).** Structurally verified (38 links in source,
  wall folds only under `.js`, ships open with JS off, toggle not rendered without JS). Google's URL
  Inspection tool is a post-deploy step for the owner. The disclosure's keyboard focus order into
  the revealed grid was not re-run under `test-a11y`.
- **The cursor motif in Firefox / Safari (item 13).** Only Chromium is available in this sandbox.

## Open questions for the owner

- **"5+ years shipping production software"** on the achievements tile is not corroborated by
  anything on the site. The visible record is a 2023 client engagement, an internship, coursework,
  and the agency. It is a career fact only the owner can confirm.
- **"Seven live clients"** is the owner's own count. The repositories cannot back it: the pipeline
  config holds seven site profiles, which is five external client sites, the agency's own product
  site, and a local test fixture, and the SaaS keeps its client roster in the production database
  rather than in code. The owner has confirmed the number; it just is not checkable from the code,
  so be ready to answer that.
