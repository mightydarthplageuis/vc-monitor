// ── Tabs ─────────────────────────────────────────────────────────────────
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll(".tab")) t.classList.remove("active");
    for (const p of document.querySelectorAll(".page")) p.classList.remove("active");
    tab.classList.add("active");
    document.getElementById(tab.dataset.page).classList.add("active");
  });
}

// ── Settings ─────────────────────────────────────────────────────────────
const proxyInput = document.getElementById("proxy-input");
const webhookInput = document.getElementById("webhook-input");
const intervalInput = document.getElementById("interval-input");
const settingsStatus = document.getElementById("settings-status");

let pollIntervalSeconds = 60;

async function loadSettings() {
  const settings = await window.api.getSettings();
  const proxies = settings.proxies && settings.proxies.length ? settings.proxies : (settings.proxy ? [settings.proxy] : []);
  proxyInput.value = proxies.join("\n");
  webhookInput.value = settings.discordWebhook || "";
  pollIntervalSeconds = settings.pollIntervalSeconds || 60;
  intervalInput.value = pollIntervalSeconds;
}

document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const proxies = proxyInput.value.split("\n").map((s) => s.trim()).filter(Boolean);
  const settings = await window.api.saveSettings({
    proxy: proxies[0] || "",
    proxies,
    discordWebhook: webhookInput.value.trim(),
    pollIntervalSeconds: Math.max(15, parseInt(intervalInput.value, 10) || 60),
  });
  pollIntervalSeconds = settings.pollIntervalSeconds;
  intervalInput.value = pollIntervalSeconds;
  settingsStatus.textContent = "Saved.";
  setTimeout(() => (settingsStatus.textContent = ""), 2000);
  renderLinks();
});

// ── Links ────────────────────────────────────────────────────────────────
const linkUrlInput = document.getElementById("link-url");
const linkEuropeInput = document.getElementById("link-europe");
const addLinkStatus = document.getElementById("add-link-status");
const linksList = document.getElementById("links-list");

let links = [];

function formatTime(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

function renderLinks() {
  linksList.innerHTML = "";

  for (const link of links) {
    const card = document.createElement("div");
    card.className = "link-card" + (link.enabled ? "" : " disabled");

    const status = link.status || {};
    const badges = [];
    if (link.europeOnly) badges.push('<span class="badge eu">EU only</span>');
    if (status.error) badges.push(`<span class="badge error">error</span>`);
    if (status.newCount) badges.push(`<span class="badge new">+${status.newCount} new</span>`);

    card.innerHTML = `
      <div class="link-top">
        <div>
          <div class="link-label">${escapeHtml(link.label || "Custom search")} ${badges.join(" ")}</div>
          <div class="link-url">${escapeHtml(link.url)}</div>
        </div>
        <div class="link-actions">
          <button class="secondary" data-action="check" data-id="${link.id}">Check now</button>
          <button class="secondary" data-action="toggle" data-id="${link.id}">${link.enabled ? "Pause" : "Resume"}</button>
          <button class="danger" data-action="remove" data-id="${link.id}">Remove</button>
        </div>
      </div>
      <div class="link-meta">
        <span>Every ${pollIntervalSeconds}s</span>
        <span>Last check: ${formatTime(status.lastCheck)}</span>
        <span>Total results: ${status.totalHits ?? "-"}</span>
        ${status.error ? `<span title="${escapeHtml(status.error)}">⚠ ${escapeHtml(status.error)}</span>` : ""}
      </div>
    `;

    linksList.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

linksList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === "remove") {
    links = await window.api.removeLink(id);
    renderLinks();
  } else if (action === "toggle") {
    const updated = await window.api.toggleLink(id);
    const idx = links.findIndex((l) => l.id === id);
    if (idx >= 0) links[idx] = updated;
    renderLinks();
  } else if (action === "check") {
    btn.disabled = true;
    const updated = await window.api.checkLinkNow(id);
    const idx = links.findIndex((l) => l.id === id);
    if (idx >= 0) links[idx] = updated;
    renderLinks();
  }
});

document.getElementById("add-link-btn").addEventListener("click", async () => {
  const url = linkUrlInput.value.trim();
  if (!url) {
    addLinkStatus.textContent = "Enter a URL first.";
    return;
  }

  addLinkStatus.textContent = "Adding (resolving brand/model)...";
  const europeOnly = linkEuropeInput.checked;

  try {
    const link = await window.api.addLink({ url, europeOnly });
    links.push(link);
    renderLinks();
    linkUrlInput.value = "";
    addLinkStatus.textContent = `Added: ${link.label}`;
    setTimeout(() => (addLinkStatus.textContent = ""), 3000);
  } catch (err) {
    addLinkStatus.textContent = "Error: " + (err.message || err);
  }
});

window.api.onLinkUpdated((updated) => {
  const idx = links.findIndex((l) => l.id === updated.id);
  if (idx >= 0) links[idx] = updated;
  else links.push(updated);
  renderLinks();
});

// ── Init ─────────────────────────────────────────────────────────────────
(async () => {
  await loadSettings();
  links = await window.api.getLinks();
  renderLinks();
})();
