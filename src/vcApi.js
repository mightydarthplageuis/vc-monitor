const { spawn } = require("child_process");

const SEARCH_URL = "https://search.vestiairecollective.com/v1/product/search";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Vestiaire Collective/5.271.1 (iPhone iOS:26.5 Scale:3.0)",
  "X-VC-Country": "US",
  "X-VC-Currency": "PLN",
  "X-VC-Language": "en",
  "X-VC-SiteId": "6",
  "X-VC-Timezone": "Europe/Warsaw",
};

const FIELDS = [
  "name", "universeId", "description", "brand", "model", "country", "price",
  "discount", "link", "sold", "likes", "editorPicks", "shouldBeGone", "seller",
  "directShipping", "local", "pictures", "colors", "size", "stock", "dutyFree",
  "createdAt", "condition",
];

const FACET_FIELDS = [
  "universe", "categoryLvl0", "categoryLvl1", "categoryLvl2", "country",
  "size1", "size2", "size3", "size4", "size5", "size6", "size7", "size8",
  "size9", "size10", "size11", "size12", "size13", "size14", "size15",
  "size16", "size17", "size18", "size19", "size20", "size21", "size22",
  "size23", "model", "color", "price", "priceRange", "condition",
  "watchMechanism", "materialLvl0", "materialLvl1", "editorPicks",
  "isOfficialStore", "sellerBadge", "sold", "brand", "dealEligible",
  "discount", "stock", "localCountries", "directShippingCountries",
  "directShippingEligible", "createdAt", "dutyFree",
];

const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
];

// Maps the page URL's #fragment filter keys to the API's filter field names.
const FRAGMENT_FIELD_MAP = {
  brand: "brand.id",
  gender: "universe.id",
  categoryParent: "categoryLvl0.id",
  category: "categoryLvl1.id",
  model: "model.id",
  color: "color.id",
  material: "materialLvl0.id",
  condition: "condition.id",
};

/** Convert a Vestiaire Collective page URL's #fragment into API "filters". */
function filtersFromPageUrl(pageUrl) {
  const u = new URL(pageUrl);
  const fragment = decodeURIComponent(u.hash.replace(/^#/, ""));
  const filters = {};

  for (const segment of fragment.split("_")) {
    if (!segment) continue;
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq);
    const value = segment.slice(eq + 1);

    if (key === "priceMax" || key === "priceMin") {
      filters.price = filters.price || {};
      filters.price[key === "priceMax" ? "lte" : "gte"] = parseInt(value, 10);
      continue;
    }

    const sizeMatch = key.match(/^size(\d+)$/);
    if (sizeMatch) {
      // Size facet IDs are full tokens like "9#52", not just the trailing number.
      const sizeIds = value.split("-").filter(Boolean);
      if (sizeIds.length) filters[`size${sizeMatch[1]}`] = sizeIds;
      continue;
    }

    const ids = [...value.matchAll(/#(\d+)/g)].map((m) => m[1]);
    if (ids.length && FRAGMENT_FIELD_MAP[key]) {
      filters[FRAGMENT_FIELD_MAP[key]] = ids;
    }
  }

  return filters;
}

function buildPayload(pageUrl, { europeOnly = false, offset = 0, limit = 48 } = {}) {
  const filters = filtersFromPageUrl(pageUrl);
  if (europeOnly) filters.country = EU_COUNTRIES;

  return {
    locale: { currency: "PLN", language: "en", sizeType: "US", country: "US" },
    fields: FIELDS,
    filters,
    recentlyViewedProductIDs: [],
    sortBy: "recency",
    forcedFilters: {},
    options: {
      disableCategoryParentFiltering: true,
      enableAutoSuggestion: true,
      enableGuidedSearch: true,
      innerFeedContext: "genericPLP",
      disableHierarchicalParentFiltering: true,
    },
    facets: { stats: ["price"], fields: FACET_FIELDS },
    pagination: { offset, limit },
  };
}

const STATUS_MARKER = "__HTTP_STATUS__";

/**
 * Run a product search for the given page URL via curl (curl's TLS
 * fingerprint passes Cloudflare's bot checks, unlike Node's https module).
 * Returns { status, json }.
 */
function search(pageUrl, { europeOnly = false, offset = 0, limit = 48, proxyUrl } = {}) {
  return new Promise((resolve, reject) => {
    const payload = buildPayload(pageUrl, { europeOnly, offset, limit });
    const data = JSON.stringify(payload);

    const args = ["-s", "-S", "-X", "POST", SEARCH_URL];
    for (const [k, v] of Object.entries(BASE_HEADERS)) {
      args.push("-H", `${k}: ${v}`);
    }
    args.push("--data-binary", "@-", "--compressed", "-k", "--max-time", "25");
    args.push("-w", `\n${STATUS_MARKER}%{http_code}`);
    if (proxyUrl) args.push("-x", proxyUrl);

    const proc = spawn("curl", args);

    const stdout = [];
    const stderr = [];
    proc.stdout.on("data", (c) => stdout.push(c));
    proc.stderr.on("data", (c) => stderr.push(c));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`curl exited with code ${code}: ${Buffer.concat(stderr).toString("utf-8").trim()}`));
        return;
      }

      const out = Buffer.concat(stdout).toString("utf-8");
      const markerIdx = out.lastIndexOf(STATUS_MARKER);
      const body = markerIdx === -1 ? out : out.slice(0, markerIdx);
      const status = markerIdx === -1 ? null : parseInt(out.slice(markerIdx + STATUS_MARKER.length).trim(), 10);

      try {
        const json = JSON.parse(body);
        resolve({ status, json });
      } catch (e) {
        const titleMatch = body.match(/<title>(.*?)<\/title>/i);
        const detail = [
          `status ${status}`,
          titleMatch ? `title="${titleMatch[1]}"` : null,
        ].filter(Boolean).join(", ");
        reject(new Error(`Failed to parse response (${detail})`));
      }
    });

    proc.stdin.write(data);
    proc.stdin.end();
  });
}

module.exports = { filtersFromPageUrl, buildPayload, search, EU_COUNTRIES, BASE_HEADERS };
