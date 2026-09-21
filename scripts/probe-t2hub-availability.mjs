#!/usr/bin/env node

const proxyBase = (process.env.SVP_PROXY_URL || "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/svp-proxy").replace(/\/$/, "");
const maxCategories = Number(process.env.MAX_CATEGORIES || 100);
const maxCities = Number(process.env.MAX_CITIES || 50);
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 6));
const timeoutMs = Math.max(1000, Number(process.env.TIMEOUT_MS || 15000));

function valuesFrom(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key] ?? payload?.data?.[key];
    if (Array.isArray(value)) return value;
  }
  return Array.isArray(payload) ? payload : [];
}

function categoryId(item) {
  return String(item?.category_id ?? item?.categoryId ?? item?.occupation_id ?? item?.id ?? "").trim();
}

function categoryName(item) {
  return String(item?.name ?? item?.occupation_name ?? item?.title ?? item?.occupation_key ?? "").trim();
}

function cityName(item) {
  return String(typeof item === "string" ? item : item?.city ?? item?.division ?? item?.name ?? "").trim();
}

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${proxyBase}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function discover() {
  const [occupationsPayload, centersPayload] = await Promise.all([
    getJson("/booking-data/occupations?per_page=1000"),
    getJson("/booking-data/test-centers?city=Dhaka"),
  ]);

  const occupations = valuesFrom(occupationsPayload, ["occupations", "categories", "items"])
    .map((item) => ({ id: categoryId(item), name: categoryName(item) }))
    .filter((item) => item.id)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, maxCategories);

  const discoveredCities = valuesFrom(centersPayload, ["sites", "test_centers", "centers"])
    .map(cityName)
    .filter(Boolean);
  const cities = [...new Set(["Dhaka", "Rajshahi", "Chattogram", ...discoveredCities])].slice(0, maxCities);

  return { occupations, cities };
}

async function mapLimit(items, worker) {
  const results = [];
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const { occupations, cities } = await discover();
const pairs = occupations.flatMap((occupation) => cities.map((city) => ({ occupation, city })));
console.error(`Testing ${pairs.length} category/city combinations via ${proxyBase}`);

const results = await mapLimit(pairs, async ({ occupation, city }) => {
  const query = new URLSearchParams({ category_id: occupation.id, city });
  const started = Date.now();
  try {
    const body = await getJson(`/booking-data/exam-available-dates?${query}`);
    const dates = valuesFrom(body, ["available_dates", "availableDates", "dates"])
      .map((date) => String(date).trim())
      .filter(Boolean);
    return { category_id: occupation.id, category: occupation.name, city, dates, elapsed_ms: Date.now() - started };
  } catch (error) {
    return { category_id: occupation.id, category: occupation.name, city, dates: [], error: String(error.message || error), elapsed_ms: Date.now() - started };
  }
});

const active = results.filter((result) => result.dates.length > 0);
console.log(JSON.stringify({
  proxy: proxyBase,
  tested: results.length,
  active_count: active.length,
  active,
  errors: results.filter((result) => result.error).slice(0, 20),
}, null, 2));
