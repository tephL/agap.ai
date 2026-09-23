// Ad-hoc regression harness for the PAGASA typhoon parser + geojson builder.
// Uses only node:assert (no test framework dependency).
// Run: node scripts/test-typhoon-parse.cjs
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert");

const { parsePagasaBulletinText, buildTrackGeojson, trackBounds, trackFitBounds } = require("../src/lib/typhoonTracks/trackJson.js");

const fixture = readFileSync(join(__dirname, "test-fixtures", "pagasa", "TCB3_pilandok.txt"), "utf8");
const m = parsePagasaBulletinText(fixture);

assert.ok(m, "should parse pilandok fixture");
assert.strictEqual(m.name, "PILANDOK");
assert.strictEqual(m.category, "Tropical Depression");
assert.strictEqual(m.bulletinNumber, 3);
assert.strictEqual(m.current.lat, 20.7);
assert.strictEqual(m.current.lon, 132.5);
assert.strictEqual(m.current.windspeed, 45);
assert.strictEqual(m.current.gust, 55);
assert.strictEqual(m.current.pressure, 1002);
assert.deepStrictEqual(m.movement, {
  direction: "WNW",
  directionName: "West northwestward",
  speed: 10,
  text: "West northwestward at 10 km/h",
});
assert.strictEqual(m.extentKm, 420);
assert.strictEqual(m.signalsSummary, "No Wind Signal is currently hoisted");
assert.strictEqual(m.forecast.length, 3);
assert.deepStrictEqual(
  m.forecast.map((f) => [f.hours, f.lat, f.lon]),
  [
    [12, 21.3, 131.6],
    [24, 22.2, 130.5],
    [36, 23.8, 129.2],
  ]
);
assert.deepStrictEqual(m.forecastLine, [
  [132.5, 20.7],
  [131.6, 21.3],
  [130.5, 22.2],
  [129.2, 23.8],
]);
assert.deepStrictEqual(m.bbox, [129.2, 20.7, 132.5, 23.8]);

const gj = buildTrackGeojson(m);
assert.ok(Array.isArray(gj.features) && gj.features.length > 0, "geojson should have features");
// PAGASA-style cone + single impact halo + red eye + category glyphs all present.
const kinds = gj.features.map((f) => f.properties?.kind).filter(Boolean);
assert.ok(kinds.includes("cone"), "should emit a cone of uncertainty");
assert.strictEqual(
  kinds.filter((k) => k === "halo").length,
  1,
  "should emit exactly one impact halo (single storm-size disc at current center)"
);
assert.strictEqual(
  kinds.filter((k) => k === "eye").length,
  1,
  "should emit one red eye at the current center"
);
const cone = gj.features.find((f) => f.properties?.kind === "cone");
const coneRing = cone?.geometry?.coordinates?.[0] ?? [];
assert.ok(
  coneRing.length >= 4 &&
    coneRing[0][0] === coneRing[coneRing.length - 1][0] &&
    coneRing[0][1] === coneRing[coneRing.length - 1][1],
  "cone polygon ring should be closed"
);
assert.ok(
  gj.features.some((f) => f.geometry?.type === "LineString" && f.properties?.segment === "forecast"),
  "should emit a forecast track line"
);
// The cone must fan out like a funnel from the starting point: end width (the
// semicircular cap diameter at the forecast tip) must exceed the start width
// (the perpendicular edge at the oldest past point).
{
  const cring = cone.geometry.coordinates[0];
  const cn = cring.length;
  const distKm = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111;
  const n = [...(m.past || []).filter((p) => p.lon != null), m.current, ...m.forecast]
    .filter((p) => p.lon != null).length;
  const capLen = cn - 1 - 2 * n;
  assert.ok(capLen > 0, "cone far end should include a rounded semicircular cap");
  // startW: distance between the left/right edge points at the first node.
  const startW = distKm(cring[0], cring[cn - 2]);
  // endW: distance between the two cap end vertices (the left/right edge at
  // the final forecast node). cring[n-1] is the last left-side point before the
  // cap and cring[n + capLen] is the first left-of-center point after it.
  const endW = distKm(cring[n - 1], cring[n + capLen]);
  assert.ok(endW > startW, "cone should widen (funnel) from first point to forecast tip");
}
const markers = gj.features.filter((f) => f.geometry?.type === "Point" && f.properties?.marker);
assert.ok(markers.length >= 3, "track points should carry PAGASA category markers");
assert.ok(
  markers.every((f) => /^(STY|TY|T|STS|S|D|L)$/.test(f.properties.marker)),
  "category markers should be PAGASA letters (STY/TY/T/STS/S/D/L)"
);
assert.ok(
  gj.features.some((f) => f.geometry?.type === "Point" && f.properties?.label),
  "forecast points should carry hour labels"
);

const tb = trackBounds([m]);
assert.deepStrictEqual(tb, [129.2, 20.7, 132.5, 23.8]);

// trackFitBounds must expand beyond the plain center-line bbox so the full
// track, cone, and halo fit in view.
const fit = trackFitBounds(m);
assert.ok(fit && Array.isArray(fit) && fit.length === 4, "trackFitBounds should return [w,s,e,n]");
assert.ok(
  fit[0] < tb[0] && fit[1] < tb[1] && fit[2] > tb[2] && fit[3] > tb[3],
  "trackFitBounds should cover a larger area than the center-line bbox"
);

// LPA bulletins (weakened tropical cyclones) must be dropped.
const lpa =
  "\nLow Pressure Area (formerly PILANDOK)\n" +
  fixture
    .replace("Tropical Depression PILANDOK", "Low Pressure Area (formerly PILANDOK)")
    .split("\n")
    .filter((l) => !/Maximum sustained winds of/i.test(l))
    .join("\n");
assert.strictEqual(parsePagasaBulletinText(lpa), null, "LPA bulletin should be dropped");

console.log("typhoon-parse harness: all assertions passed");
