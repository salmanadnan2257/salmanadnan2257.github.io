// Scripted multi-view walkthrough of the real app's actual screens. No network
// calls anywhere in this file.

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const watchedIds = new Set();
let currentScope = "import";
let currentRole = "Supplier"; // Trade Directory: Supplier | Buyer
let currentProfileId = null;
let ddUnlocked = false;
let ddActivePill = null;
let pendingUnlock = null; // { companyId, contactId }

// ============================ Navbar / view routing ============================

function switchView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("is-active", v.id === `view-${viewId}`));
  document.querySelectorAll(".zl-navbar__links > a").forEach(a => a.classList.toggle("is-active", a.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTokenBalance() {
  document.querySelectorAll("#token-balance").forEach(el => { el.textContent = tokenBalance; });
}

// ============================ Dashboard ============================

function detectMode(query, scopeSelected) {
  if (/^\d/.test(query.trim())) return "hscode";
  if (scopeSelected && query.trim()) return "ai";
  return "product";
}

function renderModePill(query) {
  const wrap = document.getElementById("mode-pill-wrap");
  if (!query.trim()) { wrap.innerHTML = ""; return; }
  const mode = detectMode(query, true);
  const label = mode === "hscode" ? "HS Code Mode" : mode === "ai" ? "AI Query Mode" : "Product Search";
  wrap.innerHTML = `<span class="mode-pill is-${mode}">${label}</span>`;
}

function runSearch(query) {
  const q = (query || document.getElementById("query-input").value || "dextrose").trim();
  const mode = detectMode(q, true);
  ddUnlocked = false;
  ddActivePill = null;
  document.getElementById("dd-title").textContent = mode === "hscode" ? "HS 1702.3000: Dextrose" : q;
  document.getElementById("dd-sub").textContent = "Sweeteners · fabricated example results for this demo";
  document.getElementById("dd-shipment-count").textContent = `${COMPANIES.length * 14} shipments (demo)`;
  renderFilters();
  renderPills();
  document.getElementById("dd-results-wrap").innerHTML = `<p style="text-align:center;color:var(--text-2);padding:40px 0">${icon("mouse-pointer-click", 16)} Select a trade perspective above</p>`;
  switchView("results");
}

function renderFilters() {
  const el = document.getElementById("dd-filters");
  const products = [...new Set(COMPANIES.flatMap(c => c.products.map(p => p.name)))];
  el.innerHTML = products.map(p => `
    <label class="dd-filter-item">
      <span><input type="checkbox"> ${escapeHtml(p)}</span>
      <span class="count">${COMPANIES.filter(c => c.products.some(pp => pp.name === p)).length}</span>
    </label>
  `).join("");
}

const DD_PILLS = [
  { id: "foreign-suppliers", label: "Foreign Suppliers", sub: "Import → Sellers", filter: c => c.country !== "Pakistan" },
  { id: "foreign-buyers", label: "Foreign Buyers", sub: "Export → Buyers", filter: c => c.country !== "Pakistan" },
  { id: "pk-buyers", label: "Pakistani Buyers", sub: "Import → Local Buyers", filter: c => c.country === "Pakistan" },
  { id: "pk-suppliers", label: "Pakistani Suppliers", sub: "Export → Local Sellers", filter: c => c.country === "Pakistan" }
];

function renderPills() {
  document.getElementById("dd-pills").innerHTML = DD_PILLS.map(p => `
    <button type="button" class="dd-pill${p.id === ddActivePill ? " is-active" : ""}" data-pill="${p.id}">
      <b>${escapeHtml(p.label)}</b><span>${escapeHtml(p.sub)}</span>
    </button>
  `).join("");
}

function selectPill(pillId) {
  ddActivePill = pillId;
  renderPills();
  const pill = DD_PILLS.find(p => p.id === pillId);
  const results = COMPANIES.filter(pill.filter);
  const wrap = document.getElementById("dd-results-wrap");

  if (!results.length) {
    wrap.innerHTML = `<p style="text-align:center;color:var(--text-2);padding:40px 0">${icon("inbox", 16)} No results for this trade perspective. Try another tab.</p>`;
    return;
  }

  wrap.innerHTML = `
    <p class="dd-result-count">${results.length} ${pill.label.includes("Buyer") ? "Buyers" : "Suppliers"} found for this search</p>
    <div id="dd-cards"></div>
    ${!ddUnlocked ? `
      <div class="unlock-banner">
        <div class="unlock-banner__icon">${icon("lock", 24)}</div>
        <h3>Unlock Category Intelligence</h3>
        <p>See full contact-unlock access and compare tools for every company in this result set.</p>
        <button class="btn btn--primary" type="button" id="unlock-category-btn">Unlock for 500 Tokens</button>
      </div>
    ` : ""}
  `;
  renderDdCards(results);

  const unlockBtn = document.getElementById("unlock-category-btn");
  if (unlockBtn) unlockBtn.addEventListener("click", () => {
    if (tokenBalance < 5) { showModal("modal-insufficient"); return; }
    tokenBalance -= 5;
    renderTokenBalance();
    ddUnlocked = true;
    selectPill(pillId);
  });
}

function renderDdCards(results) {
  document.getElementById("dd-cards").innerHTML = results.map(c => `
    <div class="dd-card${ddUnlocked ? "" : " is-locked"}">
      <div style="min-width:180px">
        <a href="#" class="dd-card__name" data-open-profile="${c.id}">${escapeHtml(c.name)}</a>
        <div class="dd-card__country">${escapeHtml(c.country)}</div>
      </div>
      <div class="dd-card__stats">
        <div class="dd-card__stat"><b>${escapeHtml(c.avg_price)}</b><span>Avg Price</span></div>
        <div class="dd-card__stat"><b>${escapeHtml(c.volume)}</b><span>Volume</span></div>
        <div class="dd-card__stat"><b>${c.shipments}</b><span>Shipments</span></div>
        <div class="dd-card__stat"><b>${escapeHtml(c.avg_shipment)}</b><span>Avg Shipment</span></div>
      </div>
      <div class="dd-card__actions">
        <button class="btn btn--primary" type="button" data-open-profile="${c.id}">View Deal</button>
      </div>
    </div>
  `).join("");
}

// ============================ Trade Directory ============================

function renderDirectory() {
  document.getElementById("td-title").textContent = currentRole === "Supplier" ? "Find Suppliers" : "Find Buyers";
  document.getElementById("td-lede").textContent = currentRole === "Supplier"
    ? "Browse verified suppliers with real trade history."
    : "Connect with verified buyers and distributors.";
  document.getElementById("td-switch-btn").textContent = currentRole === "Supplier" ? "Switch to Buyers →" : "Switch to Suppliers →";

  const query = (document.getElementById("td-search-input").value || "").toLowerCase();
  const results = COMPANIES.filter(c => c.name.toLowerCase().includes(query));

  document.getElementById("directory-grid").innerHTML = results.map(c => companyCardHtml(c)).join("")
    || `<p style="color:var(--text-2)">No suppliers found.</p>`;
}

function companyCardHtml(c) {
  const watched = watchedIds.has(c.id);
  return `
    <div class="company-card">
      <div class="company-card__body">
        <div class="company-card__head">
          <span class="company-card__avatar" aria-hidden="true">${escapeHtml(c.name.charAt(0))}</span>
          <button class="star-btn${watched ? " is-watched" : ""}" data-watch="${c.id}" type="button" aria-label="Watch">${icon("star", 15).replace('fill="none"', watched ? 'fill="currentColor"' : 'fill="none"')}${watched ? "" : " Watch"}</button>
        </div>
        <div class="company-card__name">${escapeHtml(c.name)}</div>
        <div class="company-card__badges">
          <span class="badge">${icon("map-pin", 12)} ${escapeHtml(c.country)}</span>
          <span class="badge">${icon("tag", 12)} ${escapeHtml(c.sector)}</span>
          <span class="badge">${icon("building", 12)} ${escapeHtml(c.type)}</span>
          ${c.has_key_contacts && c.verified ? `<span class="badge is-verified">${icon("check-circle", 12)} Verified Contacts</span>` : ""}
        </div>
      </div>
      <div class="company-card__footer">
        <button class="btn btn--dark" data-open-profile="${c.id}" type="button">View Profile &amp; Contacts</button>
      </div>
    </div>
  `;
}

function renderWatchlist() {
  const results = COMPANIES.filter(c => watchedIds.has(c.id));
  document.getElementById("watchlist-grid").innerHTML = results.map(c => companyCardHtml(c)).join("")
    || `<p style="color:var(--text-2)">Your watchlist is empty. Star a company from the Trade Directory to add it here.</p>`;
}

// ============================ Company Profile ============================

function getSeniorityBadge(designation) {
  const d = (designation || "").toLowerCase();
  if (/(ceo|chief|director|owner|partner|president|founder)/.test(d)) return ["Decision Maker", "decision"];
  if (/procurement/.test(d)) return ["Procurement", "procurement"];
  if (/sales/.test(d)) return ["Sales", "sales"];
  if (/(manag|head)/.test(d)) return ["Management", "management"];
  return ["Team Member", "team"];
}

function maskEmail(email) {
  if (!email) return "";
  const [user, domain] = email.split("@");
  return `${user[0]}•••••@${domain}`;
}
function maskPhone(phone) {
  if (!phone) return "";
  return phone.slice(0, 3) + " ••••-•••••••";
}

function openProfile(id) {
  currentProfileId = id;
  const c = COMPANIES.find(x => x.id === id);
  if (!c) return;

  document.getElementById("profile-avatar").textContent = c.name.charAt(0);
  document.getElementById("profile-name").innerHTML = escapeHtml(c.name) + (c.verified ? ` <span class="badge is-verified" style="margin-left:8px">${icon("check-circle", 12)} Verified</span>` : "");
  document.getElementById("profile-legal").textContent = c.legal_name !== c.name ? c.legal_name : "";
  document.getElementById("profile-loc").innerHTML = `${icon("map-pin", 13)} ${escapeHtml(c.district)}, ${escapeHtml(c.province)}, ${escapeHtml(c.country)}`;

  const unlockedCount = c.contacts.filter(k => k.unlocked || k.is_public).length;
  document.getElementById("profile-stats").innerHTML = `
    <div class="profile-stat"><b>${escapeHtml(c.sector)}</b><span>Sector</span></div>
    <div class="profile-stat"><b>${escapeHtml(c.type)}</b><span>Type</span></div>
    <div class="profile-stat"><b>${c.established}</b><span>Established</span></div>
    <div class="profile-stat"><b>${escapeHtml(c.employees)}</b><span>Employees</span></div>
    <div class="profile-stat"><b>${c.contacts.length} (${unlockedCount} unlocked)</b><span>Contacts</span></div>
  `;

  document.getElementById("profile-products").innerHTML = c.products.map(p => `
    <span class="product-pill">${escapeHtml(p.name)}${p.variety ? ` · ${escapeHtml(p.variety)}` : ""}${p.value_added ? `<span class="va">Value Added</span>` : ""}</span>
  `).join("");

  renderContacts(c);
  switchView("profile");
}

function renderContacts(c) {
  const unlockedCount = c.contacts.filter(k => k.unlocked || k.is_public).length;
  const sub = c.contacts.length === 0 ? "No contacts listed"
    : unlockedCount === c.contacts.length ? `All ${c.contacts.length} contacts unlocked ${icon("check-circle", 12)}`
    : `${unlockedCount} of ${c.contacts.length} contacts unlocked · 1 token each`;
  document.getElementById("profile-contact-sub").innerHTML = sub;

  document.getElementById("profile-contacts").innerHTML = c.contacts.map(k => {
    const isUnlocked = k.unlocked || k.is_public;
    const [senLabel, senClass] = getSeniorityBadge(k.designation);
    return `
      <div class="contact-card">
        <span class="contact-avatar ${isUnlocked ? "is-unlocked" : "is-locked"}" aria-hidden="true">${escapeHtml(k.name.charAt(0))}</span>
        <div style="flex:1">
          <div class="contact-name-row">
            <span class="contact-name">${escapeHtml(k.name)}</span>
            ${k.is_public ? `<span class="seniority-badge sales">Public</span>` : isUnlocked ? `<span class="seniority-badge sales">${icon("check-circle", 11)} Unlocked</span>` : ""}
            <span class="seniority-badge ${senClass}">${senLabel}</span>
          </div>
          <div class="contact-desig">${escapeHtml(k.designation)}</div>
          <div class="contact-rows">
            <div class="contact-row${isUnlocked ? "" : " is-masked"}">${icon("phone", 13)} ${isUnlocked ? escapeHtml(k.phone) : maskPhone(k.phone)}</div>
            <div class="contact-row${isUnlocked ? "" : " is-masked"}">${icon("mail", 13)} ${isUnlocked ? escapeHtml(k.email) : maskEmail(k.email)}</div>
            ${k.whatsapp ? `<div class="contact-row${isUnlocked ? "" : " is-masked"}">${icon("message-circle", 13)} ${isUnlocked ? escapeHtml(k.whatsapp) : maskPhone(k.whatsapp)}</div>` : ""}
          </div>
          ${!isUnlocked ? `<button class="btn btn--primary contact-unlock-btn" data-unlock-contact="${k.id}" type="button">${icon("lock", 13)} Unlock Contact Details · 1 token</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  if (c.contacts.some(k => !k.unlocked && !k.is_public) && tokenBalance < 1) {
    document.getElementById("profile-contacts").innerHTML += `<div class="token-note-box">You need tokens to unlock contacts. <a href="#" data-view="subscription">Top up &rarr;</a></div>`;
  }
}

// ============================ Unlock modal flow ============================

function showModal(id) { document.getElementById(id).classList.add("is-open"); }
function hideModal(id) { document.getElementById(id).classList.remove("is-open"); }

function requestUnlock(contactId) {
  const c = COMPANIES.find(x => x.id === currentProfileId);
  const k = c.contacts.find(x => x.id === contactId);
  pendingUnlock = { companyId: c.id, contactId };
  document.getElementById("confirm-text").textContent = `Unlock ${k.name}'s contact details for 1 token? You have ${tokenBalance} left.`;
  showModal("modal-confirm");
}

function confirmUnlock() {
  hideModal("modal-confirm");
  if (!pendingUnlock) return;
  if (tokenBalance < 1) { showModal("modal-insufficient"); pendingUnlock = null; return; }
  const c = COMPANIES.find(x => x.id === pendingUnlock.companyId);
  const k = c.contacts.find(x => x.id === pendingUnlock.contactId);
  tokenBalance -= 1;
  k.unlocked = true;
  renderTokenBalance();
  renderContacts(c);
  document.getElementById("success-text").textContent = `${k.name} · ${k.phone} · ${k.email}`;
  showModal("modal-success");
  pendingUnlock = null;
}

// ============================ Subscription ============================

function renderPlans() {
  document.getElementById("plan-grid").innerHTML = SUBSCRIPTION_PLANS.map(p => `
    <div class="plan-card${p.popular ? " is-popular" : ""}">
      ${p.popular ? `<span class="plan-card__badge">Most popular</span>` : ""}
      <h3>${escapeHtml(p.name)}</h3>
      <div><span class="price">${escapeHtml(p.price)}</span> <span class="period">${escapeHtml(p.period)}</span></div>
      <p style="font-size:12.5px;color:var(--text-2);margin:8px 0 0">${p.tokens} tokens included</p>
      <ul>${Object.entries(p.features).filter(([, v]) => v !== false).map(([k, v]) => `<li>${v === true ? escapeHtml(k) : `${escapeHtml(k)}: ${escapeHtml(v)}`}</li>`).join("")}</ul>
      <button class="btn btn--primary" type="button" data-buy-plan="${p.id}">Get Plan</button>
    </div>
  `).join("");
}

// ============================ Init / events ============================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dash-username").textContent = USER.name;
  document.getElementById("user-avatar").textContent = USER.initial;
  document.getElementById("stat-records").textContent = STATS.records;
  document.getElementById("stat-companies").textContent = STATS.companies;
  document.getElementById("stat-products").textContent = STATS.products;
  renderTokenBalance();
  renderPlans();

  // Nav + generic view links
  document.body.addEventListener("click", (e) => {
    const viewLink = e.target.closest("[data-view]");
    if (viewLink) {
      e.preventDefault();
      if (viewLink.dataset.role) currentRole = viewLink.dataset.role;
      switchView(viewLink.dataset.view);
      if (viewLink.dataset.view === "directory") renderDirectory();
      if (viewLink.dataset.view === "watchlist") renderWatchlist();
      document.getElementById("intel-dropdown").classList.remove("is-open");
      return;
    }
    const openProfileBtn = e.target.closest("[data-open-profile]");
    if (openProfileBtn) { e.preventDefault(); openProfile(openProfileBtn.dataset.openProfile); return; }

    const watchBtn = e.target.closest("[data-watch]");
    if (watchBtn) {
      const id = watchBtn.dataset.watch;
      if (watchedIds.has(id)) watchedIds.delete(id); else watchedIds.add(id);
      renderDirectory();
      return;
    }

    const unlockContactBtn = e.target.closest("[data-unlock-contact]");
    if (unlockContactBtn) { requestUnlock(unlockContactBtn.dataset.unlockContact); return; }

    const pillBtn = e.target.closest("[data-pill]");
    if (pillBtn) { selectPill(pillBtn.dataset.pill); return; }

    const buyPlanBtn = e.target.closest("[data-buy-plan]");
    if (buyPlanBtn) {
      const plan = SUBSCRIPTION_PLANS.find(p => p.id === buyPlanBtn.dataset.buyPlan);
      tokenBalance += plan.tokens;
      renderTokenBalance();
      buyPlanBtn.innerHTML = `${icon("check-circle", 13)} Tokens added`;
      setTimeout(() => { buyPlanBtn.textContent = "Get Plan"; }, 2000);
      return;
    }

    if (e.target.closest("#intel-toggle")) {
      document.getElementById("intel-dropdown").classList.toggle("is-open");
      return;
    }
    if (!e.target.closest("#intel-dropdown")) {
      document.getElementById("intel-dropdown").classList.remove("is-open");
    }
  });

  document.getElementById("query-input").addEventListener("input", (e) => renderModePill(e.target.value));
  document.getElementById("search-btn").addEventListener("click", () => runSearch());
  document.getElementById("query-input").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

  document.querySelectorAll(".scope-btn").forEach(b => b.addEventListener("click", () => {
    currentScope = b.dataset.scope;
    document.querySelectorAll(".scope-btn").forEach(x => x.classList.toggle("is-active", x === b));
  }));

  document.querySelectorAll(".example-row button").forEach(b => b.addEventListener("click", () => {
    document.getElementById("query-input").value = b.dataset.example;
    renderModePill(b.dataset.example);
  }));

  document.getElementById("td-switch-btn").addEventListener("click", () => {
    currentRole = currentRole === "Supplier" ? "Buyer" : "Supplier";
    renderDirectory();
  });
  document.getElementById("td-search-input").addEventListener("input", renderDirectory);

  document.getElementById("confirm-cancel").addEventListener("click", () => { hideModal("modal-confirm"); pendingUnlock = null; });
  document.getElementById("confirm-ok").addEventListener("click", confirmUnlock);
  document.getElementById("success-close").addEventListener("click", () => hideModal("modal-success"));
  document.getElementById("insufficient-close").addEventListener("click", () => hideModal("modal-insufficient"));
  document.getElementById("insufficient-buy").addEventListener("click", () => hideModal("modal-insufficient"));

  renderDirectory();
});
