// Registry of toggleable map feature layers, shown in the layers panel's
// "Map layers" tab. Adding a future category (weather bulletins, ...)
// means appending an entry here and rendering
// its map layers behind the matching visibleLayers key — no other plumbing
// required. (Named MAP_LAYERS to avoid clashing with the PMTiles HAZARD_LAYERS
// in lib/pmtiles/downloadLayer.)
export const MAP_LAYERS = [
  {
    key: "typhoons",
    label: "Typhoons",
    icon: "thunderstorm-outline",
    activeColor: "#0EA5E9",
    description: "Active typhoon tracks and public warnings",
  },
  {
    key: "stormSignals",
    label: "Storm Signals",
    icon: "warning-outline",
    activeColor: "#E32F31",
    description: "Bagyong dala-distribute: PAGASA TCWS signal per probinsya",
  },
  {
    key: "rain",
    label: "Rain Forecast",
    icon: "rainy-outline",
    activeColor: "#3B82F6",
    description: "Weekly rainfall forecast per region",
  },
];
