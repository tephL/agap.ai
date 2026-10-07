// Sample / seed LPA data used to exercise the Low Pressure Area feature
// (map overlay + list) independent of any live source. The single entry is a
// low pressure area out over the Philippine Sea east of northern Luzon —
// modeled on the same 8 AM 17 Nov 2024 stage as the Pepito typhoon/storm-signal
// fixtures, where an LPA east of Luzon was being absorbed by Pepito's
// circulation.
//
// `buildSampleLpas` wraps it in the same envelope the live service would
// return so consumers are identical.

export const SAMPLE_LPAS = [
  {
    id: "lpa-20241117-01",
    name: "LPA East of Northern Luzon",
    type: "Low Pressure Area",
    lat: 17.8,
    lon: 126.4,
    pressure: 1004,
    windSpeed: 25,
    movement: {
      direction: "WNW",
      directionName: "West northwestward",
      speed: 20,
      text: "West northwestward at 20 km/h",
    },
    note:
      "A low pressure area east of northern Luzon being absorbed by TINO's circulation. Localized rains expected over Cagayan Valley and the eastern seaboard.",
  },
];

/**
 * Wrap the sample LPAs in the same envelope getLowPressures() would return,
 * flagged `sample: true` so callers can distinguish it from live data.
 */
export function buildSampleLpas() {
  return {
    active: SAMPLE_LPAS.length > 0,
    unavailable: false,
    generatedAt: new Date().toISOString(),
    source: "sample",
    lpas: SAMPLE_LPAS,
    rawCount: SAMPLE_LPAS.length,
    sample: true,
  };
}
