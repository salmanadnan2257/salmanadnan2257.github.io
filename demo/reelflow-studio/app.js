// Scripted operator-console logic. No network calls, no real n8n webhooks anywhere here.

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const FABRICATED_CAPTIONS = [
  "New batch, same obsession. Cold brew that actually tastes like the beans it came from. ☕",
  "Small roastery, big flavor. Here's a peek at how it all comes together.",
  "Real customers, real reactions. This is why we do it."
];

function cardState(id) {
  if (!window.__cardStates) window.__cardStates = {};
  if (!window.__cardStates[id]) {
    window.__cardStates[id] = { flag: "Generated", caption: "", captionConfirmed: false, captionIdx: 0 };
  }
  return window.__cardStates[id];
}

// Fabricated ids styled like the real console's row uuids; deterministic, not real.
function fakeUuid(i) {
  return `demo-${String(i + 1).padStart(2, "0")}-0000-4000-8000-fabricated${i + 1}`;
}

function renderQueue() {
  const queue = document.getElementById("queue");
  queue.innerHTML = DEMO_VIDEOS.map((v, i) => {
    const s = cardState(v.id);
    return `
    <div class="vcard" id="card-${v.id}" data-id="${v.id}">
      <div class="vcard__head">
        <span class="idx-badge" aria-hidden="true">${i + 1}</span>
        <div class="vcard__meta">
          <div class="vcard__title">${escapeHtml(v.title)}</div>
          <div class="vcard__uuid">${escapeHtml(fakeUuid(i))}</div>
        </div>
        <span class="flag" id="flag-${v.id}">${escapeHtml(s.flag)}</span>
      </div>
      <div class="thumb">
        <video src="${v.video}" controls preload="metadata" playsinline></video>
      </div>

      <div class="vcard__body">
        <div class="section">
          <div class="section-label">Approve / Reject</div>
          <div class="approve-row">
            <button class="av-btn approve" data-action="approve" data-id="${v.id}">&#10003; Approve</button>
            <button class="av-btn reject" data-action="reject" data-id="${v.id}">&#10005; Reject</button>
          </div>
        </div>

        <div class="section">
          <div class="section-label">Caption</div>
          <div class="field-row">
            <textarea id="caption-${v.id}" placeholder="No caption yet."></textarea>
            <div class="btn-row" style="margin-top:8px">
              <button class="btn" data-action="generate-caption" data-id="${v.id}">Generate</button>
              <button class="btn" data-action="redo-caption" data-id="${v.id}">Redo</button>
              <button class="btn btn--yellow" data-action="confirm-caption" data-id="${v.id}">Confirm</button>
            </div>
          </div>
        </div>

        <div class="section publish-block" id="publish-${v.id}">
          <div class="section-label">Publish / Schedule</div>
          <div class="btn-row">
            <button class="btn btn--primary" data-action="publish" data-id="${v.id}">Publish now</button>
            <input type="text" id="schedule-${v.id}" placeholder="e.g. 2026-07-10 09:00 (UTC+5)">
            <button class="btn btn--green" data-action="schedule" data-id="${v.id}">Schedule</button>
          </div>
          <div class="status-text" id="status-${v.id}"></div>
        </div>
      </div>
    </div>
  `;
  }).join("");
  updateQueueCount();
}

function updateQueueCount() {
  const el = document.getElementById("queue-count");
  if (el) el.textContent = document.querySelectorAll(".vcard").length;
}

function updateFlag(id) {
  const s = cardState(id);
  document.getElementById(`flag-${id}`).textContent = s.flag;
  document.getElementById(`flag-${id}`).className =
    "flag" + (s.flag === "Approved" ? " is-approved" : s.flag === "Rejected" ? " is-rejected" : "");

  const card = document.getElementById(`card-${id}`);
  card.querySelector(".av-btn.approve").classList.toggle("sel-approve", s.flag === "Approved");
  card.querySelector(".av-btn.reject").classList.toggle("sel-reject", s.flag === "Rejected");

  const publishBlock = document.getElementById(`publish-${id}`);
  const statusEl = document.getElementById(`status-${id}`);
  if (s.flag === "Rejected") {
    publishBlock.classList.add("is-locked");
    statusEl.textContent = "Publishing disabled, this video was rejected.";
    statusEl.classList.add("is-locked-msg");
  } else {
    publishBlock.classList.remove("is-locked");
    statusEl.classList.remove("is-locked-msg");
    if (statusEl.textContent === "Publishing disabled, this video was rejected.") statusEl.textContent = "";
  }
}

function handleQueueClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const s = cardState(id);
  const action = btn.dataset.action;
  const statusEl = document.getElementById(`status-${id}`);

  if (action === "approve") {
    s.flag = s.flag === "Approved" ? "Generated" : "Approved";
    updateFlag(id);
  } else if (action === "reject") {
    s.flag = s.flag === "Rejected" ? "Generated" : "Rejected";
    updateFlag(id);
  } else if (action === "generate-caption" || action === "redo-caption") {
    s.captionIdx = (s.captionIdx + 1) % FABRICATED_CAPTIONS.length;
    s.caption = FABRICATED_CAPTIONS[s.captionIdx];
    s.captionConfirmed = false;
    document.getElementById(`caption-${id}`).value = s.caption;
  } else if (action === "confirm-caption") {
    s.caption = document.getElementById(`caption-${id}`).value.trim();
    if (!s.caption) { statusEl.textContent = "Write or generate a caption before confirming."; return; }
    s.captionConfirmed = true;
    statusEl.textContent = "Caption confirmed.";
  } else if (action === "publish") {
    if (s.flag === "Rejected") return;
    if (!s.captionConfirmed) { statusEl.textContent = "Confirm a caption before publishing."; return; }
    statusEl.textContent = "Publishing…";
    setTimeout(() => {
      statusEl.textContent = "Published.";
      setTimeout(() => removeCard(id), 1500);
    }, 1200);
  } else if (action === "schedule") {
    if (s.flag === "Rejected") return;
    if (!s.captionConfirmed) { statusEl.textContent = "Confirm a caption before scheduling."; return; }
    const when = document.getElementById(`schedule-${id}`).value.trim() || "2026-07-10 09:00";
    statusEl.textContent = "Scheduling…";
    setTimeout(() => {
      statusEl.textContent = `Scheduled for ${when} UTC.`;
    }, 1200);
  }
}

function removeCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.classList.add("is-removing");
  setTimeout(() => { card.remove(); updateQueueCount(); }, 400);
}

function startQueue() {
  document.getElementById("idle-state").style.display = "none";
  document.getElementById("queue-wrap").style.display = "block";
  document.getElementById("conn-label").textContent = "live";
  renderQueue();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("start-btn").addEventListener("click", startQueue);
  document.getElementById("queue").addEventListener("click", handleQueueClick);

  const policy = document.getElementById("retry-policy");
  policy.textContent = `Every action retries up to ${RETRY_POLICY.attempts} times, ${RETRY_POLICY.gapSeconds}s apart, with a ${RETRY_POLICY.timeoutSeconds}-${RETRY_POLICY.timeoutHeavySeconds}s timeout.`;
});
