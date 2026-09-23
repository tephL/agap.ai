// Pure helpers for the PAGASA Tropical Cyclone Bulletin typhoon model: parsing
// the bulletin's extracted text into a normalized typhoon and building the
// MapLibre overlay GeoJSON (track line, markers). Node-testable (no RN imports).
//
// Input text comes from src/lib/pagasaPdf/extractText.js and looks like the
// PAGASA 2-page bulletin structure (see scripts/test-fixtures/pagasa/TCB3_pilandok.txt),
// e.g.:
//   TROPICAL CYCLONE BULLETIN NR. 3
//   Tropical Depression PILANDOK
//   Issued at 11:00 PM, 30 August 2026
//   Location of Center (10:00 PM)
//   ... (20.7N, 132.5E)
//   Intensity
//   Maximum sustained winds of 45 km/h near the center ...
//   Present Movement
//   West northwestward at 10 km/h
//   TRACK AND INTENSITY FORECAST
//   12-Hour Forecast
//   8:00 AM 21.3 131.6 1,015 km East of Extreme Northern Luzon 55 TD WNW 10
//   31 August 2026
//   ...
//   TROPICAL CYCLONE WIND SIGNALS (TCWS) IN EFFECT
//   No Wind Signal is currently hoisted

export const INTENSITY_COLORS = {
  superTyphoon: "#9b1c31",
  severeTyphoon: "#b91c1c",
  typhoon: "#e11d48",
  severeStorm: "#f97316",
  tropicalStorm: "#f59e0b",
  depression: "#60a5fa",
  unknown: "#9aa2b1",
};

// PAGASA-used intensity categories -> compact styling key.
export function statusKey(status) {
  if (!status) return "unknown";
  const lower = String(status).toLowerCase();
  if (lower.includes("super typhoon")) return "superTyphoon";
  if (lower.includes("severe typhoon")) return "severeTyphoon";
  if (lower.includes("typhoon") || lower.includes("hurricane")) return "typhoon";
  if (lower.includes("severe tropical storm")) return "severeStorm";
  if (lower.includes("tropical storm")) return "tropicalStorm";
  if (lower.includes("tropical depression")) return "depression";
  return "unknown";
}

const STATUS_KEYS = {
  TD: "depression",
  TS: "tropicalStorm",
  STS: "severeStorm",
  TY: "typhoon",
  STY: "severeTyphoon",
  "Low": "unknown",
  LOW: "unknown",
};

// PAGASA reports windspeed in km/h; fall back to thresholds when only MSW is
// known or the category token maps to an intensity.
export function statusKeyFromWindspeed(kmh) {
  if (kmh == null) return "unknown";
  if (kmh >= 220) return "superTyphoon";
  if (kmh >= 185) return "severeTyphoon";
  if (kmh >= 118) return "typhoon";
  if (kmh >= 88) return "severeStorm";
  if (kmh >= 63) return "tropicalStorm";
  if (kmh >= 34) return "depression";
  return "unknown";
}

function toNum(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Parse a PAGASA date/time pair like ("31 August 2026", "8:00 AM") to ms UTC.
function parseBulletinDateTime(dateText, timeText) {
  if (!dateText) return null;
  const dm = String(dateText).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const monthIdx = MONTHS.indexOf(String(dm[2]).toLowerCase());
  const year = Number(dm[3]);
  if (monthIdx === -1) return null;
  let hour = 0;
  let minute = 0;
  if (timeText) {
    const tm = String(timeText).trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (tm) {
      let h = Number(tm[1]) % 12;
      if (/pm/i.test(tm[3])) h += 12;
      hour = h;
      minute = Number(tm[2]);
    }
  }
  const t = new Date(Date.UTC(year, monthIdx, day, hour, minute, 0));
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

// Normalize a compass/wind-direction name ("West northwestward") to an
// abbreviation ("WNW") when possible, else the raw text.
function directionAbbrev(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase().replace(/\s+/g, "");
  const map = {
    north: "N", northeast: "NE", east: "E", southeast: "SE",
    south: "S", southwest: "SW", west: "W", northwest: "NW",
  };
  // Direct cardinal names ("north", "northwest", ...).
  if (map[n]) return map[n];
  // Strip a trailing "-ward(s)" suffix ("westward", "northwestward").
  const base = n.replace(/ward[^a-z]*$/, "").replace(/wards?$/, "");
  if (map[base]) return map[base];
  // Split a cardinal compound like "westnorthwest" into abbreviation pieces.
  const cardAbbrev = {
    northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW",
    north: "N", east: "E", south: "S", west: "W",
  };
  const cards = ["northeast", "northwest", "southeast", "southwest", "north", "east", "south", "west"];
  if (/^(north|south|east|west)/.test(base)) {
    const out = [];
    let rest = base;
    let guard = 0;
    while (rest.length > 0 && guard++ < 8) {
      let matched = false;
      for (const card of cards) {
        if (rest.startsWith(card)) {
          out.push(cardAbbrev[card]);
          rest = rest.slice(card.length);
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }
    if (rest.length === 0 && out.length) return out.join("");
  }
  return String(name).trim();
}

function parseCenterAndName(lines) {
  // Find "Tropical Depression PILANDOK" or "Typhoon INDAY (BAVI)" style
  // header lines (the parenthesized alias is the international name).
  let name = null;
  let category = null;
  let intlName = null;
  for (const line of lines) {
    const m = String(line)
      .trim()
      .match(
        /^(Tropical Depression|Tropical Storm|Severe Tropical Storm|Typhoon|Severe Typhoon|Super Typhoon)\s+([A-Z][A-Z\s]+?)(?:\s*\(([A-Z]+)\))?\s*$/i
      );
    if (m) {
      category = m[1].replace(/\b\w/g, (c) => c.toUpperCase());
      name = m[2].trim().replace(/\s+/g, " ");
      intlName = m[3] ?? null;
      break;
    }
  }
  return { name, category, intlName };
}

/**
 * Parse the extracted PAGASA bulletin text into a normalized typhoon model
 * compatible with the hazards UI (current, past, forecast, pastLine,
 * forecastLine, bbox, name, eventId ...) plus PAGASA-specific fields.
 * @param {string} text extracted bulletin text (both pages)
 * @returns {object|null}
 */
export function parsePagasaBulletinText(text) {
  if (!text || typeof text !== "string") return null;
  const lines = String(text)
    .split(/\r?\n|\f/)
    .map((l) => l.trim())
    .filter(Boolean);

  const joined = lines.join("\n");

  // --- Bulletin number ---
  const nrMatch = /\bBULLETIN\s+NR\.?\s*(\d+)/i.exec(joined);
  const bulletinNumber = nrMatch ? Number(nrMatch[1]) : null;

  // A bulletin for a tropical cyclone that has weakened into a low pressure
  // area ("Low Pressure Area (formerly X)") is not an active cyclone — drop it.
  if (/Low\s+Pressure\s+Area\b/i.test(joined) && !/Maximum\s+sustained\s+winds\s+of/i.test(joined)) {
    return null;
  }

  const { name, category, intlName } = parseCenterAndName(lines);

  // --- Issued at ---
  const issuedMatch = /\bIssued at\s+(.+)\.?\s*\n?Valid/i.exec(joined) ||
    /\bIssued at\s+([^\n]+)/i.exec(joined);
  let issuedAtText = null;
  let issuedAtMs = null;
  if (issuedMatch) {
    issuedAtText = issuedMatch[1].trim().replace(/\.$/, "");
    const tm = /\b(\d{1,2}:\d{2}\s*[AP]M),\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(issuedAtText);
    if (tm) issuedAtMs = parseBulletinDateTime(tm[2], tm[1]);
  }

  // --- Location of Center -> lat/lon ---
  let centerLat = null;
  let centerLon = null;
  const centerMatch = /\(([\d.]+)°([NS]),\s*([\d.]+)°([EW])\)/.exec(joined);
  if (centerMatch) {
    const lat = Number(centerMatch[1]);
    const lon = Number(centerMatch[3]);
    centerLat = centerMatch[2] === "S" ? -lat : lat;
    centerLon = centerMatch[4] === "W" ? -lon : lon;
  }

  // --- Intensity: windspeed / gust / pressure ---
  // Bulletin prose wraps across lines, so allow runs of whitespace between
  // significant tokens (a bare space would break on the wrapped PDF text).
  const windMatch = /Maximum\s+sustained\s+winds\s+of\s+([\d,]+)\s*km\/h\s+near\s+the\s+center,\s*gustiness\s+of\s+up\s+to\s+([\d,]+)\s*km\/h(?:\s*,\s*and\s+central\s+pressure\s+of\s+([\d,]+)\s*hPa)?/i.exec(joined);
  const windspeed = windMatch ? toNum(windMatch[1]) : null;
  const gust = windMatch ? toNum(windMatch[2]) : null;
  const pressure = windMatch ? toNum(windMatch[3]) : null;

  // --- Present Movement ---
  let movement = null;
  const moveMatch = /\bPresent\s+Movement\b[:\s]*([^\n]+)/i.exec(joined);
  if (moveMatch) {
    const txt = moveMatch[1].trim().replace(/\.$/, "");
    const sm = txt.match(/^(.+?)\s+at\s+([\d,]+)\s*km\/h$/i);
    if (sm) {
      movement = {
        direction: directionAbbrev(sm[1]),
        directionName: sm[1].trim(),
        speed: toNum(sm[2]),
        text: txt,
      };
    } else {
      movement = { direction: directionAbbrev(txt), directionName: txt, speed: null, text: txt };
    }
  }

  // --- Extent of tropical cyclone winds ---
  const extentMatch = /Strong\s+winds\s+extend\s+outwards\s+up\s+to\s+([\d,]+)\s*km/i.exec(joined);
  const extentKm = extentMatch ? toNum(extentMatch[1]) : null;

  // --- Wind signals ---
  let signals = [];
  let signalsSummary = null;
  const noSignal = /No Wind Signal is currently hoisted/i.test(joined);
  if (noSignal) {
    signalsSummary = "No Wind Signal is currently hoisted";
  } else {
    signalsSummary = "Wind signals in effect (see bulletin)";
  }

  // --- Forecast table ---
  // Real bulletins render the forecast rows in either of two shapes:
  //   [label] / [time lat lon location msw cat dir speed] / [date]
  // or:
  //   [label] / [location] / [time lat lon fragment... msw cat dir speed] / [date]
  // We locate every "<N>-Hour Forecast" label, then scan the following lines
  // for the numeric row that carries time + lat + lon, reusing the preceding
  // line as the location when the row does not already describe it.
  const forecast = [];
  const tableStart = lines.findIndex((l) => l.includes("TRACK AND INTENSITY FORECAST"));
  if (tableStart !== -1) {
    // A forecast row starts with time + lat + lon, then either an embedded
    // descriptive location fragment OR the intensity straight away, and always
    // ends with MSW/hour, category, cardinal direction, speed. The trailing
    // tokens anchor the parse regardless of whether a location is present.
    const rowRe = /^(\d{1,2}:\d{2}\s*[AP]M)\s+([\d.]+)\s+([\d.]+)\s+(.*?)(\d{1,3}|-)\s+([A-Z]{1,6})\s+([A-Z]{2,3})\s+(\d{1,3})\s*$/;
    const dateRe = /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/;
    for (let i = tableStart; i < lines.length; i++) {
      const labelMatch = /^(\d+)-Hour Forecast\b/.exec(lines[i]);
      if (!labelMatch) continue;
      const label = lines[i];
      const hours = Number(labelMatch[1]);
      let row = null;
      let rowIndex = -1;
      let location = null;
      for (let j = i + 1; j < lines.length; j++) {
        const m = rowRe.exec(lines[j]);
        if (m) {
          row = m;
          rowIndex = j;
          location = m[4].trim();
          break;
        }
      }
      if (!row) continue;
      // If the numeric row carries no (or a stub) location fragment, the
      // descriptive location sits on the line just above the numeric row.
      const prev = rowIndex - 1 >= 0 ? lines[rowIndex - 1] : null;
      if (prev && prev !== label && !/^\d{1,2}:\d{2}\s*[AP]M/.test(prev)) {
        const frag = row[4].trim();
        if (!frag || /^(or in the vicinity|in the vicinity)/i.test(frag)) {
          location = prev.trim();
        }
      }
      const timeText = row[1];
      const lat = Number(row[2]);
      const lon = Number(row[3]);
      const msw = row[5] === "-" ? null : toNum(row[5]);
      const cat = row[6].trim();
      const dir = row[7].trim();
      const speed = toNum(row[8]);
      // Date: the first date line after the numeric row.
      let dateText = null;
      for (let j = rowIndex + 1; j < lines.length; j++) {
        const dm = dateRe.exec(lines[j]);
        if (dm) {
          dateText = dm[1];
          break;
        }
      }
      const dateMs = parseBulletinDateTime(dateText, timeText);
      forecast.push({
        label,
        hours,
        timeText,
        dateText,
        date: dateMs,
        lon,
        lat,
        location,
        msw,
        category: cat,
        intensity: STATUS_KEYS[cat] ?? statusKeyFromWindspeed(msw),
        movement: { direction: dir, speed },
        isForecast: true,
      });
      i = rowIndex;
    }
  }

  const hasCore = name || (centerLat != null && centerLon != null) || forecast.length > 0;
  if (!hasCore) return null;

  // Normalize the common PAGASA status string for the position list.
  const categoryName = category ?? (windspeed != null ? statusNameFromKey(statusKeyFromWindspeed(windspeed)) : "Tropical cyclone");

  // Compatible fields for buildTrackGeojson / trackBounds / UI.
  const past = centerLat != null
    ? [{
        lon: centerLon,
        lat: centerLat,
        date: centerDate(issuedAtMs),
        windspeed,
        gust,
        pressure,
        status: categoryName,
        intensity: statusKey(categoryName),
        isForecast: false,
      }]
    : [];

  const forecastLine = [];
  if (centerLat != null && centerLon != null) forecastLine.push([centerLon, centerLat]);
  for (const f of forecast) forecastLine.push([f.lon, f.lat]);

  const bbox = boundingBox(
    past.map((p) => [p.lon, p.lat]).concat(forecast.map((f) => [f.lon, f.lat]))
  );

  const eventId = name ? `${(name || "").toLowerCase()}-tcb${bulletinNumber ?? ""}` : `pagasa-tcb${bulletinNumber ?? ""}`;

  return {
    eventId,
    name,
    internationalName: intlName,
    bulletinNumber,
    source: "PAGASA",
    category: categoryName,
    intensity: statusKey(categoryName),
    issuedAtText,
    issuedAt: issuedAtMs,
    movement,
    signals,
    signalsSummary,
    extentKm,
    current: {
      lon: centerLon,
      lat: centerLat,
      windspeed,
      gust,
      pressure,
      status: categoryName,
      intensity: statusKey(categoryName),
      date: issuedAtMs,
    },
    overallWindspeed: windspeed,
    overallStormstatus: categoryName,
    past,
    forecast,
    pastLine: [],
    forecastLine,
    bbox,
  };
}

function centerDate(issuedAtMs) {
  return issuedAtMs ?? null;
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

export function boundingBox(coords) {
  let b = null;
  for (const [x, y] of coords) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
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

// ---------------------------------------------------------------------------
// PAGASA-style forecast cone + impact-halo geometry (pure, dependency-free)
// ---------------------------------------------------------------------------

// NHC / PAGASA 2/3-probability circle radii by forecast hour (km), used to
// draw the widening "cone of uncertainty" along the track.
const CONE_RADIUS_KM = [
  [0, 10],
  [12, 45],
  [24, 70],
  [36, 90],
  [48, 115],
  [60, 125],
  [72, 140],
  [96, 160],
  [120, 180],
];

function coneRadiusForHours(hours) {
  if (hours == null || hours <= 0) return CONE_RADIUS_KM[0][1];
  for (let i = 0; i < CONE_RADIUS_KM.length - 1; i++) {
    const [h0, r0] = CONE_RADIUS_KM[i];
    const [h1, r1] = CONE_RADIUS_KM[i + 1];
    if (hours >= h0 && hours <= h1) {
      const t = (hours - h0) / (h1 - h0);
      return r0 + t * (r1 - r0);
    }
  }
  return CONE_RADIUS_KM[CONE_RADIUS_KM.length - 1][1];
}

// Approximate impact-halo radius (km) around the current storm center (a storm
// -size disc, NOT a disc per track point).  Size varies with intensity, capped
// by the bulletin's extentKm when a smaller value is available.
export function haloRadiusFor(typhoon) {
  const wind = typhoon.current?.windspeed ?? typhoon.overallWindspeed ?? 0;
  const byWind =
    wind >= 220 ? 200 :
    wind >= 185 ? 170 :
    wind >= 118 ? 140 :
    wind >= 88  ? 110 :
    wind >= 63  ? 85  :
                  60;
  const extent = typhoon.extentKm != null ? typhoon.extentKm / 2 : Infinity;
  return Math.max(25, Math.min(byWind, extent));
}

// PAGASA-style marker letter for a given intensity / status token.
//   STY = Super Typhoon, TY = Severe Typhoon, T = Typhoon,
//   STS = Severe Tropical Storm, S = Tropical Storm, D = Tropical Depression,
//   L = Low Pressure Area.
export function categoryMarker(typhoon, point) {
  const status = String(point?.status ?? typhoon?.category ?? "").toLowerCase();
  if (status.includes("low pressure")) return "L";
  if (status.includes("super typhoon")) return "STY";
  if (status.includes("severe typhoon")) return "TY";
  if (status.includes("hurricane")) return "TY";
  if (status.includes("typhoon")) return "T";
  if (status.includes("severe tropical storm")) return "STS";
  if (status.includes("tropical storm")) return "S";
  if (status.includes("tropical depression")) return "D";
  // Fall back to windspeed thresholds (PAGASA km/h).
  const kmh = point?.windspeed ?? point?.msw ?? typhoon?.current?.windspeed ?? typhoon?.overallWindspeed ?? 0;
  if (kmh >= 220) return "STY";
  if (kmh >= 185) return "TY";
  if (kmh >= 118) return "T";
  if (kmh >= 88) return "STS";
  if (kmh >= 63) return "S";
  if (kmh >= 34) return "D";
  return "L";
}

// Bearing (degrees clockwise from north) from point A to point B.
function bearingDeg(lonA, latA, lonB, latB) {
  const φ1 = latA * Math.PI / 180;
  const φ2 = latB * Math.PI / 180;
  const Δλ = (lonB - lonA) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Destination point from (lon, lat) along bearing for km distance.
// Equirectangular approximation — accurate enough for < 200 km offsets.
function bufferPoint(lon, lat, bearing, km) {
  const R = 111.0; // km per degree
  const θ = bearing * Math.PI / 180;
  const φ = lat * Math.PI / 180;
  const cosLat = Math.cos(Math.abs(φ) > 0.001 ? φ : 0.001);
  const dLat = (km / R) * Math.cos(θ);
  const dLon = (km / (R * cosLat)) * Math.sin(θ);
  return [lon + dLon, lat + dLat];
}

// Build a roughly-circular polygon disc around a center point.
function buildHaloDisc(lon, lat, radiusKm, vertices) {
  vertices = vertices ?? 24;
  const coords = [];
  for (let i = 0; i <= vertices; i++) {
    const angle = (i / vertices) * 360;
    coords.push(bufferPoint(lon, lat, angle, radiusKm));
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

// Extract the outer ring of a halo disc polygon as a closed coordinate array
// suitable for a LineString (first and last vertex are identical).
function haloRingFromDisc(disc) {
  return disc?.coordinates?.[0] ?? null;
}

// Build a cone-of-uncertainty polygon from an ordered array of
// [lon, lat, hours] points.  Widens with forecast-hour radius unless a
// per-node `radii` array (half-width km) is supplied (used for the past-then-
// forecast funnel so the cone tapers from the first point instead of hugging
// the past segment as a flat spindle).
function buildConePolygon(track, radii) {
  if (!track || track.length < 2) return null;
  const left = [];
  const right = [];
  for (let i = 0; i < track.length; i++) {
    const [lon, lat, hrs] = track[i];
    const r = radii && radii[i] != null ? radii[i] : coneRadiusForHours(hrs);
    let norm;
    if (i === 0) {
      norm = bearingDeg(lon, lat, track[1][0], track[1][1]);
    } else if (i === track.length - 1) {
      norm = bearingDeg(track[i - 1][0], track[i - 1][1], lon, lat);
    } else {
      const bIn  = bearingDeg(track[i - 1][0], track[i - 1][1], lon, lat);
      const bOut = bearingDeg(lon, lat, track[i + 1][0], track[i + 1][1]);
      norm = Math.abs(bIn - bOut) > 180
        ? (bIn + bOut) / 2 + 180
        : (bIn + bOut) / 2;
    }
    left.push(bufferPoint(lon, lat, norm + 90, r));
    right.push(bufferPoint(lon, lat, norm - 90, r));
  }
  // Rounded cap at the far end: instead of the last node collapsing to a flat
  // perpendicular edge, sweep a semicircular arc of radius `r` from the left
  // edge bearing forward through the travel direction (norm) to the right
  // edge. This makes the cone's far end a smooth circular (semicircular) cap.
  const cap = [];
  if (track.length >= 2) {
    const [lon, lat] = track[track.length - 1];
    const r = radii && radii[radii.length - 1] != null ? radii[radii.length - 1] : coneRadiusForHours(track[track.length - 1][2] ?? null);
    const norm = bearingDeg(track[track.length - 2][0], track[track.length - 2][1], lon, lat);
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const off = 90 - (i / steps) * 180; // from +90 (left) to -90 (right)
      cap.push(bufferPoint(lon, lat, norm + off, r));
    }
  }
  const ring = [...left, ...cap, ...right.reverse(), left[0]];
  return { type: "Polygon", coordinates: [ring] };
}

/**
 * Build the overlay FeatureCollection for one typhoon. LineString features
 * carry `segment` ("past"|"forecast"); Point markers carry `intensity`,
 * `dateMs`, `windspeed`, `category`/`msw`/`movement` for PAGASA sources.
 *
 * PAGASA-style additions:
 *   - kind:"cone" Polygon — uncertainty envelope along the forecast track
 *   - kind:"halo" Polygon — a single storm-size impact disc at the current
 *     center (size varies with intensity; no per-point overlapping discs)
 *   - kind:"eye" Point — the red cyclone-eye at the current center
 *   - "marker" on each Point — PAGASA category letter (STY/TY/T/STS/S/D/L)
 *   - "label" property on forecast points (e.g. "24H") for hour labels
 *   - "haloRadius" / "center" properties for data-driven sizing/rendering
 */
export function buildTrackGeojson(typhoon) {
  if (!typhoon) return { type: "FeatureCollection", features: [] };
  const features = [];
  const id = typhoon.eventId ?? "tc";
  const name = typhoon.name ?? "Typhoon";

  const past = typhoon.past ?? [];
  const forecast = typhoon.forecast ?? [];
  const current = typhoon.current;
  const centerLon = current?.lon != null ? current.lon : null;
  const centerLat = current?.lat != null ? current.lat : null;

  // --- Impact halo at the current center (rendered first) ---
  // Kept as a disc polygon (for bounds/legacy) plus a closed LineString ring
  // (`haloRing`) that the map renders as an outlined boundary (transparent
  // fill, intensity-colored stroke) so it reads as a storm-size ring without
  // muddying the cone fill underneath.
  if (centerLon != null && centerLat != null) {
    const r = haloRadiusFor(typhoon);
    const disc = buildHaloDisc(centerLon, centerLat, r);
    const intensity = current.intensity ?? statusKey(current.status ?? typhoon.category) ??
      statusKeyFromWindspeed(current.windspeed);
    features.push({
      type: "Feature",
      id: `${id}-halo`,
      geometry: disc,
      properties: { kind: "halo", name, eventId: id, intensity, role: "current" },
    });
    const ring = haloRingFromDisc(disc);
    if (ring) {
      features.push({
        type: "Feature",
        id: `${id}-halo-ring`,
        geometry: { type: "LineString", coordinates: ring },
        properties: { kind: "haloRing", name, eventId: id, intensity, role: "current" },
      });
    }
  }

  // --- Uncertainty cone: a widening funnel from the first past point ---
  // Radius ramps from a narrow opening at the oldest past position, widening
  // continuously through the current center and into the real forecast-hour
  // radii, so the envelope fans out like a cone instead of hugging the past
  // segment as a flat spindle.
  const coneNodes = [];
  const coneRadii = [];
  for (const p of past) {
    if (p.lon != null && p.lat != null) coneNodes.push([p.lon, p.lat]);
  }
  if (centerLon != null && centerLat != null) coneNodes.push([centerLon, centerLat]);
  const firstForecastRadius = forecast.length
    ? coneRadiusForHours(forecast[0].hours ?? null)
    : coneRadiusForHours(48);
  const startRadius = 20;
  for (let i = 0; i < coneNodes.length; i++) {
    const t = coneNodes.length > 1 ? i / (coneNodes.length - 1) : 0;
    coneRadii.push(startRadius + (firstForecastRadius - startRadius) * t);
  }
  for (const f of forecast) {
    if (f.lon != null && f.lat != null) {
      coneNodes.push([f.lon, f.lat]);
      coneRadii.push(coneRadiusForHours(f.hours ?? null));
    }
  }
  if (coneNodes.length >= 2 && coneNodes[0][0] != null) {
    const cone = buildConePolygon(coneNodes, coneRadii);
    if (cone) {
      features.push({
        type: "Feature",
        id: `${id}-cone`,
        geometry: cone,
        properties: { kind: "cone", name, eventId: id },
      });
    }
  }

  // --- Track lines (solid past, dashed forecast) ---
  if (typhoon.pastLine && typhoon.pastLine.length >= 2) {
    features.push({
      type: "Feature",
      id: `${id}-past`,
      geometry: { type: "LineString", coordinates: typhoon.pastLine },
      properties: { segment: "past", name },
    });
  }
  if (typhoon.forecastLine && typhoon.forecastLine.length >= 2) {
    features.push({
      type: "Feature",
      id: `${id}-forecast`,
      geometry: { type: "LineString", coordinates: typhoon.forecastLine },
      properties: { segment: "forecast", name },
    });
  }

  // --- Cyclone-eye at the current center ---
  // A small red halo (transparent fill via `kind:"eye"` polygon, dashed outline
  // via `kind:"eyeRing"` LineString) representing the eye zone, plus a tiny
  // center dot (`kind:"eyeDot"` Point). The eye disc is a small version of the
  // impact-halo language so it reads as a nested "eye impact ring."
  if (centerLon != null && centerLat != null) {
    const eyeR = 40;
    const eyeDisc = buildHaloDisc(centerLon, centerLat, eyeR);
    features.push({
      type: "Feature",
      id: `${id}-eye`,
      geometry: eyeDisc,
      properties: { kind: "eye", name, eventId: id },
    });
    const eyeRing = haloRingFromDisc(eyeDisc);
    if (eyeRing) {
      features.push({
        type: "Feature",
        id: `${id}-eye-ring`,
        geometry: { type: "LineString", coordinates: eyeRing },
        properties: { kind: "eyeRing", name, eventId: id },
      });
    }
    features.push({
      type: "Feature",
      id: `${id}-eye-dot`,
      geometry: { type: "Point", coordinates: [centerLon, centerLat] },
      properties: { kind: "eyeDot", name, eventId: id },
    });
  }

  // --- Point markers (category letters) + forecast-hour labels ---
  for (const p of [...past, ...forecast]) {
    if (p.lon == null || p.lat == null) continue;
    const byStatus = statusKey(p.status ?? p.category);
    const key =
      p.intensity ??
      (byStatus !== "unknown" ? byStatus : statusKeyFromWindspeed(p.windspeed ?? p.msw));
    const forecastIdx = p.isForecast ? forecast.indexOf(p) : -1;
    const hours = p.isForecast
      ? (p.hours ?? (forecastIdx >= 0 ? (forecastIdx + 1) * 12 : null))
      : null;
    features.push({
      type: "Feature",
      id: `${id}-pt-${p.date ?? features.length}-${features.length}`,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        name,
        eventId: id,
        segment: p.isForecast ? "forecast" : "past",
        intensity: key,
        dateMs: p.date ?? null,
        windspeed: p.windspeed ?? p.msw ?? null,
        status: p.status ?? p.category ?? null,
        category: p.category ?? null,
        msw: p.msw ?? null,
        movement: p.movement ?? typhoon.movement ?? null,
        movementText:
          p.movement != null
            ? `${p.movement.direction ?? ""} ${p.movement.speed != null ? p.movement.speed : ""}`.trim()
            : null,
        marker: categoryMarker(typhoon, p),
        label: hours != null ? `${hours}H` : null,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

// Convenience geometry bounds across multiple typhoons' track features.
export function trackBounds(typhoons) {
  const coords = [];
  for (const t of typhoons ?? []) {
    if (t?.bbox) {
      const [w, s, e, n] = t.bbox;
      coords.push([w, s], [e, n]);
    }
  }
  return boundingBox(coords);
}

// Expanded fit bounds for a single typhoon so the camera shows the entire
// track AND its cone/halo extents (not just the center-line bbox). The cone
// widens along the track; the halo is a disc around the current center.
export function trackFitBounds(typhoon) {
  const halo = haloRadiusFor(typhoon);
  const track = [
    ...(typhoon.pastLine ?? []),
    ...(typhoon.forecastLine ?? []),
  ];
  if (typhoon.current?.lon != null && typhoon.current?.lat != null) {
    track.push([typhoon.current.lon, typhoon.current.lat]);
  }
  if (track.length === 0) return null;

  // Max cone radius across the forecast horizon (widens with hours).
  const forecast = typhoon.forecast ?? [];
  let maxCone = CONE_RADIUS_KM[0][1];
  for (const f of forecast) {
    maxCone = Math.max(maxCone, coneRadiusForHours(f.hours ?? null));
  }
  const extraKm = Math.max(halo, maxCone);

  const centerLat = track[0][1];
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos(Math.abs(centerLat) * Math.PI / 180);
  const dLat = extraKm / kmPerLat;
  const dLon = extraKm / kmPerLon;

  let b = null;
  for (const [lon, lat] of track) {
    const x0 = lon - dLon, y0 = lat - dLat, x1 = lon + dLon, y1 = lat + dLat;
    if (b == null) b = [x0, y0, x1, y1];
    else {
      if (x0 < b[0]) b[0] = x0;
      if (y0 < b[1]) b[1] = y0;
      if (x1 > b[2]) b[2] = x1;
      if (y1 > b[3]) b[3] = y1;
    }
  }
  return b;
}
