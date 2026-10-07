import { create as createAxios } from "axios";

const PAGASA_API_BASE = "https://pagasa.chlod.net";

export const PAGASA_TCWS_COLORS = {
  1: "#00aaff",
  2: "#fff200",
  3: "#ffaa00",
  4: "#ff0000",
  5: "#cd00cd",
};

export const PAGASA_TCWS_LABELS = {
  1: "Bagyong hangin (60 km/h)",
  2: "Malakas na hangin (60–100 km/h)",
  3: "Mapinsalang hangin (100–185 km/h)",
  4: "Napakapinsalang hangin (≤250 km/h)",
  5: "Labis na mapinsalang hangin (>250 km/h)",
};

const pane = createAxios({
  baseURL: PAGASA_API_BASE,
  timeout: 15000,
});

const STORM_SIGNAL_CACHE_KEY = "signals:latest";
const cache = new Map();
const CACHE_MAX = 8;

function cacheSet(key, data) {
  cache.set(key, data);
  if (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
}

export function getCachedStormSignals() {
  return cache.get(STORM_SIGNAL_CACHE_KEY) ?? null;
}

function toAreas(level) {
  if (!level) return [];
  const areas = [];
  for (const landmass of Object.values(level.areas ?? {})) {
    for (const area of landmass ?? []) {
      if (area?.name) areas.push({ name: area.name });
    }
  }
  return areas;
}

function normalizeBulletin(data) {
  const b = data?.bulletin;
  if (!b) return null;
  const signals = [];
  let rawCount = 0;
  for (let lvl = 1; lvl <= 5; lvl += 1) {
    const plugin = b.signals?.[String(lvl)];
    if (!plugin) continue;
    const areas = toAreas(plugin);
    if (areas.length === 0) continue;
    signals.push({ level: lvl, areas });
    rawCount += areas.length;
  }
  if (signals.length === 0) return null;
  const cyclone = b.cyclone ?? {};
  return {
    active: true,
    generatedAt: new Date().toISOString(),
    bulletin: {
      count: b.info?.count ?? null,
      title: b.info?.title ?? null,
      issuedAt: b.info?.issued ?? null,
      expiresAt: b.info?.expires ?? null,
      final: Boolean(b.info?.final),
      url: b.info?.url ?? null,
    },
    cyclone: {
      name: cyclone.name ?? null,
      internationalName: cyclone.internationalName ?? null,
      category: cyclone.category ?? null,
      center: cyclone.center ?? null,
      movement: cyclone.movement ?? null,
    },
    signals,
    rawAreaCount: rawCount,
  };
}

function latestNonFinalBulletin(bulletins) {
  const candidates = (bulletins ?? []).filter(
    (b) => b && !b.final && b.file && b.file.toLowerCase().startsWith("tcb")
  );
  candidates.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return candidates[0] ?? null;
}

function bulletinMeta(info) {
  if (!info) return null;
  return {
    count: info.count ?? null,
    title: info.title ?? null,
    issuedAt: info.issued ?? null,
    expiresAt: info.expires ?? null,
    final: Boolean(info.final),
    url: info.url ?? null,
  };
}

async function fetchLiveSignals() {
  const listResponse = await pane.get("/api/v1/bulletin/list");
  const bulletins = listResponse.data?.bulletins;
  const bulletin = latestNonFinalBulletin(bulletins);
  if (!bulletin) {
    return { unavailable: false, active: false, bulletin: null };
  }
  const file = encodeURIComponent(bulletin.file);
  const parseResponse = await pane.get(`/api/v1/format/json/${file}`);
  if (!parseResponse.data || parseResponse.data.error) {
    return { unavailable: true };
  }
  const signals = normalizeBulletin(parseResponse.data);
  if (!signals) {
    return {
      unavailable: false,
      active: false,
      bulletin: bulletinMeta(parseResponse.data?.bulletin?.info) ?? {
        count: bulletin.count,
        title: bulletin.file,
      },
    };
  }
  return {
    unavailable: false,
    active: true,
    ...signals,
    sourceBulletin: bulletin.file,
  };
}

function emptyResult(details) {
  return {
    active: false,
    generatedAt: new Date().toISOString(),
    sourceBulletin: null,
    bulletin: null,
    cyclone: null,
    signals: [],
    rawAreaCount: 0,
    ...details,
  };
}

export async function getStormSignals({ force = false } = {}) {
  const cached = cache.get(STORM_SIGNAL_CACHE_KEY);
  if (cached && !force) return cached;

  try {
    const live = await fetchLiveSignals();
    if (live.unavailable) {
      const result = emptyResult({ unavailable: true });
      cacheSet(STORM_SIGNAL_CACHE_KEY, result);
      return result;
    }
    const result = {
      active: live.active,
      generatedAt: new Date().toISOString(),
      bulletin: live.bulletin ?? null,
      cyclone: live.cyclone ?? null,
      signals: live.signals ?? [],
      rawAreaCount: live.rawAreaCount ?? 0,
      sourceBulletin: live.sourceBulletin ?? null,
    };
    cacheSet(STORM_SIGNAL_CACHE_KEY, result);
    return result;
  } catch {
    const result = emptyResult({ unavailable: true });
    cacheSet(STORM_SIGNAL_CACHE_KEY, result);
    return result;
  }
}

// Sample fixture modeled on Super Typhoon PEPITO (MAN-YI), using the 8 AM
// 17 Nov 2024 TCB#16: center over the sea east of Quezon (pre-Aurora landfall),
// signals across Luzon and Bicol. Each entry uses an exact province polygon
// name from phProvinces.json at its highest hoisted signal so the overlay
// colors every affected province correctly.
const SAMPLE_LUZON = {
  bulletin: {
    count: 16,
    title: "Tropical Cyclone Bulletin No. 16",
    issuedAt: "2024-11-17T00:00:00.000Z",
    expiresAt: null,
    final: false,
    url: null,
  },
  cyclone: {
    name: "TINO",
    internationalName: "MAN-YI",
    category: "SUPER TYPHOON",
    center: "Over the sea east of Quezon",
    movement: "Moving west northwestward at 15 km/h",
  },
  signals: [
    {
      level: 4,
      areas: [
        { name: "Aurora" },
        { name: "Quezon" },
        { name: "Camarines Norte" },
        { name: "Camarines Sur" },
        { name: "Nueva Ecija" },
        { name: "Nueva Vizcaya" },
        { name: "Quirino" },
      ],
    },
    {
      level: 3,
      areas: [
        { name: "Catanduanes" },
        { name: "Laguna" },
        { name: "Rizal" },
        { name: "Bulacan" },
        { name: "Pampanga" },
        { name: "Tarlac" },
        { name: "Zambales" },
        { name: "Isabela" },
        { name: "Ilocos Sur" },
        { name: "La Union" },
        { name: "Pangasinan" },
        { name: "Benguet" },
        { name: "Ifugao" },
        { name: "Mountain Province" },
        { name: "Abra" },
        { name: "Kalinga" },
      ],
    },
    {
      level: 2,
      areas: [
        { name: "Albay" },
        { name: "Cagayan" },
        { name: "Apayao" },
        { name: "Ilocos Norte" },
        { name: "Bataan" },
        { name: "Metro Manila" },
        { name: "Cavite" },
        { name: "Batangas" },
        { name: "Marinduque" },
      ],
    },
    {
      level: 1,
      areas: [
        { name: "Masbate" },
        { name: "Romblon" },
        { name: "Oriental Mindoro" },
        { name: "Occidental Mindoro" },
      ],
    },
  ],
  rawAreaCount: 36,
};

function sampleFromFixture() {
  return {
    active: true,
    generatedAt: new Date().toISOString(),
    sample: true,
    ...SAMPLE_LUZON,
  };
}

export function getSampleStormSignals() {
  return sampleFromFixture();
}