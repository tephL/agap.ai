import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../src");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydro-test-"));

const FILES = [
  "utils/haversine.js",
  "data/hydrology.js",
  "components/hazards/damInfluence.js",
];

// Copy files first
for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  const dest = path.join(dir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Rewrite all relative imports to point at temp copies
for (const rel of FILES) {
  const dest = path.join(dir, rel);
  let code = fs.readFileSync(dest, "utf8");
  code = code.replace(
    /from\s+["'](\.\.?\/[^"']+)["']/g,
    (_, spec) => {
      const resolved = path.resolve(path.dirname(dest), spec);
      const abs = resolved.endsWith(".js") ? resolved : resolved + ".js";
      return `from ${JSON.stringify(pathToFileURL(abs).href)}`;
    }
  );
  fs.writeFileSync(dest, code);
}

const { getInfluencingDams } = await import(pathToFileURL(path.join(dir, "components/hazards/damInfluence.js")).href);
const { haversineMeters } = await import(pathToFileURL(path.join(dir, "utils/haversine.js")).href);

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.log(`FAIL  ${label}`); }
}

// San Rafael coordinates
const SR = { latitude: 14.8527, longitude: 120.9483 };
// Malolos (downstream Angat corridor)
const MALOLOS = { latitude: 14.8433, longitude: 120.8106 };
// Candaba (Pampanga corridor)
const CANDABA = { latitude: 14.9833, longitude: 120.6333 };
// Benguet (far north, nearest-only fallback)
const BENGUET = { latitude: 16.4, longitude: 120.6 };

const DAMS = [
  { slug: "angat", name: "Angat", coordinates: { lat: 14.9225, lng: 121.1264 }, nhwl: 210, normalHighWaterLevel: 210, reservoirWaterLevel: 191.77, deviationFromNHWL: -18.23 },
  { slug: "ipo", name: "Ipo", coordinates: { lat: 14.8783, lng: 121.0967 }, nhwl: 101, normalHighWaterLevel: 101, reservoirWaterLevel: 98, deviationFromNHWL: -3 },
  { slug: "la-mesa", name: "La Mesa", coordinates: { lat: 14.7333, lng: 121.0833 }, nhwl: 80.15, normalHighWaterLevel: 80.15, reservoirWaterLevel: 79.5, deviationFromNHWL: -0.65 },
  { slug: "pantabangan", name: "Pantabangan", coordinates: { lat: 15.8267, lng: 121.0467 }, nhwl: 232, normalHighWaterLevel: 232, reservoirWaterLevel: 210, deviationFromNHWL: -22 },
  { slug: "binga", name: "Binga", coordinates: { lat: 16.0667, lng: 120.9833 }, nhwl: 275, normalHighWaterLevel: 275, reservoirWaterLevel: 270, deviationFromNHWL: -5 },
  { slug: "san-roque", name: "San Roque", coordinates: { lat: 16.0833, lng: 120.7 }, nhwl: 290, normalHighWaterLevel: 290, reservoirWaterLevel: 285, deviationFromNHWL: -5 },
  { slug: "caliraya", name: "Caliraya", coordinates: { lat: 14.3, lng: 121.5 }, nhwl: 292, normalHighWaterLevel: 292, reservoirWaterLevel: 290, deviationFromNHWL: -2 },
  { slug: "magat", name: "Magat", coordinates: { lat: 16.75, lng: 121.5 }, nhwl: 385, normalHighWaterLevel: 385, reservoirWaterLevel: 380, deviationFromNHWL: -5 },
];
// Deduplicate
const seen = new Set();
const dams = DAMS.filter(d => { if (seen.has(d.slug)) return false; seen.add(d.slug); return true; });

const SRResult = getInfluencingDams(dams, SR, {});
check("San Rafael -> exactly [ipo, angat] (nearest first)", SRResult.map(e => e.dam.slug).join(",") === "ipo,angat", SRResult.map(e => e.dam.slug));
check("San Rafael angat tier Severe", SRResult.find(e => e.dam.slug === "angat")?.impact?.key === "severe", SRResult.find(e => e.dam.slug === "angat")?.impact?.key);
check("San Rafael ipo flagged minor", SRResult.find(e => e.dam.slug === "ipo")?.minor === true, SRResult.find(e => e.dam.slug === "ipo")?.minor);

const MALResult = getInfluencingDams(dams, MALOLOS, {});
check("Malolos -> includes angat+ipo (ipo nearest)", MALResult.map(e => e.dam.slug).join(",") === "ipo,angat", MALResult.map(e => e.dam.slug));
check("Malolos angat tier High risk", MALResult.find(e => e.dam.slug === "angat")?.impact?.key === "high", MALResult.find(e => e.dam.slug === "angat")?.impact?.key);

const CANResult = getInfluencingDams(dams, CANDABA, {});
check("Candaba -> [pantabangan]", CANResult.map(e => e.dam.slug).join(",") === "pantabangan", CANResult.map(e => e.dam.slug));

const BENResult = getInfluencingDams(dams, BENGUET, {});
check("Benguet fallback -> [san-roque] (nearest dam)", BENResult.length === 1 && BENResult[0].dam.slug === "san-roque", BENResult.map(e => e.dam.slug));
check("Fallback marked nearestFallback", BENResult[0]?.nearestFallback === true, BENResult[0]?.nearestFallback);

// Above-crest exclusion
const highUser = { latitude: 14.92, longitude: 121.13 };
const HIGHResult = getInfluencingDams(dams, highUser, { userElevation: 225 });
check("Above-crest user -> [] (0 entries)", HIGHResult.length === 0, HIGHResult.length);

// Above-NHWL downgrade
const nearNHWLUser = { latitude: 14.921, longitude: 121.125 };
const NHWLResult = getInfluencingDams(dams, nearNHWLUser, { userElevation: 211 });
check("Above-NHWL user downgraded to Severe (from catastrophic)", NHWLResult.find(e => e.dam.slug === "angat")?.impact?.key === "severe", NHWLResult.find(e => e.dam.slug === "angat")?.impact?.key);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

fs.rmSync(dir, { recursive: true, force: true });
