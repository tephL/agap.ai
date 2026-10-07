// Sample / seed PAGASA typhoon pool used to exercise every part of the Typhoons
// feature (map overlay, list, auto-fit, tap-to-focus, AI context) with realistic
// data, independent of the live PAGASA mirror. Each storm mirrors the shape
// emitted by parsePagasaBulletinText in trackJson.js so buildTrackGeojson,
// trackBounds, TyphoonsTab and getTyphoonsContext all consume it unchanged.
//
// Unlike the real parser output (which never fills `pastLine`), every sample
// storm carries a multi-point `pastLine` so the solid "Past track" map layer
// renders too. `bbox` is required for the one-shot camera auto-fit.

import { statusKeyFromWindspeed } from "./trackJson.js";

const nowMs = Date.now();
const HOUR = 60 * 60 * 1000;

// Helper: build a track position point with normalized intensity.
function pt(lon, lat, windspeed, isForecast, extra = {}) {
  const status =
    statusKeyFromWindspeed(windspeed) === "unknown"
      ? "Tropical cyclone"
      : statusNameFromKey(statusKeyFromWindspeed(windspeed));
  return {
    lon,
    lat,
    windspeed,
    gust: extra.gust ?? Math.round(windspeed * 1.25),
    pressure: extra.pressure ?? pressureFor(windspeed),
    status,
    intensity: statusKeyFromWindspeed(windspeed),
    isForecast,
    date: extra.date ?? null,
    ...(isForecast
      ? {
          label: extra.label ?? null,
          hours: extra.hours ?? null,
          timeText: extra.timeText ?? null,
          dateText: extra.dateText ?? null,
          location: extra.location ?? null,
          msw: windspeed,
          category: status,
          movement: { direction: extra.dir ?? null, speed: extra.speed ?? null },
        }
      : {}),
  };
}

function statusNameFromKey(key) {
  const names = {
    superTyphoon: "Super Typhoon",
    severeTyphoon: "Severe Typhoon",
    typhoon: "Typhoon",
    severeStorm: "Severe Tropical Storm",
    tropicalStorm: "Tropical Storm",
    depression: "Tropical Depression",
  };
  return names[key] ?? "Tropical cyclone";
}

function pressureFor(kmh) {
  if (kmh >= 220) return 905;
  if (kmh >= 185) return 930;
  if (kmh >= 118) return 960;
  if (kmh >= 88) return 985;
  if (kmh >= 63) return 995;
  if (kmh >= 34) return 1004;
  return 1008;
}

function boundingBox(coords) {
  let b = null;
  for (const [x, y] of coords) {
    if (b == null) b = [x, y, x, y];
    else {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }
  return b;
}

function makeStorm({ eventId, name, internationalName, category, current, pastCoords, forecastCoords, movement }) {
  const currentPt = {
    date: nowMs,
    ...current,
    status: current.status ?? category,
    intensity: statusKeyFromWindspeed(current.windspeed),
  };
  const past = pastCoords.map((c, i) =>
    pt(
      c[0],
      c[1],
      c[2] ?? current.windspeed,
      false,
      { date: nowMs - (pastCoords.length - i) * 6 * HOUR }
    )
  );
  const forecast = forecastCoords.map((c, i) => {
    const hours = (i + 1) * 12;
    return pt(c[0], c[1], c[2] ?? current.windspeed, true, {
      label: `${hours}-Hour Forecast`,
      hours,
      timeText: "8:00 AM",
      dateText: "",
      location: c[3] ?? "",
      dir: c[4] ?? movement.direction,
      speed: c[5] ?? movement.speed,
    });
  });

  const pastLine = [...past.map((p) => [p.lon, p.lat]), [current.lon, current.lat]];
  const forecastLine = [[current.lon, current.lat], ...forecast.map((f) => [f.lon, f.lat])];
  const bbox = boundingBox(pastLine.concat(forecastLine));

  return {
    eventId,
    name,
    internationalName: internationalName ?? null,
    bulletinNumber: current.bulletinNumber ?? null,
    source: "PAGASA",
    category,
    intensity: statusKeyFromWindspeed(current.windspeed),
    issuedAtText: "8:00 AM",
    issuedAt: nowMs,
    movement,
    signals: [],
    signalsSummary: "Signal No. 1 may be hoisted over parts of the affected area",
    extentKm: extentFor(current.windspeed),
    current: currentPt,
    overallWindspeed: current.windspeed,
    overallStormstatus: category,
    past,
    forecast,
    pastLine,
    forecastLine,
    bbox,
  };
}

// Extent of tropical cyclone winds (km) varies with intensity so each storm's
// impact halo reads differently. Kept at ~2x the halo radius so the halo
// (windspeed-derived, windspeed caps below) is what renders.
function extentFor(kmh) {
  if (kmh >= 220) return 500;
  if (kmh >= 185) return 360;
  if (kmh >= 118) return 300;
  if (kmh >= 88) return 240;
  if (kmh >= 63) return 180;
  if (kmh >= 34) return 130;
  return 100;
}

// The sample typhoon pool contains a single storm: TINO, a fictional name used
// for the demo; the track itself is modeled on the real Super Typhoon PEPITO
// (MAN-YI) from the 8 AM 17 Nov 2024 TCB stage: center over the sea east of
// Quezon, having just made its first landfall at Catanduanes (peak 195 km/h),
// about to make its second landfall in Aurora, then to weaken across Sierra
// Madre / Central Luzon and exit into the West Philippine Sea.
export const SAMPLE_TYPHOONS = [
  makeStorm({
    eventId: "tino-tcb17",
    name: "TINO",
    internationalName: "MAN-YI",
    category: "Super Typhoon",
    current: { lon: 122.55, lat: 14.55, windspeed: 185, gust: 230, pressure: 940, status: "Super Typhoon" },
    pastCoords: [
      [124.15, 13.85, 195],
      [123.45, 14.15, 190],
      [122.95, 14.4, 187],
    ],
    forecastCoords: [
      [121.95, 15.6, 175, "Aurora landfall"],
      [121.2, 16.35, 150, "Quirino / Nueva Vizcaya"],
      [119.8, 17.3, 135, "West Philippine Sea"],
    ],
    movement: { direction: "WNW", directionName: "West northwestward", speed: 25, text: "West northwestward at 25 km/h" },
  }),
];

/**
 * Wrap the sample storms in the same envelope getTyphoons() returns, flagged
 * `sample: true` so callers can distinguish it from live PAGASA data.
 */
export function buildSampleTyphoons() {
  return {
    active: SAMPLE_TYPHOONS.length > 0,
    unavailable: false,
    generatedAt: new Date().toISOString(),
    source: "PAGASA",
    typhoons: SAMPLE_TYPHOONS,
    rawCount: SAMPLE_TYPHOONS.length,
    sample: true,
  };
}
