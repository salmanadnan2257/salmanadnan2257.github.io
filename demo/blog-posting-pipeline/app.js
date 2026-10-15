// Step-through logic for the fabricated demo runs. No network calls anywhere here.
// Real davonex.com post data (REAL_DAVONEX_POSTS) is a static snapshot copied at
// build time, not fetched live; "Read the guide" links are normal outbound links
// the user clicks, not requests this demo makes on its own.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let currentRunId = PRESETS[0].id;
let libraryDemo = null; // { runId, addedAt, expiresAt, tickHandle, timeoutHandle }

function currentRun() {
  return DEMO_RUNS[currentRunId];
}

// ============================ Step renderers ============================

function renderJsonPanel(obj) {
  return `<pre class="json-panel">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;
}

function renderArticle(article) {
  let html = '<div class="article">';
  article.intro.forEach(p => { html += `<p>${escapeHtml(p)}</p>`; });

  article.sections.forEach(section => {
    html += `<h3>${escapeHtml(section.header)}</h3>${section.body}`;
  });

  html += '<div class="faq">';
  article.faq.forEach(item => {
    html += `<dt>${escapeHtml(item.q)}</dt><dd>${escapeHtml(item.a)}</dd>`;
  });
  html += '</div>';

  html += '<div class="refs"><strong>References</strong><ol>';
  article.sources.forEach(s => {
    html += `<li>[${s.ref}] ${escapeHtml(s.title)}, ${escapeHtml(s.date)}. <a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></li>`;
  });
  html += '</ol></div></div>';
  return html;
}

function renderImageStep(run, step) {
  return `
    <div class="hero-photo">
      <img src="${run.hero_image}" alt="${escapeHtml(run.topic_title)}" loading="lazy">
      <span class="hero-photo__caption">Real stock photo, not AI-generated: stands in for what the real system's Gemini image generation would produce. Credits in assets/images/CREDITS.md.</span>
    </div>
    <p class="image-prompt">"${escapeHtml(run.steps.find(s => s.id === 'image_prompt').output)}"</p>
    ${renderJsonPanel(step.usage)}
  `;
}

function renderPostPreview(run, step) {
  const writer = run.steps.find(s => s.id === "writer").article;
  const displayUrl = step.published_url.replace(/^https?:\/\//, "");
  const wordCount = writer.intro.join(" ").split(/\s+/).length +
    writer.sections.reduce((n, s) => n + s.body.replace(/<[^>]+>/g, " ").split(/\s+/).length, 0);
  const minutes = Math.max(3, Math.round(wordCount / 200));

  const brandMark = `<span class="demo-nav__mark" aria-hidden="true">NC</span>`;

  const nav = `
    <div class="pv-nav">
      <div class="demo-nav__brand">${brandMark}<span class="demo-nav__name">Nordkast Coffee Supply</span></div>
      <div class="pv-nav__links">
        <a href="#" aria-current="page">Blog</a>
        <a href="#">Shop</a>
        <button type="button" class="btn btn--primary">Shop Coffee <span class="arr">&#8594;</span></button>
      </div>
    </div>
  `;

  const breadcrumb = `
    <nav class="pv-breadcrumb" aria-label="Breadcrumb">
      <a href="#">Home</a><span class="sep">/</span>
      <a href="#">Blog</a><span class="sep">/</span>
      <span aria-current="page">${escapeHtml(run.topic_title)}</span>
    </nav>
  `;

  const head = `
    <span class="pv-post-tag">Guide</span>
    <h1>${escapeHtml(run.topic_title)}</h1>
    <div class="pv-meta-row">
      <span>By Nordkast Coffee Supply</span><span class="dot"></span>
      <span>Published just now</span><span class="dot"></span>
      <span>${minutes} min read</span>
    </div>
  `;

  const figure = `
    <figure class="pv-figure">
      <img src="${run.hero_image}" alt="${escapeHtml(run.topic_title)}" loading="lazy">
      <figcaption class="pv-figure__caption">Real stock photo, not AI-generated: stands in for the real system's Gemini image generation. Credits in assets/images/CREDITS.md.</figcaption>
    </figure>
  `;

  let prose = `<div class="pv-prose">`;
  writer.intro.forEach(p => { prose += `<p>${escapeHtml(p)}</p>`; });
  writer.sections.forEach(s => { prose += `<h2>${escapeHtml(s.header)}</h2>${s.body}`; });
  prose += `<h2>Frequently Asked Questions</h2>`;
  writer.faq.forEach(item => {
    prose += `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`;
  });
  prose += `</div>`;

  const refs = `
    <div class="pv-refs">
      <h2>References</h2>
      <ol>
        ${writer.sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>. <span class="ref-date">(${escapeHtml(s.date)})</span></li>`).join("")}
      </ol>
    </div>
  `;

  const author = `
    <div class="pv-author">
      <span class="av" aria-hidden="true">N</span>
      <div>
        <div class="a-name">Written by Nordkast Coffee Supply</div>
        <div class="a-desc">We help home baristas and coffee shoppers get more out of every bag and every shot.</div>
      </div>
    </div>
  `;

  const finalCta = `
    <div class="pv-final-wrap">
      <div class="pv-final">
        <h2>Ready for your next bag?</h2>
        <p>Shop Nordkast's current roasts and machine care essentials.</p>
        <button type="button" class="btn">Shop Coffee <span class="arr">&#8594;</span></button>
      </div>
    </div>
  `;

  const footer = `
    <div class="pv-foot">
      <div class="demo-nav__brand">${brandMark}<span>Nordkast Coffee Supply</span></div>
      <span>&copy; 2026 Nordkast Coffee Supply (fictional)</span>
    </div>
  `;

  return `
    <div class="post-preview">
      <div class="post-preview__browser-bar">
        <span class="post-preview__dot"></span>
        <span class="post-preview__dot"></span>
        <span class="post-preview__dot"></span>
        <span class="post-preview__url">${escapeHtml(displayUrl)}</span>
      </div>
      ${nav}
      <div class="pv-article">
        ${breadcrumb}
        ${head}
        ${figure}
        ${prose}
        ${refs}
        ${author}
      </div>
      ${finalCta}
      ${footer}
    </div>
    <p class="cost-note">
      This preview is a faithful, bounded recreation of the real site's article template (same nav, breadcrumb,
      typography, citations, references, author line, and final CTA band, built from its own live CSS), populated
      with the fabricated run above. No request is made to any real site, and the real site's server code is not
      part of this demo; the brand shown here ("Nordkast Coffee Supply") is invented.
    </p>
  `;
}

function renderPublishStep(run, step) {
  let html = renderPostPreview(run, step);
  html += `
    <div class="publish-card">
      <div><strong>Published to:</strong> <span class="publish-card__url">${escapeHtml(step.published_url)}</span></div>
      <div><strong>IndexNow:</strong> ${escapeHtml(step.indexnow_status)}</div>
      <div><strong>Sheets report row:</strong> ${escapeHtml(step.sheets_row_status)}</div>
    </div>
    <table class="cost-table">
      <thead><tr><th>Step</th><th>Model</th><th>Cost (illustrative)</th></tr></thead>
      <tbody>
  `;
  step.cost.rows.forEach(r => {
    html += `<tr><td>${escapeHtml(r.step)}</td><td>${escapeHtml(r.model)}</td><td>$${r.cost_usd.toFixed(3)}</td></tr>`;
  });
  html += `</tbody></table>
    <div class="cost-total">$${step.cost.total_range[0].toFixed(2)}–$${step.cost.total_range[1].toFixed(2)} per post</div>
    <p class="cost-note">The total range is the real, published per-post cost for the production system (see its README). The per-step line items above are illustrative for this demo and are not the exact real breakdown.</p>
  `;
  return html;
}

function renderStep(run, step) {
  let body = "";
  if (step.type === "json") {
    if (step.input) body += `<p><strong>Input</strong></p>${renderJsonPanel(step.input)}<p><strong>Output</strong></p>`;
    body += renderJsonPanel(step.output);
  } else if (step.type === "article") {
    body = renderArticle(step.article);
  } else if (step.type === "text") {
    body = `<p class="image-prompt">${escapeHtml(step.output)}</p>`;
  } else if (step.type === "image") {
    body = renderImageStep(run, step);
  } else if (step.type === "publish") {
    body = renderPublishStep(run, step);
  }

  return `
    <div class="step" id="step-${step.id}">
      <div class="step__head">
        <div>
          <div class="step__num">${step.num}</div>
          <h2 class="step__title">${escapeHtml(step.title)}</h2>
        </div>
        <span class="step__model">${escapeHtml(step.model)}</span>
      </div>
      ${body}
    </div>
  `;
}

// ============================ Preset autofill ============================

function renderPresetChips() {
  const row = document.getElementById("preset-row");
  row.innerHTML = PRESETS.map(p => `
    <button type="button" class="preset-chip${p.id === currentRunId ? " is-active" : ""}" data-preset="${p.id}">
      ${escapeHtml(p.chip)}
    </button>
  `).join("");
}

function renderBriefPreview() {
  const run = currentRun();
  const brief = run.steps.find(s => s.id === "brief");
  const preset = PRESETS.find(p => p.id === currentRunId);
  const modeled = preset.modeledAfter
    ? `<p class="modeled-after">Input pattern modeled after a real davonex.com post: <a href="https://davonex.com/blog/${preset.modeledAfter.slug}/" target="_blank" rel="noopener">${escapeHtml(preset.modeledAfter.title)}</a></p>`
    : "";
  document.getElementById("brief-preview").innerHTML = `
    <div class="entity-grid">
      <div class="entity"><div class="k">Topic</div><div class="v">${escapeHtml(brief.output.topic)}</div></div>
      <div class="entity" style="grid-column:1/-1"><div class="k">Description</div><div class="v" style="font-weight:400">${escapeHtml(brief.output.description)}</div></div>
      <div class="entity" style="grid-column:1/-1"><div class="k">Additional details</div><div class="v" style="font-weight:400">${escapeHtml(brief.output.additional_details)}</div></div>
    </div>
    ${modeled}
  `;
}

function selectPreset(id) {
  currentRunId = id;
  renderPresetChips();
  renderBriefPreview();
  buildStepsUI();
  resetDemo();
}

// ============================ Pipeline run ============================

function buildStepsUI() {
  const run = currentRun();
  const stepsContainer = document.getElementById("steps");
  stepsContainer.innerHTML = run.steps.map(s => renderStep(run, s)).join("");

  const rail = document.getElementById("rail");
  rail.innerHTML = run.steps.map((s, i) =>
    `<div class="rail__dot" data-idx="${i}">${escapeHtml(s.title)}</div>`
  ).join("");
}

function runPipeline() {
  const runBtn = document.getElementById("run-btn");
  const resetBtn = document.getElementById("reset-btn");
  runBtn.disabled = true;
  document.querySelectorAll(".preset-chip").forEach(c => c.disabled = true);

  const dots = document.querySelectorAll(".rail__dot");
  const steps = document.querySelectorAll(".step");

  let i = 0;
  function next() {
    if (i > 0) {
      dots[i - 1].classList.remove("is-active");
      dots[i - 1].classList.add("is-done");
    }
    if (i >= steps.length) {
      resetBtn.style.display = "inline-block";
      document.querySelectorAll(".preset-chip").forEach(c => c.disabled = false);
      addToLibrary(currentRunId);
      return;
    }
    dots[i].classList.add("is-active");
    steps[i].classList.add("is-visible");
    steps[i].scrollIntoView({ behavior: "smooth", block: "start" });
    i += 1;
    setTimeout(next, 900);
  }
  next();
}

function resetDemo() {
  document.querySelectorAll(".rail__dot").forEach(d => d.classList.remove("is-active", "is-done"));
  document.querySelectorAll(".step").forEach(s => s.classList.remove("is-visible"));
  document.getElementById("run-btn").disabled = false;
  document.getElementById("reset-btn").style.display = "none";
  document.querySelectorAll(".preset-chip").forEach(c => c.disabled = false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================ Blog Library ============================

const LIBRARY_LIFETIME_MS = 15 * 60 * 1000;

function addToLibrary(runId) {
  if (libraryDemo) {
    clearInterval(libraryDemo.tickHandle);
    clearTimeout(libraryDemo.timeoutHandle);
  }
  const addedAt = Date.now();
  const expiresAt = addedAt + LIBRARY_LIFETIME_MS;

  libraryDemo = {
    runId, addedAt, expiresAt,
    tickHandle: setInterval(renderLibrary, 1000),
    timeoutHandle: setTimeout(() => {
      libraryDemo = null;
      renderLibrary();
    }, LIBRARY_LIFETIME_MS)
  };
  renderLibrary();
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function realPostCard(post) {
  return `
    <article class="post-card" data-open-post="${post.slug}">
      <div class="post-card__img"><img src="${post.image}" alt="${escapeHtml(post.title)}" loading="lazy"></div>
      <h3>${escapeHtml(post.title)}</h3>
      <p class="excerpt">${escapeHtml(post.excerpt)}</p>
      <div class="post-meta"><span>${escapeHtml(post.date)}</span><span class="dot"></span><span>${escapeHtml(post.read_time)}</span></div>
      <span class="read-link">Read the post <span class="arr">&#8594;</span></span>
    </article>
  `;
}

function openRealPostReader(slug) {
  const post = REAL_DAVONEX_POSTS.find(p => p.slug === slug);
  if (!post) return;
  const refsHtml = post.references.length ? `
    <div class="reader__refs">
      <h2>References</h2>
      <ol>${post.references.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>. <span>(${escapeHtml(r.date)})</span></li>`).join("")}</ol>
    </div>
  ` : "";
  document.getElementById("reader-article").innerHTML = `
    <div class="reader__hero"><img src="${post.image}" alt="${escapeHtml(post.title)}"></div>
    <div class="reader__body">
      <h1>${escapeHtml(post.title)}</h1>
      <div class="reader__meta">
        <span>${escapeHtml(post.by)}</span><span class="dot"></span>
        <span>${escapeHtml(post.date)}</span><span class="dot"></span>
        <span>${escapeHtml(post.read_time)}</span>
      </div>
      <div class="reader__prose">${post.body_html}</div>
      ${refsHtml}
      <div class="reader__provenance">
        This is the real, published content from davonex.com, one of this pipeline's actual
        configured clients, fetched and stored locally so this demo works fully offline.
        Original: <a href="https://davonex.com/blog/${post.slug}/" target="_blank" rel="noopener">davonex.com/blog/${post.slug}/</a>
      </div>
    </div>
  `;
  switchTab("reader");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function demoPostCard() {
  const run = DEMO_RUNS[libraryDemo.runId];
  const remaining = libraryDemo.expiresAt - Date.now();
  return `
    <article class="post-card post-card--demo" id="demo-post-card">
      <div class="post-card__img is-demo" aria-hidden="true">
        <img src="${run.hero_image}" alt="${escapeHtml(run.topic_title)}" loading="lazy">
      </div>
      <span class="demo-ribbon">Demo · fabricated · removes in ${formatCountdown(remaining)}</span>
      <h3><a href="#panel-pipeline" data-open-pipeline="1">${escapeHtml(run.topic_title)}</a></h3>
      <p class="excerpt">${escapeHtml(run.steps.find(s => s.id === "writer").article.intro[0])}</p>
      <div class="post-meta"><span>Nordkast Coffee Supply (fictional)</span><span class="dot"></span><span>just now</span></div>
      <a class="read-link" href="#panel-pipeline" data-open-pipeline="1">View the run <span class="arr">&#8594;</span></a>
    </article>
  `;
}

function renderLibrary() {
  const grid = document.getElementById("library-grid");
  const countEl = document.getElementById("library-tab-count");
  let html = "";
  let total = REAL_DAVONEX_POSTS.length;
  if (libraryDemo) {
    html += demoPostCard();
    total += 1;
  }
  html += REAL_DAVONEX_POSTS.map(realPostCard).join("");
  grid.innerHTML = html;
  countEl.textContent = `(${total})`;
}

// ============================ Tabs ============================

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === tabId));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("is-active", p.id === `panel-${tabId}`));
  if (tabId === "pipeline") window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================ Init ============================

document.addEventListener("DOMContentLoaded", () => {
  renderPresetChips();
  renderBriefPreview();
  buildStepsUI();
  renderLibrary();

  document.getElementById("run-btn").addEventListener("click", runPipeline);
  document.getElementById("reset-btn").addEventListener("click", resetDemo);

  document.getElementById("preset-row").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn || btn.disabled) return;
    selectPreset(btn.dataset.preset);
  });

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  document.getElementById("library-grid").addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-pipeline]");
    if (opener) { e.preventDefault(); switchTab("pipeline"); return; }
    const card = e.target.closest("[data-open-post]");
    if (card) { openRealPostReader(card.dataset.openPost); }
  });

  document.getElementById("reader-back").addEventListener("click", () => switchTab("library"));
});
