const vcApi = require("./vcApi");
const proxy = require("./proxy");
const discord = require("./discord");
const store = require("./store");

// linkId -> interval timer
const timers = new Map();

function updateLinkInStore(updatedLink) {
  const links = store.loadLinks();
  const idx = links.findIndex((l) => l.id === updatedLink.id);
  if (idx >= 0) {
    links[idx] = updatedLink;
  } else {
    links.push(updatedLink);
  }
  store.saveLinks(links);
}

async function runOnce(link, settings) {
  const proxies = settings.proxies && settings.proxies.length ? settings.proxies : (settings.proxy ? [settings.proxy] : []);
  const proxyString = proxy.pickRandom(proxies);
  const proxyUrl = proxy.buildProxyUrl(proxyString);
  const isFirstRun = !Array.isArray(link.seenIds);
  const seen = new Set(link.seenIds || []);

  console.log(`[${link.label || link.id}] checking via proxy ${proxy.maskProxy(proxyString)}`);

  try {
    const { status, json } = await vcApi.search(link.url, {
      europeOnly: !!link.europeOnly,
      offset: 0,
      limit: 48,
      proxyUrl,
    });

    const items = json.items || [];
    const newItems = items.filter((it) => !seen.has(it.id));

    if (!isFirstRun && settings.discordWebhook) {
      for (const item of [...newItems].reverse()) {
        try {
          await discord.sendEmbed(settings.discordWebhook, item);
        } catch {
          // ignore individual notification failures, keep going
        }
      }
    }

    items.forEach((it) => seen.add(it.id));
    link.seenIds = Array.from(seen);
    link.status = {
      lastCheck: new Date().toISOString(),
      httpStatus: status,
      totalHits: json.paginationStats?.totalHits ?? null,
      newCount: isFirstRun ? 0 : newItems.length,
      error: null,
    };

    console.log(`[${link.label || link.id}] status=${status} totalHits=${link.status.totalHits} new=${link.status.newCount}`);
  } catch (e) {
    link.status = {
      lastCheck: new Date().toISOString(),
      httpStatus: null,
      totalHits: link.status?.totalHits ?? null,
      newCount: 0,
      error: String(e.message || e),
    };

    console.error(`[${link.label || link.id}] ERROR via proxy ${proxy.maskProxy(proxyString)}: ${link.status.error}`);
  }

  updateLinkInStore(link);
  return link;
}

/** Start (or restart) polling for a link. Calls onUpdate(link) after each check. */
function start(link, settings, onUpdate) {
  stop(link.id);

  const tick = async () => {
    const updated = await runOnce(link, settings);
    if (onUpdate) onUpdate(updated);
  };

  tick();
  const intervalMs = Math.max(15, settings.pollIntervalSeconds || 60) * 1000;
  const timer = setInterval(tick, intervalMs);
  timers.set(link.id, timer);
}

function stop(linkId) {
  if (timers.has(linkId)) {
    clearInterval(timers.get(linkId));
    timers.delete(linkId);
  }
}

function stopAll() {
  for (const id of timers.keys()) stop(id);
}

module.exports = { start, stop, stopAll, runOnce };
