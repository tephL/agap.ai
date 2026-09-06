import { View, StyleSheet, Text, Dimensions, TouchableOpacity, ActivityIndicator, Linking, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, Camera, NativeUserLocation, UserLocation, GeoJSONSource, OfflineManager, Layer, Images, VectorSource } from '@maplibre/maplibre-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';

// services
import { uploadUserLocation } from '../../services/usersService.js';
import { fetchFamilyLocation, getFamilyPositions, setFamilyPositions } from "../../services/familyLocation.js";
import { getMyFamily, getFamilyMemberReportStatus } from '../../services/familyService.js';
import { getDamStatuses } from '../../services/hazardService.js';
import { resolveDamSeverity, SEVERITY_LEVELS } from '@/components/hazards/dams/damSeverity';
import { getInfluencingDams } from '@/components/hazards/dams/damInfluence';
import { useHazardElevation } from '../../hooks/useHazardElevation';
import { getStoredSession, CITIZEN_ROLE_ID } from '../../services/authService.js';
import {
  getActiveTyphoon,
  getTyphoons,
  getCachedTyphoons,
} from '../../services/typhoonService.js';
import { getRouteCoordinates } from '../../services/routeService';
import { getReportById, deleteReport } from "../../services/reportService";
import { getActiveReport, saveActiveReport, clearActiveReport } from "../../services/activeReportStore";
import { getPublicTeams } from '../../services/teamService';

// components
import LiveNotificationDropdown from "@/components/notifications/LiveNotificationDropdown";
import DispatchNotificationBar from "@/components/notifications/DispatchNotificationBar";
import ReportSubmittedBar from "@/components/notifications/ReportSubmittedBar";
import TyphoonAlertBanner from "@/components/notifications/TyphoonAlertBanner";
import { PersonCard } from '@/components/PersonCard';
import { HazardLayerOverlay } from '@/components/HazardLayerToggle';
import HazardLayersPanel from '@/components/HazardLayersPanel';
import HazardLayerLegend from '@/components/HazardLayerLegend';

// hooks
import useActiveDispatches from '../../hooks/useActiveDispatches';

// hazard layer selection prefs
import { useActiveHazardLayer } from '../../hooks/useActiveHazardLayer';
import { downloadLayer, getHazardLayer, isDownloaded } from '../../lib/pmtiles/downloadLayer';
import { getLegendHidden, setLegendHidden } from '../../services/hazardPrefsDb';

import useLiveLocation from '../../hooks/useLiveLocation.js';
import { useFlatMapStyle } from '../../hooks/useFlatMapStyle';
import HazardSheet from '@/components/hazards/HazardSheet';
import HazardTabs from '@/components/hazards/HazardTabs';
import DamMarker from '@/components/hazards/dams/DamMarker';
import StormSignalLegend from '@/components/hazards/stormSignals/StormSignalLegend';
import TyphoonLegend from '@/components/hazards/typhoons/TyphoonLegend';
import LPALegend from '@/components/hazards/typhoons/LPALegend';
import RainLegend from '@/components/hazards/rain/RainLegend';
import LegendStack from '@/components/hazards/common/LegendStack';
import SosReceivedOverlay from '@/components/SosReceivedOverlay';
import {
  getStormSignals,
  getSampleStormSignals,
  PAGASA_TCWS_COLORS,
  PAGASA_TCWS_LABELS,
} from '../../services/stormSignalService.js';
import {
  buildSignalGeojson,
  resolveSignalsToProvinces,
  provinceAtPoint,
} from '../../lib/stormSignals/provinceSignals.js';
import {
  buildTrackGeojson,
  trackFitBounds,
  INTENSITY_COLORS,
  statusKeyFromWindspeed,
} from '../../lib/typhoonTracks/trackJson.js';
import { buildLpaGeojson, lpaBounds } from '../../lib/typhoonTracks/lpaGeoJson.js';
import { getLowPressures } from '../../services/lowPressureService.js';
import { buildSampleLpas } from '../../lib/typhoonTracks/sampleLpas.js';
import {
  attachRainToProvinces,
} from '../../lib/weather/rainRegions.js';
import { getRainForecast, getSampleRainForecast } from '../../services/rainForecastService.js';
import { PAR_BOUNDS, LUZON_BOUNDS, buildParLineFeature } from '../../lib/hazards/parGeometry.js';
import phProvinces from '../../data/phProvinces.json';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const PH_BOUNDS = [116.9, 4.5, 126.6, 21.2];
const PH_CENTER = [121.7740, 12.8797];
const MAP_STYLE_URL = `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_API_KEY}`;

// Demo switch: while true the app uses the bundled Luzon sample instead of
// the live PAGASA mirror (shared by the map overlay and the Weather tab).
const USE_SAMPLE_STORM_SIGNALS = true;

function loadStormSignals() {
  return USE_SAMPLE_STORM_SIGNALS
    ? Promise.resolve(getSampleStormSignals())
    : getStormSignals();
}

// Typhoon pool loader. Sample mode is handled inside getTyphoons() (which also
// seeds the module cache so the map + AI context agree); this wrapper keeps the
// call sites uniform and is where a live toggle could live.
function loadTyphoons() {
  return getTyphoons();
}

// LPA loader. Sample mode returns the bundled fixtures; a live source can be
// wired in via getLowPressures() later.
const USE_SAMPLE_LPAS = true;
function loadLpas() {
  if (USE_SAMPLE_LPAS) {
    return Promise.resolve(buildSampleLpas());
  }
  return getLowPressures();
}

// Weekly rain loader. Sample mode returns the bundled fixture; a live source
// can be wired in via getRainForecast() later.
const USE_SAMPLE_RAIN_FORECAST = true;
function loadRainForecast() {
  if (USE_SAMPLE_RAIN_FORECAST) {
    return Promise.resolve(getSampleRainForecast());
  }
  return getRainForecast();
}

// Bounding box [minLng, minLat, maxLng, maxLat] across the given features'
// polygons, or null. Shared by the overlay auto-fit and region taps.
function geometryBounds(features) {
  let bounds = null;
  for (const feature of features) {
    if (!feature?.geometry?.coordinates) continue;
    const polys =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (bounds == null) {
            bounds = [x, y, x, y];
          } else {
            if (x < bounds[0]) bounds[0] = x;
            if (y < bounds[1]) bounds[1] = y;
            if (x > bounds[2]) bounds[2] = x;
            if (y > bounds[3]) bounds[3] = y;
          }
        }
      }
    }
  }
  return bounds;
}

function provinceBounds(geoJson, name) {
  const feature = (geoJson?.features ?? []).find(
    (f) => f.properties?.name === name
  );
  return feature ? geometryBounds([feature]) : null;
}

const FAMILY_FETCH_INTERVAL_MS = 1000 * 60;      // 1 min
const SEND_LOCATION_INTERVAL_MS = 1000 * 30;     // 30 sec
const PULSE_DURATION_MS = 3500;                  // ms per pulse cycle
const PULSE_TICK_MS = 100;                       // 10 Hz pulse updates (60fps rAF froze low-end devices)
const NOW_TICK_INTERVAL_MS = 5000;               // staleness re-check
const STALE_YELLOW_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min
const STALE_GRAY_THRESHOLD_MS = 30 * 60 * 1000;   // 30 min
const OFFLINE_PACK_NAME = 'current-area-offline';
const OFFLINE_PACK_RADIUS_KM = 5;
const SELECTED_PERSON_FLY_ZOOM = 15;
// Zoomed out just enough that the full 1.5 km halo ring stays on-screen.
const DAM_FLY_ZOOM = 13.5;
const SELECTED_PERSON_FLY_DURATION_MS = 1000;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const PERSON_CARD_HEIGHT_ESTIMATE = SCREEN_HEIGHT * 0.4;

// marching-ants steps for planned-route lines: cycling through these dash
// patterns makes the dashes flow along each line's direction, i.e. from
// the team base toward its assigned cluster
const ROUTE_DASH_TICK_MS = 55;
const ROUTE_DASH_STEP = 0.06;
const ROUTE_DASH_SEQUENCE = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
];

// teams dispatched to the citizen's cluster appear orange (same as dispatcher busy status)
const TEAM_DISPATCH_COLOR = '#f97316';
const DAM_SHEET_COLLAPSED_ESTIMATE = SCREEN_HEIGHT * 0.45;
const DAM_MARKER_COLOR = '#4287f5';
// Pulse cycle lengths per severity — the closer to spilling, the faster
// the marker ring throbs.
const DAM_PULSE_PERIODS = { normal: 3500, caution: 2000, danger: 1100 };
const ROUTE_FIT_PADDING = { top: 120, right: 80, bottom: 320, left: 80 };
// Stable empty array so prop identity stays consistent across renders.
const EMPTY_SLUGS = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Builds a [west, south, east, north] box around a center point.
// radiusKm controls how far out from the user's location to cache tiles.
function boundsAroundPoint(latitude, longitude, radiusKm = 5) {
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  return [
    longitude - lngDelta, // west
    latitude - latDelta,  // south
    longitude + lngDelta, // east
    latitude + latDelta,  // north
  ];
}

async function downloadOfflineMapForCurrentArea(userLocation) {
  if (userLocation.latitude == null || userLocation.longitude == null) {
    console.log('User location not available yet');
    return;
  }

  // Skip if we already have a pack for this area from a previous session.
  const existingPacks = await OfflineManager.getPacks();
  const alreadyDownloaded = existingPacks.some(
    (p) => p.metadata?.name === OFFLINE_PACK_NAME
  );
  if (alreadyDownloaded) {
    console.log('Offline pack already exists, skipping download');
    return;
  }

  const bounds = boundsAroundPoint(userLocation.latitude, userLocation.longitude, OFFLINE_PACK_RADIUS_KM);

  const progressListener = (pack, status) => {
    console.log(`${status.percentage}% complete`);
  };
  const errorListener = (pack, err) => {
    console.error('Offline pack error', err);
  };

  const pack = await OfflineManager.createPack(
    {
      mapStyle: MAP_STYLE_URL,
      minZoom: 10,
      maxZoom: 16,
      bounds,
      metadata: { name: OFFLINE_PACK_NAME },
    },
    progressListener,
    errorListener,
  );

  return pack;
}

// ---------------------------------------------------------------------------
// RouteDashLayer — animated marching-ants dashes for dispatched team routes
// ---------------------------------------------------------------------------

const RouteDashLayer = React.memo(function RouteDashLayer() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + ROUTE_DASH_STEP) % 1), ROUTE_DASH_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const dashArray =
    ROUTE_DASH_SEQUENCE[Math.floor(phase * ROUTE_DASH_SEQUENCE.length) % ROUTE_DASH_SEQUENCE.length];

  return (
    <>
      <Layer
        type="line"
        id="citizenRoutesCasingLayer"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
          'line-opacity': 0.6,
        }}
      />
      <Layer
        type="line"
        id="citizenRoutesLayer"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': TEAM_DISPATCH_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
          'line-dasharray': dashArray,
          'line-opacity': 0.9,
        }}
      />
    </>
  );
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Index() {
  const { selectedUserId, sosStatus, reportId: reportIdParam } = useLocalSearchParams();
  const router = useRouter();

  // flat basemap — fetches the style once and strips all 3-D terrain components
  const flatMapStyle = useFlatMapStyle(MAP_STYLE_URL);

  // typhoon alert state (session-only dismissal)
  const [activeTyphoon, setActiveTyphoon] = useState(null);
  const [typhoonDismissed, setTyphoonDismissed] = useState(false);

  // "Report received" overlay shown after returning from the report form.
  // The sosStatus/reportId params are consumed exactly once (guarded by the
  // ref) and then cleared off the route, so the overlay doesn't re-show every
  // time this screen regains focus (e.g. navigating back from report details).
  const [sosReceivedVariant, setSosReceivedVariant] = useState(null);
  const handledSosStatusRef = useRef(null);
  useFocusEffect(
    useCallback(() => {
      const isFresh =
        typeof sosStatus === "string" &&
        ["received", "prepared", "active"].includes(sosStatus);

      if (isFresh && handledSosStatusRef.current !== sosStatus) {
        handledSosStatusRef.current = sosStatus;
        setSosReceivedVariant(sosStatus);
        router.setParams({ sosStatus: undefined });
      } else if (!isFresh) {
        // Normal return to the map (no fresh submission pending): reset the
        // guard so the next submission re-triggers the overlay.
        handledSosStatusRef.current = null;
      }
    }, [sosStatus, router])
  );

  const handleTyphoonAskPreparedness = useCallback(() => {
    router.push({
      pathname: "/assistant",
      params: {
        question: "May aktibong bagyo (Signal No. 3 sa aking lugar) — ano ang mga tips sa disaster preparedness na dapat kong sundin?",
      },
    });
  }, [router]);

  const handleTyphoonDismiss = useCallback(() => {
    setTyphoonDismissed(true);
  }, []);

  const handleTyphoonViewDetails = useCallback(() => {
    // details expanded inline by the banner component
  }, []);

  // location / permissions
  const { locationGranted, coords, getCachedCoords, resolveCoords } = useLiveLocation();
  const [locating, setLocating] = useState(false);

  // active dispatch notifications
  const { dispatches, allDispatches, cancelledDispatches, resetDismissed } = useActiveDispatches();

  // "Your report was received" notif shown after returning from the report
  // form. reportIdParam comes from report.jsx closeForm. The active report is
  // persisted via activeReportStore so the notif reappears after re-login or
  // an app restart (reportIdParam is only present right after submission).
  const [activeReport, setActiveReport] = useState(null);

  useEffect(() => {
    if (reportIdParam == null) return;
    let mounted = true;
    (async () => {
      const num = Number(reportIdParam);
      if (!Number.isInteger(num) || num <= 0) return;
      try {
        const { report } = await getReportById(num);
        if (!mounted) return;
        // Don't show the report window if it no longer exists or was resolved.
        if (!report || report.status === "resolved") {
          await clearActiveReport();
          return;
        }
        setActiveReport({ reportId: num, clusterId: report.cluster_id ?? null });
        saveActiveReport({ reportId: num, clusterId: report.cluster_id ?? null });
      } catch (e) {
        if (mounted) console.log("activeReport load error:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reportIdParam]);

  // On mount, restore a previously persisted active report (across re-login /
  // app restarts) and re-validate it against the server. If the report no
  // longer exists or was resolved (e.g. resolved/deleted server-side), clear it.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getActiveReport();
      if (!mounted || !stored?.reportId) return;
      try {
        const { report } = await getReportById(stored.reportId);
        if (!mounted) return;
        if (!report || report.status === "resolved") {
          await clearActiveReport();
          return;
        }
        setActiveReport({ reportId: stored.reportId, clusterId: report.cluster_id ?? null });
        saveActiveReport({ reportId: stored.reportId, clusterId: report.cluster_id ?? null });
      } catch (e) {
        if (mounted) {
          console.log("persisted activeReport load error:", e);
          await clearActiveReport();
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Whether help is already on the way for the citizen's report — i.e. any
  // active team assignment (pending or dispatched) to the report's cluster.
  // Uses allDispatches (the full, unfiltered list) so it stays accurate, and
  // it covers both the "Dispatching" (pending) and "En route" (dispatched)
  // states that the DispatchNotificationBar reports as "help is on the way".
  const reportDispatched =
    activeReport?.clusterId != null &&
    allDispatches.some(
      (d) => d.cluster?.cluster_id === activeReport.clusterId
    );

  const handleReportViewDetails = useCallback(
    (id) => {
      router.push({ pathname: "/report-detail", params: { reportId: String(id) } });
    },
    [router]
  );

  const handleReportCancel = useCallback(
    async (id) => {
      try {
        await deleteReport(id);
        await clearActiveReport();
        setActiveReport(null);
      } catch (e) {
        console.log("cancel report error:", e);
      }
    },
    []
  );

  // Hide the report submitted window once help is on the way (a team is
  // dispatched to the citizen's cluster); the DispatchNotificationBar takes
  // over at that point.
  const showReportBar = activeReport && !reportDispatched;

  // public teams (is_public = true) shown on citizen map
  const [publicTeams, setPublicTeams] = useState([]);

  // Stable null-safe shape so hazard memos/handlers can read .latitude/.longitude
  // unconditionally before the first GPS fix arrives.
  const userLocation = useMemo(
    () => coords ?? { latitude: null, longitude: null },
    [coords]
  );

  // ~110 m grid snap (same cell size useHazardElevation uses): influence,
  // halos and route lines only rebuild when the user crosses a cell, so GPS
  // jitter no longer churns GeoJSON on every watch tick.
  const coarseUserLocation = useMemo(() => {
    const round = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
    return {
      latitude: round(userLocation.latitude),
      longitude: round(userLocation.longitude),
    };
  }, [userLocation]);

  // family markers state
  const [familyMembers, setFamilyMembers] = useState([]);
  const [familyReportStatus, setFamilyReportStatus] = useState({});
  const [selectedPerson, setSelectedPerson] = useState(null);

  // hazards state
  const [dams, setDams] = useState([]);
  const [selectedDam, setSelectedDam] = useState(null);
  const [hazardsOpen, setHazardsOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({ dams: true, stormSignals: false, typhoons: false, lpas: false, rain: false });
  const [activeTab, setActiveTab] = useState("dams");

  // PAGASA TCWS storm signals overlay
  const [stormSignals, setStormSignals] = useState(null);
  const [stormSignalsError, setStormSignalsError] = useState(false);
  const [stormLegendHidden, setStormLegendHidden] = useState(false);
  const [selectedStormProvince, setSelectedStormProvince] = useState(null);
  const stormAutoFitDoneRef = useRef(false);

  // GDACS typhoon tracks overlay
  const [typhoons, setTyphoons] = useState(null);
  const [typhoonsError, setTyphoonsError] = useState(false);
  const [typhoonLegendHidden, setTyphoonLegendHidden] = useState(false);
  const [selectedTyphoon, setSelectedTyphoon] = useState(null);

  // Low pressure areas overlay
  const [lpas, setLpas] = useState(null);
  const [lpasError, setLpasError] = useState(false);
  const [lpaLegendHidden, setLpaLegendHidden] = useState(false);
  const [selectedLpa, setSelectedLpa] = useState(null);

  // Weekly rain forecast overlay
  const [rainForecast, setRainForecast] = useState(null);
  const [rainError, setRainError] = useState(false);
  const [rainLegendHidden, setRainLegendHidden] = useState(false);
  const [selectedRainRegion, setSelectedRainRegion] = useState(null);

  // fetch when toggled on; stale state is ignored while visibleLayers is off
  useEffect(() => {
    if (!visibleLayers.stormSignals) return;
    let cancelled = false;
    loadStormSignals()
      .then((data) => {
        if (!cancelled) {
          setStormSignals(data);
          setStormSignalsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStormSignalsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleLayers.stormSignals]);

  const signalByProvince = useMemo(
    () => resolveSignalsToProvinces(stormSignals?.signals ?? []).byProvince,
    [stormSignals]
  );

  const stormSignalsGeojson = useMemo(
    () => buildSignalGeojson(phProvinces, signalByProvince),
    [signalByProvince]
  );

  // one-shot camera autofit to the signalled provinces whenever the layer
  // is (re)activated; falls back to a PH-wide view when nothing is active
  useEffect(() => {
    if (!visibleLayers.stormSignals) {
      stormAutoFitDoneRef.current = false;
      return;
    }
    if (!stormSignals || stormSignals.unavailable) return;
    if (stormAutoFitDoneRef.current) return;
    stormAutoFitDoneRef.current = true;

    const bounds = geometryBounds(
      stormSignalsGeojson.features.filter(
        (f) => (f.properties?.signal ?? 0) > 0
      )
    );
    if (bounds == null) return;
    cameraRef.current?.fitBounds(bounds, {
      padding: { top: 180, right: 60, bottom: 200, left: 60 },
      duration: 900,
    });
  }, [visibleLayers.stormSignals, stormSignals, stormSignalsGeojson]);

  // fetch storm-signal data when the Weather tab is opened, even if the map
  // overlay was never toggled on
  useEffect(() => {
    if (activeTab !== "weatherBulletins" && activeTab !== "nearYou") return;
    if (stormSignals != null) return;
    let cancelled = false;
    loadStormSignals()
      .then((data) => {
        if (!cancelled) {
          setStormSignals(data);
          setStormSignalsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStormSignalsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, stormSignals]);

  // restore any cached typhoon pool so the tab/overlay renders immediately
  useEffect(() => {
    const cached = getCachedTyphoons();
    if (cached) setTyphoons(cached);
  }, []);

  // Shared PAR boundary line feature, appended to typhoon and LPA overlays so
  // the Philippine Area of Responsibility box is visible on weather layers.
  const parLineFeature = useMemo(() => buildParLineFeature(), []);

  // GeoJSON for the typhoon overlay. Only the currently-selected typhoon is
  // drawn (its PAGASA cone + impact halos + track); nothing when none picked.
  const typhoonsGeojson = useMemo(() => {
    if (!selectedTyphoon) return { type: "FeatureCollection", features: [] };
    const built = buildTrackGeojson(selectedTyphoon);
    return { ...built, features: [...built.features, parLineFeature] };
  }, [selectedTyphoon, parLineFeature]);

  // fetch GDACS typhoons when the overlay is toggled on
  useEffect(() => {
    if (!visibleLayers.typhoons) return;
    let cancelled = false;
    loadTyphoons()
      .then((data) => {
        if (!cancelled) {
          setTyphoons(data);
          setTyphoonsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setTyphoonsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleLayers.typhoons]);

  // fetch typhoon data when the Typhoons tab is opened, even if the map
  // overlay was never toggled on
  useEffect(() => {
    if (activeTab !== "typhoons" && activeTab !== "nearYou") return;
    if (typhoons != null) return;
    let cancelled = false;
    loadTyphoons()
      .then((data) => {
        if (!cancelled) {
          setTyphoons(data);
          setTyphoonsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setTyphoonsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, typhoons]);

  // Low pressure areas
  useEffect(() => {
    if (!visibleLayers.lpas) return;
    if (lpas != null) return;
    let cancelled = false;
    loadLpas()
      .then((data) => {
        if (!cancelled) {
          setLpas(data);
          setLpasError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLpasError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleLayers.lpas, lpas]);

  const lpasGeojson = useMemo(() => {
    const built = buildLpaGeojson(lpas?.lpas ?? []);
    return { ...built, features: [...built.features, parLineFeature] };
  }, [lpas, parLineFeature]);

  // Weekly rain forecast
  useEffect(() => {
    if (!visibleLayers.rain && activeTab !== "rainForecast" && activeTab !== "nearYou") return;
    if (rainForecast != null) return;
    let cancelled = false;
    loadRainForecast()
      .then((data) => {
        if (!cancelled) {
          setRainForecast(data);
          setRainError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setRainError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleLayers.rain, activeTab, rainForecast]);

  // Rain overlay GeoJSON: province polygons tinted by "today's" (day 0)
  // rainfall. Each province gets the exact rainfall for its name.
  const rainByProvince = useMemo(() => {
    const map = {};
    for (const province of rainForecast?.provinces ?? []) {
      map[province.name] = province.days.map((d) => d.mm);
    }
    return map;
  }, [rainForecast]);
  const rainGeojson = useMemo(
    () => attachRainToProvinces(phProvinces, 0, rainByProvince),
    [rainByProvince]
  );

  // The province the user's current location falls in, used to show a
  // dedicated "your location" 7-day forecast hero card in the Rain tab and to
  // personalize the storm-signal banner. When no GPS fix or the point is over
  // open ocean it falls back to null (the tab shows a "enable location" state).
  const userProvinceName = useMemo(
    () =>
      provinceAtPoint(
        userLocation.latitude,
        userLocation.longitude,
        phProvinces.features
      ),
    [userLocation.latitude, userLocation.longitude]
  );

  // The full province object (with per-day rainfall) for the user's location.
  const userRainProvince = useMemo(
    () =>
      (rainForecast?.provinces ?? []).find(
        (r) => r.name === userProvinceName
      ) ?? null,
    [rainForecast, userProvinceName]
  );

  // The user's own storm signal level (1-5) or null when not under a signal;
  // drives the "Your area" card and personalized map banner.
  const userSignalLevel = useMemo(
    () => (userProvinceName != null ? signalByProvince[userProvinceName] ?? null : null),
    [userProvinceName, signalByProvince]
  );

  // Weather overlays share the expanded PAR camera bounds so users can zoom out
  // to view the whole Philippine Area of Responsibility. Non-weather overlays
  // keep the tighter PH bounds.
  const weatherOverlaysActive =
    visibleLayers.stormSignals ||
    visibleLayers.typhoons ||
    visibleLayers.lpas ||
    visibleLayers.rain;

  // map lifecycle state
  const [mapReady, setMapReady] = useState(false);
  const hasRunOnce = useRef(false);
  const cameraRef = useRef(null);
  const mapRef = useRef(null);

  // When the Typhoons overlay is turned on, auto-select the first (strongest)
  // typhoon so the PAGASA cone/impact overlay shows immediately, and pan the
  // camera out to fit that storm's full track + cone. The pan runs once per
  // on-cycle (guarded by typhoonAutoPanRef) so a later typhoon-data refresh
  // doesn't yank the camera again. Turning the overlay off clears the
  // selection and resets the guard.
  const typhoonAutoPanRef = useRef(false);
  useEffect(() => {
    if (!visibleLayers.typhoons) {
      setSelectedTyphoon(null);
      typhoonAutoPanRef.current = false;
      return;
    }
    if (!typhoons || typhoons.unavailable) return;
    const list = typhoons.typhoons ?? [];
    if (list.length === 0) return;
    const strongest = [...list].sort(
      (a, b) =>
        (b.current?.windspeed ?? b.overallWindspeed ?? 0) -
        (a.current?.windspeed ?? a.overallWindspeed ?? 0)
    )[0];
    setSelectedTyphoon(strongest);
    if (typhoonAutoPanRef.current) return;
    typhoonAutoPanRef.current = true;
    const bounds = trackFitBounds(strongest);
    if (bounds) {
      cameraRef.current?.fitBounds(bounds, {
        padding: { top: 180, right: 60, bottom: 220, left: 60 },
        duration: 900,
      });
    }
  }, [visibleLayers.typhoons, typhoons]);

  // tracks which selectedUserId param value we've already acted on, so a
  // background family refetch doesn't keep re-flying/re-opening the card
  const handledSelectedUserIdRef = useRef(null);

  // guards the one-time auto-zoom so it runs only on the first location fix
  const hasAutoZoomedRef = useRef(false);

  // auto-download the 5-year flood layer on first mount
  useEffect(() => {
    (async () => {
      try {
        if (!(await isDownloaded("flood_25yr"))) {
          await downloadLayer("flood_25yr");
        }
      } catch (e) {
        console.log("auto-download flood_25yr failed", e);
      }
    })();
  }, []);

  // fetch active typhoon for alert banner (citizens only)
  useEffect(() => {
    (async () => {
      try {
        const session = await getStoredSession();
        if (!session || session.role_id !== CITIZEN_ROLE_ID) return;
        const data = await getActiveTyphoon();
        setActiveTyphoon(data?.typhoon ?? null);
      } catch (e) {
        console.log("Failed to fetch active typhoon", e);
      }
    })();
  }, []);

  // pulsing "dih" effect state
  const [pulse, setPulse] = useState(0);
  const [damPulse, setDamPulse] = useState({ normal: 0, caution: 0, danger: 0 });
  const [teamPulse, setTeamPulse] = useState(0);

  // hazard overlay selection (persisted, single-select) + layers sheet state
  const { activeId, select: selectHazardLayer } = useActiveHazardLayer();
  const [layersOpen, setLayersOpen] = useState(false);

  /**
   * Reads the active hazard layer at the user's current position by asking
   * the rendered map which polygon sits under that pixel. Returns the flood
   * `Var` value (1 = low, 2 = medium, 3 = high) or null when the point is
   * not inside a hazard polygon (or nothing is rendered yet).
   */
  const resolveCurrentHazardVar = useCallback(
    async (layerId) => {
      if (!mapReady || !mapRef.current) return null;
      try {
        const coords = getCachedCoords() || (await resolveCoords());
        if (!coords) return null;
        const pixel = await mapRef.current.project([
          coords.longitude,
          coords.latitude,
        ]);
        if (!pixel) return null;
        const features = await mapRef.current.queryRenderedFeatures(pixel, {
          layers: [`hazard-source-${layerId}-fill`],
        });
        if (!features || features.length === 0) return null;
        const level = Number(features[0].properties?.Var);
        return [1, 2, 3].includes(level) ? level : null;
      } catch (e) {
        console.log("Failed to resolve hazard at location", e);
        return null;
      }
    },
    [mapReady, getCachedCoords, resolveCoords]
  );

  // Reused by both the layers panel "?" button and the floating map button:
  // resolves the user's current hazard level and pre-fills a question in the
  // AI assistant, attaching the level context so answers are location-aware.
  const handleAskAI = useCallback(
    async (layerId) => {
      const layer = getHazardLayer(layerId);
      let hazardParams = {};
      // Location risk is only resolvable when the tapped layer is the one
      // actually rendered on the map (queryRenderedFeatures reads drawn
      // polygons); otherwise just explain the layer in general terms.
      if (activeId === layerId) {
        const varLevel = await resolveCurrentHazardVar(layerId);
        if (varLevel != null) {
          hazardParams = { hazardLayerId: layerId, hazardVar: String(varLevel) };
        }
      }
      router.push({
        pathname: "/assistant",
        params: {
          question: `Ano ang ibig sabihin ng "${layer.label}" na hazard layer? Ipaliwanag ito nang detalyado.`,
          ...hazardParams,
        },
      });
    },
    [router, activeId, resolveCurrentHazardVar]
  );

  // legend visibility (persisted): expands whenever the active layer
  // changes, otherwise restores what the user last chose
  const [legendHidden, setLegendHiddenState] = useState(false);
  const prevActiveLayerRef = useRef(activeId);
  useEffect(() => {
    const prev = prevActiveLayerRef.current;
    prevActiveLayerRef.current = activeId;
    if (prev !== null && activeId !== prev) {
      // a different layer was picked — always re-show its legend
      setLegendHiddenState(false);
      setLegendHidden(false).catch(() => undefined);
      return;
    }
    // same layer (or first mount) — restore the persisted choice
    getLegendHidden()
      .then(setLegendHiddenState)
      .catch(() => undefined);
  }, [activeId]);

  const handleToggleLegend = useCallback(() => {
    setLegendHiddenState((hidden) => {
      setLegendHidden(!hidden).catch(() => undefined);
      return !hidden;
    });
  }, []);

  // staleness re-check clock
  const [now, setNow] = useState(Date.now());

  // ---- reset dismissed dispatch notifications on tab focus -----------
  useFocusEffect(
    useCallback(() => {
      resetDismissed();
    }, [resetDismissed])
  );

  // ---- hide report window once it has been resolved -------------------
  useFocusEffect(
    useCallback(() => {
      if (!activeReport?.reportId) return;
      let cancelled = false;
      (async () => {
        try {
          const { report } = await getReportById(activeReport.reportId);
          if (!cancelled && report?.status === "resolved") {
            await clearActiveReport();
            setActiveReport(null);
          }
        } catch (e) {
          console.log("activeReport status check error:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeReport])
  );

  // ---- fetch public teams on focus -------------------------------------
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const teams = await getPublicTeams();
          if (!cancelled) setPublicTeams(teams);
        } catch (e) {
          console.log("Failed to load public teams", e);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  // ---- location sending + family fetch loop (runs while screen focused) ---
  const refreshFamilyLocations = useCallback(async () => {
    try {
      const { data } = await fetchFamilyLocation();
      for (const member of data) {
        const { last_seen, longitude, latitude, user_id } = member;
        const timestampMs = new Date(last_seen).getTime();
        await setFamilyPositions({ latitude, longitude, millisec: timestampMs, user_id });
      }
    } catch (e) {
      console.log('fetch failed, falling back to local db', e);
    }

    try {
      const locations = await getFamilyPositions();
      setFamilyMembers(locations);
    } catch (e) {
      console.log('failed to read local db', e);
    }

    try {
      const reportStatus = await getFamilyMemberReportStatus();
      setFamilyReportStatus(reportStatus);
    } catch (e) {
      console.log('failed to fetch report status', e);
    }
  }, []);

  // ---- dam statuses (fetched on focus; PAGASA updates ~twice daily) -------
  const refreshDams = useCallback(async () => {
    try {
      const data = await getDamStatuses();
      setDams(Array.isArray(data?.dams) ? data.dams : []);
    } catch (e) {
      console.log('failed to load dams', e);
    }
  }, []);

  // ---- location sending + family fetch loop (runs while screen focused) ---
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!hasRunOnce.current) {
          hasRunOnce.current = true;
          await getMyFamily();
        }
      })();

      let cancelled = false;

      const sendLocation = async () => {
        if (cancelled) return;
        let offlineDownloadStarted = false;
        const coords = await resolveCoords();
        if (!coords) return;

        if (!offlineDownloadStarted) {
          offlineDownloadStarted = true;
          downloadOfflineMapForCurrentArea(coords);
        }

        try {
          await uploadUserLocation(coords);
          console.log('sent location');
        } catch (e) {
          console.error(e.response?.data);
          console.error(e.response?.status);
          console.error(e.config?.data);
        }
      };

      refreshFamilyLocations();
      sendLocation();
      refreshDams();
      const familyFetchInterval = setInterval(refreshFamilyLocations, FAMILY_FETCH_INTERVAL_MS);
      const sendInterval = setInterval(sendLocation, SEND_LOCATION_INTERVAL_MS);
      console.log(familyMembers);

      return () => {
        console.log('went out');
        cancelled = true;
        clearInterval(sendInterval);
        clearInterval(familyFetchInterval);
      }
    }, [refreshFamilyLocations, resolveCoords, refreshDams])
  );

  // ---- auto-zoom to the user once their location loads ---------------------
  // Retries up to 5 times with 2s delays in case GPS fix isn't immediate.
  useEffect(() => {
    if (!locationGranted || !mapReady || hasAutoZoomedRef.current) return;
    let cancelled = false;
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 2000;

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled || hasAutoZoomedRef.current) return;
        const coords = await resolveCoords();
        if (coords && !cancelled && !hasAutoZoomedRef.current) {
          hasAutoZoomedRef.current = true;
          cameraRef.current?.flyTo({
            center: [coords.longitude, coords.latitude],
            zoom: SELECTED_PERSON_FLY_ZOOM,
            duration: SELECTED_PERSON_FLY_DURATION_MS,
          });
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationGranted, mapReady, resolveCoords]);

  // ---- honor a selectedUserId passed in from FamilyScreen -----------------
  useEffect(() => {
  if (!selectedUserId) return;
  if (handledSelectedUserIdRef.current === selectedUserId) return;
  if (familyMembers.length === 0) return;

  const match = familyMembers.find(
    (m) => String(m.user_id) === String(selectedUserId)
  );
  if (!match) return;

  const hasValidCoords =
    typeof match.latitude === 'number' &&
    typeof match.longitude === 'number' &&
    !Number.isNaN(match.latitude) &&
    !Number.isNaN(match.longitude);

  handledSelectedUserIdRef.current = selectedUserId;

  setSelectedPerson({
      user_id: match.user_id,
      first_name: match.first_name,
      last_name: match.last_name,
      relation: match.relation,
      phone_number: match.phone_number,
      age: match.age,
      last_seen: match.last_seen,
      has_active_report: Boolean(familyReportStatus[match.user_id]?.hasActiveReport),
      active_report_id: familyReportStatus[match.user_id]?.reportId ?? null,
    });

    if (hasValidCoords) {
      cameraRef.current?.flyTo({
        center: [match.longitude, match.latitude],
        zoom: SELECTED_PERSON_FLY_ZOOM,
        duration: SELECTED_PERSON_FLY_DURATION_MS,
        padding: {
          top: 0,
          bottom: PERSON_CARD_HEIGHT_ESTIMATE,
          left: 0,
          right: 0,
        },
      });
    } else {
      console.log(`No location yet for user ${match.user_id}, skipping flyTo`);
    }
  }, [selectedUserId, familyMembers, familyReportStatus]);

  // ---- derived geojson for family markers -------------------------------
  const familyGeojson = {
    type: 'FeatureCollection',
    features: familyMembers.map((member) => ({
      type: 'Feature',
      id: `family-${member.user_id}`,
      geometry: {
        type: 'Point',
        coordinates: [member.longitude, member.latitude], // [lng, lat] order
      },
      properties: {
        user_id: member.user_id,
        first_name: member.first_name,
        last_name: member.last_name,
        relation: member.relation,
        phone_number: member.phone_number,
        age: member.age,
        last_seen: member.last_seen,
        has_active_report: Boolean(familyReportStatus[member.user_id]?.hasActiveReport),
        active_report_id: familyReportStatus[member.user_id]?.reportId ?? null,
      },
    })),
  };

  // ---- geojson for dispatched team markers ------------------------------
  const teamGeojson = {
    type: 'FeatureCollection',
    features: dispatches
      .filter(
        (d) =>
          d.team?.lat != null &&
          d.team?.lng != null &&
          !Number.isNaN(d.team.lat) &&
          !Number.isNaN(d.team.lng)
      )
      .map((d) => ({
        type: 'Feature',
        id: `dispatch-team-${d.team_id}`,
        geometry: {
          type: 'Point',
          coordinates: [d.team.lng, d.team.lat],
        },
        properties: {
          team_id: d.team_id,
          name: d.team?.name ?? 'Response Team',
          assignment_id: d.assignment_id,
        },
      })),
  };

  // ---- planned routes for dispatched teams: team base -> cluster ----------
  const [teamRoutes, setTeamRoutes] = useState({});

  const activeDispatches = useMemo(() => {
    return dispatches
      .filter(
        (d) =>
          d.team?.lat != null &&
          d.team?.lng != null &&
          !Number.isNaN(d.team.lat) &&
          !Number.isNaN(d.team.lng) &&
          d.cluster?.lat != null &&
          d.cluster?.lng != null &&
          !Number.isNaN(d.cluster.lat) &&
          !Number.isNaN(d.cluster.lng)
      )
      .map((d) => ({
        teamId: d.team_id,
        from: [d.team.lng, d.team.lat],
        to: [d.cluster.lng, d.cluster.lat],
      }));
  }, [dispatches]);

  const dispatchSignature = useMemo(
    () =>
      activeDispatches
        .map((d) => `${d.teamId}:${d.from.join(',')}=>${d.to.join(',')}`)
        .sort()
        .join('|'),
    [activeDispatches]
  );
  const fetchedDispatchSigRef = useRef(null);

  useEffect(() => {
    if (dispatchSignature === fetchedDispatchSigRef.current) return;
    fetchedDispatchSigRef.current = dispatchSignature;

    let cancelled = false;
    (async () => {
      if (activeDispatches.length === 0) {
        setTeamRoutes({});
        return;
      }
      const entries = await Promise.all(
        activeDispatches.map(async (d) => [
          d.teamId,
          await getRouteCoordinates(d.from, d.to),
        ])
      );
      if (cancelled) return;

      const next = {};
      for (const [teamId, coords] of entries) {
        if (coords) next[teamId] = coords;
      }
      setTeamRoutes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatchSignature, activeDispatches]);

  // ---- routes GeoJSON for marching-ants lines ----------------------------
  const routesGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: Object.entries(teamRoutes).map(([teamId, coordinates]) => ({
        type: 'Feature',
        id: `citizen-route-${teamId}`,
        geometry: { type: 'LineString', coordinates },
        properties: { team_id: Number(teamId) },
      })),
    }),
    [teamRoutes]
  );

  // ---- team starting point markers (base location, dispatcher icon style) -
  const teamStartingPointGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: dispatches
        .filter(
          (d) =>
            d.team?.lat != null &&
            d.team?.lng != null &&
            !Number.isNaN(d.team.lat) &&
            !Number.isNaN(d.team.lng)
        )
        .map((d) => ({
          type: 'Feature',
          id: `team-start-${d.team_id}`,
          geometry: {
            type: 'Point',
            coordinates: [d.team.lng, d.team.lat],
          },
          properties: {
            team_id: d.team_id,
            name: d.team?.name ?? 'Response Team',
          },
        })),
    }),
    [dispatches]
  );

  // ---- public teams (is_public) base markers ---------------------------
  const PUBLIC_TEAM_COLOR = '#3b82f6';
  const publicTeamGeojson = useMemo(() => {
    const dispatchedIds = new Set(
      dispatches
        .filter(
          (d) =>
            d.team?.lat != null &&
            d.team?.lng != null &&
            !Number.isNaN(d.team.lat) &&
            !Number.isNaN(d.team.lng)
        )
        .map((d) => d.team_id)
    );
    return {
      type: 'FeatureCollection',
      features: publicTeams
        .filter(
          (t) =>
            !dispatchedIds.has(t.team_id) &&
            typeof t.lat === 'number' &&
            typeof t.lng === 'number' &&
            !Number.isNaN(t.lat) &&
            !Number.isNaN(t.lng)
        )
        .map((t) => ({
          type: 'Feature',
          id: `public-team-${t.team_id}`,
          geometry: {
            type: 'Point',
            coordinates: [t.lng, t.lat],
          },
          properties: {
            team_id: t.team_id,
            name: t.name,
          },
        })),
    };
  }, [publicTeams, dispatches]);

  // Ground elevation for the hydrology risk factor (graceful when unknown).
  const { elevation: userElevation } = useHazardElevation(
    coarseUserLocation.latitude,
    coarseUserLocation.longitude
  );

  // ---- derived geojson for dam markers + influencing-dam highlight -------
  // Dams whose downstream corridors actually reach the user (hydrology-
  // first; see data/hydrology.js), nearest first. All of them get the
  // emphasized ring, a dashed route line, and a tappable route.
  const influencingDams = useMemo(
    () => getInfluencingDams(dams, coarseUserLocation, { userElevation }),
    [dams, coarseUserLocation, userElevation]
  );

  const nearestDamSlug = influencingDams[0]?.dam.slug ?? null;

  const influencingBySlug = useMemo(() => {
    const bySlug = {};
    for (const entry of influencingDams) bySlug[entry.dam.slug] = entry;
    return bySlug;
  }, [influencingDams]);

  // Stable array identity for the drawer's memoized rows.
  const influencingSlugs = useMemo(
    () => Object.keys(influencingBySlug),
    [influencingBySlug]
  );

  const damsGeojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: dams
      .filter((dam) => dam.coordinates)
      .map((dam) => ({
        type: 'Feature',
        id: `dam-${dam.slug}`,
        geometry: {
          type: 'Point',
          coordinates: [dam.coordinates.lng, dam.coordinates.lat],
        },
        properties: {
          slug: dam.slug,
          name: dam.name,
          reservoirWaterLevel: dam.reservoirWaterLevel,
          deviationFromNHWL: dam.deviationFromNHWL,
          severity: resolveDamSeverity(dam).level,
        },
      })),
  }), [dams]);

  // Broken lines from the user to each influencing dam. Uses the coarse
  // location so the dashed corridors don't rebuild on every GPS tick.
  const nearestRouteGeojson = useMemo(() => {
    if (
      influencingDams.length === 0 ||
      coarseUserLocation.latitude == null ||
      coarseUserLocation.longitude == null
    ) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: influencingDams.slice(0, 1)
        .filter(({ dam }) => dam.coordinates)
        .map(({ dam, distanceMeters }, index) => ({
          type: 'Feature',
          id: `dam-route-${dam.slug}`,
          geometry: {
            type: 'LineString',
            coordinates: [
              [userLocation.longitude, userLocation.latitude],
              [dam.coordinates.lng, dam.coordinates.lat],
            ],
          },
          properties: { slug: dam.slug, distanceMeters, index },
        })),
    };
  }, [influencingDams, coarseUserLocation.latitude, coarseUserLocation.longitude, userLocation.latitude, userLocation.longitude]);

  // ---- pulsing "dih" effect ----------------------------------------------
  // 10 Hz interval instead of requestAnimationFrame: the old 60fps loop
  // re-rendered this whole screen every frame and starved MapLibre's tile
  // callbacks (ANR on low-end devices). Rings still animate smoothly.
  useEffect(() => {
    const start = Date.now();
    const damsVisible = visibleLayers.dams;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setPulse((elapsed % PULSE_DURATION_MS) / PULSE_DURATION_MS);
      if (damsVisible) {
        setDamPulse({
          normal: elapsed % DAM_PULSE_PERIODS.normal / DAM_PULSE_PERIODS.normal,
          caution: elapsed % DAM_PULSE_PERIODS.caution / DAM_PULSE_PERIODS.caution,
          danger: elapsed % DAM_PULSE_PERIODS.danger / DAM_PULSE_PERIODS.danger,
        });
      }
    }, PULSE_TICK_MS);
    return () => clearInterval(id);
  }, [visibleLayers.dams]);

  // ---- faster pulse for dispatched team markers -------------------------
  const TEAM_PULSE_DURATION_MS = 1200;
  useEffect(() => {
    let raf;
    const start = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - start) % TEAM_PULSE_DURATION_MS;
      setTeamPulse(elapsed / TEAM_PULSE_DURATION_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- color staleness ----------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), NOW_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const ageMs = ['-', now, ['get', 'last_seen']];

  // Stop value for the pulse radius: severity picks the phase, so only ONE
  // zoom-based interpolate exists in the whole expression (style-spec rule).
  const damPulseStop = (base, amp) => [
    'match', ['get', 'severity'],
    'danger', base + damPulse.danger * amp,
    'caution', base + damPulse.caution * amp,
    base + damPulse.normal * amp,
  ];

  const staleColorExpr = [
    'case',
    ['get', 'has_active_report'], '#E32F31',  // red: has active report
    ['<', ageMs, STALE_YELLOW_THRESHOLD_MS], '#22c55e',  // green: seen < 5 min ago
    ['<', ageMs, STALE_GRAY_THRESHOLD_MS], '#eab308',    // yellow: < 30 min ago
    '#a9a9a9',                                            // gray: older / stale
  ];

  // ---- handlers -----------------------------------------------------------
  const handleUserLocationPress = (event) => {
    const feature = event?.nativeEvent?.features?.[0];
    if (!feature) return;

    setSelectedPerson(feature.properties);

    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const hasValidCoords = typeof lng === 'number' && typeof lat === 'number';

    if (hasValidCoords) {
      cameraRef.current?.flyTo({
        center: [lng, lat],
        zoom: SELECTED_PERSON_FLY_ZOOM,
        duration: SELECTED_PERSON_FLY_DURATION_MS,
        padding: {
          top: 0,
          bottom: PERSON_CARD_HEIGHT_ESTIMATE,
          left: 0,
          right: 0,
        },
      });
    }
  };

  const handleClosePersonCard = () => {
    setSelectedPerson(null);
  };

  // ---- hazards handlers ----------------------------------------------------
  const flyToDam = useCallback((lng, lat) => {
    cameraRef.current?.flyTo({
      center: [lng, lat],
      zoom: DAM_FLY_ZOOM,
      duration: SELECTED_PERSON_FLY_DURATION_MS,
      padding: {
        top: 0,
        bottom: DAM_SHEET_COLLAPSED_ESTIMATE,
        left: 0,
        right: 0,
      },
    });
  }, []);

  const handleDamPress = (event) => {
    // GeoJSONSource onPress wraps in nativeEvent.features[0]; Marker onPress
    // passes the feature object directly as event.properties / event directly.
    const feature = event?.nativeEvent?.features?.[0] ?? event;
    if (!feature?.properties?.slug) return;

    // Keep the drawer's list in sync with the latest backend data so it can
    // never render a stale subset after re-opening from a marker tap.
    refreshDams();

    setSelectedDam(feature.properties);
    setSheetExpanded(false);

    const coords = feature.geometry?.coordinates ?? (feature.properties?.coordinates
      ? [feature.properties.coordinates.lng, feature.properties.coordinates.lat]
      : []);
    const [lng, lat] = coords;
    if (typeof lng === 'number' && typeof lat === 'number') {
      flyToDam(lng, lat);
    }
  };

  // Tapping a dashed route frames that dam's route and brings up the
  // drawer pre-loaded with its card.
  const handleRoutePress = (event) => {
    const slug = event?.nativeEvent?.features?.[0]?.properties?.slug;
    if (slug == null || influencingBySlug[slug] == null) return;
    const target = dams.find((dam) => dam.slug === slug);
    if (!target?.coordinates || userLocation.latitude == null) return;

    const lngs = [userLocation.longitude, target.coordinates.lng];
    const lats = [userLocation.latitude, target.coordinates.lat];
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: ROUTE_FIT_PADDING,
        duration: SELECTED_PERSON_FLY_DURATION_MS,
      },
    );

    setSelectedDam(target);
    setHazardsOpen(true);
    setSheetExpanded(false);
    refreshDams();
  };

  const handleSelectDamFromList = useCallback((dam) => {
    if (!dam?.slug) return;
    setSelectedDam(dam);
    setSheetExpanded(false);

    if (dam.coordinates) {
      flyToDam(dam.coordinates.lng, dam.coordinates.lat);
    }
  }, [flyToDam]);

  const handleStormProvincePress = (event) => {
    const feature = event?.nativeEvent?.features?.[0] ?? event;
    const signal = feature?.properties?.signal;
    const name = feature?.properties?.name;
    if (typeof signal !== "number" || signal < 1 || !name) return;
    setSelectedStormProvince({ name, signal });
    const bounds = provinceBounds(phProvinces, name);
    if (bounds) {
      cameraRef.current?.fitBounds(bounds, {
        padding: { top: 180, right: 60, bottom: 200, left: 60 },
        duration: 900,
      });
    }
  };

  // Region taps from the hazards sheet's Weather list: only active while the
  // Storm Signals overlay is toggled on (chip + camera move are map features).
  const handleSelectStormRegion = useCallback(
    (name, signal) => {
      if (!visibleLayers.stormSignals) return;
      setSelectedStormProvince({ name, signal });
      const bounds = provinceBounds(phProvinces, name);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 180, right: 60, bottom: 200, left: 60 },
          duration: 900,
        });
      }
    },
    [visibleLayers.stormSignals]
  );

  // Focus the map on a single typhoon's track (from a map marker tap or the
  // Typhoons tab list). Only active while the Typhoons overlay is on.
  const handleFocusTyphoon = useCallback(
    (typhoon) => {
      if (!visibleLayers.typhoons || !typhoon) return;
      setSelectedTyphoon(typhoon);
      const bounds = trackFitBounds(typhoon);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 180, right: 60, bottom: 220, left: 60 },
          duration: 900,
        });
      }
    },
    [visibleLayers.typhoons]
  );

  // Selecting a typhoon from the list. Turns the Tyhoon overlay on if it is
  // off, then focuses that storm (PAGASA cone + impact halos). Pressing the
  // already-selected row again deselects so the map shows nothing.
  const handleSelectTyphoon = useCallback(
    (typhoon) => {
      if (!typhoon) return;
      if (selectedTyphoon?.eventId === typhoon.eventId) {
        setSelectedTyphoon(null);
        return;
      }
      if (!visibleLayers.typhoons) {
        setVisibleLayers((prev) => ({ ...prev, typhoons: true, stormSignals: false }));
        setTyphoonLegendHidden(false);
        setStormLegendHidden(true);
      }
      setSelectedTyphoon(typhoon);
      const bounds = trackFitBounds(typhoon);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 180, right: 60, bottom: 220, left: 60 },
          duration: 900,
        });
      }
    },
    [visibleLayers.typhoons, selectedTyphoon?.eventId]
  );

  const handleTyphoonPress = (event) => {
    const feature = event?.nativeEvent?.features?.[0] ?? event;
    const typhoon = (typhoons?.typhoons ?? []).find(
      (t) => t.eventId === feature?.properties?.eventId
    );
    if (typhoon) handleFocusTyphoon(typhoon);
  };

  // Focus the map on a single LPA (from a map tap or the LPA tab list). Turns
  // the LPA overlay on if it is off.
  const handleSelectLpa = useCallback(
    (lpa) => {
      if (!lpa) return;
      if (selectedLpa?.id === lpa.id) {
        setSelectedLpa(null);
        return;
      }
      if (!visibleLayers.lpas) {
        setVisibleLayers((prev) => ({
          ...prev,
          lpas: true,
          stormSignals: false,
          typhoons: false,
        }));
        setLpaLegendHidden(false);
      }
      setSelectedLpa(lpa);
      const bounds = lpaBounds(lpa);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 180, right: 60, bottom: 220, left: 60 },
          duration: 900,
        });
      }
    },
    [visibleLayers.lpas, selectedLpa?.id]
  );

  const handleLpaPress = (event) => {
    const feature = event?.nativeEvent?.features?.[0] ?? event;
    const lpa = (lpas?.lpas ?? []).find(
      (x) => x.id === feature?.properties?.id
    );
    if (lpa) handleSelectLpa(lpa);
  };

  // Focus the map on a rain province (from a map tap or the Rain tab list).
  const handleSelectRainRegion = useCallback(
    (province) => {
      if (!province) return;
      if (selectedRainRegion?.id === province.id) {
        setSelectedRainRegion(null);
        return;
      }
      if (!visibleLayers.rain) {
        setVisibleLayers((prev) => ({
          ...prev,
          rain: true,
          stormSignals: false,
          typhoons: false,
          lpas: false,
        }));
        setRainLegendHidden(false);
      }
      setSelectedRainRegion(province);
      const bounds = provinceBounds(phProvinces, province.name);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 180, right: 60, bottom: 220, left: 60 },
          duration: 900,
        });
      }
    },
    [visibleLayers.rain, selectedRainRegion?.id]
  );

  // Return the Rain toast to the user's own area: clear any selected province
  // (falling back to "YOUR AREA") and refit the camera to their province.
  const handleResetRainRegion = useCallback(() => {
    if (!userProvinceName) return;
    setSelectedRainRegion(null);
    const bounds = provinceBounds(phProvinces, userProvinceName);
    if (bounds) {
      cameraRef.current?.fitBounds(bounds, {
        padding: { top: 180, right: 60, bottom: 220, left: 60 },
        duration: 900,
      });
    }
  }, [userProvinceName]);

  const handleRainRegionPress = (event) => {
    const feature = event?.nativeEvent?.features?.[0] ?? event;
    const name = feature?.properties?.name;
    if (!name) return;
    const province = (rainForecast?.provinces ?? []).find(
      (p) => p.name === name
    );
    if (province) handleSelectRainRegion(province);
  };

  const handleHazardsPress = () => {
    // If a weather overlay is still active and the toast is just hidden,
    // reopen the same tab/overlay context instead of resetting everything.
    if (weatherOverlaysActive && !sheetExpanded) {
      refreshDams();
      setSheetExpanded(true);
      return;
    }
    refreshDams();
    setSelectedDam(null);
    setHazardsOpen(true);
    setSheetExpanded(true);
    // Opening the panel lands on the "Near You" tab so users immediately see
    // what's relevant to them. Dam stays on (the sheet's default layer) while
    // the weather overlays are switched off; the user can reach them from the
    // tab bar.
    setActiveTab("nearYou");
    setVisibleLayers({
      dams: true,
      stormSignals: false,
      typhoons: false,
      lpas: false,
      rain: false,
    });
    setSelectedStormProvince(null);
    setSelectedTyphoon(null);
    setSelectedLpa(null);
    setSelectedRainRegion(null);
    // recentre on the user, mirroring the "Near You" tab camera behaviour
    if (userLocation?.latitude != null) {
      cameraRef.current?.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        duration: 900,
      });
    }
  };

  // Pressing any top-row pill raises the expanded toast for that tab. The
  // Weather pill auto-enables the storm-signals overlay (legend stays
  // collapsed); every other pill turns it off again. The inner overlays are
  // mutually exclusive across tabs, though the layers panel can toggle them
  // independently.
  const handleChangeTab = useCallback((key) => {
    setActiveTab(key);
    setSheetExpanded(true);
    setSelectedStormProvince(null);
    setSelectedTyphoon(null);
    setSelectedLpa(null);
    setSelectedRainRegion(null);
    if (key === "weatherBulletins") {
      setVisibleLayers((prev) => ({ ...prev, stormSignals: true, typhoons: false, lpas: false, rain: false }));
      setStormLegendHidden(true);
      setTyphoonLegendHidden(true);
      setLpaLegendHidden(true);
      setRainLegendHidden(true);
    } else if (key === "typhoons") {
      // Tropical Cyclones tab — show both cyclone tracks and any LPAs that
      // relate to them (LPAs were folded into this tab).
      setVisibleLayers((prev) => ({ ...prev, typhoons: true, lpas: true, stormSignals: false, rain: false }));
      setTyphoonLegendHidden(true);
      setStormLegendHidden(true);
      setLpaLegendHidden(true);
      setRainLegendHidden(true);
    } else if (key === "rainForecast") {
      setVisibleLayers((prev) => ({ ...prev, rain: true, stormSignals: false, typhoons: false, lpas: false }));
      setRainLegendHidden(true);
      setStormLegendHidden(true);
      setTyphoonLegendHidden(true);
      setLpaLegendHidden(true);
    } else {
      setVisibleLayers((prev) => ({ ...prev, stormSignals: false, typhoons: false, lpas: false, rain: false }));
    }

    // Move the camera toward the newly-selected overlay's area (pan/recentre
    // only — we don't zoom into a single feature). Weather tabs pull back so
    // the PAR grid is in view; Rain recentres on the user's region.
    if (key === "weatherBulletins" || key === "typhoons") {
      cameraRef.current?.fitBounds(LUZON_BOUNDS, {
        padding: { top: 140, right: 40, bottom: 220, left: 40 },
        duration: 900,
      });
    } else if (key === "rainForecast") {
      const bounds = userProvinceName
        ? provinceBounds(phProvinces, userProvinceName)
        : PAR_BOUNDS;
      cameraRef.current?.fitBounds(bounds ?? PAR_BOUNDS, {
        padding: { top: 160, right: 40, bottom: 260, left: 40 },
        duration: 900,
      });
    } else if (key === "nearYou" && userLocation?.latitude != null) {
      cameraRef.current?.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        duration: 900,
      });
    } else if (key === "dams" || key === "faultLines" || key === "volcanoes") {
      cameraRef.current?.fitBounds(PH_BOUNDS, {
        padding: { top: 120, right: 40, bottom: 220, left: 40 },
        duration: 900,
      });
    }
  }, [userProvinceName, userLocation]);

  const handleToggleLayer = useCallback((key) => {
    setVisibleLayers((prev) => ({ ...prev, [key]: !prev[key] }));
    // toggling a layer on does NOT auto-expand its legend chip — the user
    // opens a legend explicitly by tapping its pill. "Only one legend open at
    // a time" is enforced by each legend's onToggle handler in LegendStack.
    if (key === "stormSignals") {
      setSelectedStormProvince(null);
    }
    if (key === "typhoons") {
      setSelectedTyphoon(null);
    }
    if (key === "lpas") {
      setSelectedLpa(null);
    }
    if (key === "rain") {
      setSelectedRainRegion(null);
    }
  }, []);

  const handleCloseHazards = useCallback(() => {
    setSelectedDam(null);
    setHazardsOpen(false);
    // closing the sheet turns every overlay off
    setVisibleLayers({ dams: false, stormSignals: false, typhoons: false, lpas: false, rain: false });
    setSelectedStormProvince(null);
    setSelectedTyphoon(null);
    setSelectedLpa(null);
    setSelectedRainRegion(null);
  }, []);

  const handleCallPerson = (phone_number) => {
    if (!phone_number) return;
    Linking.openURL(`tel:${phone_number.replace(/\s+/g, "")}`);
  };

  const handleReportDetails = (reportId) => {
    if (reportId == null) return;
    setSelectedPerson(null);
    router.push({ pathname: "/report-detail", params: { reportId: String(reportId) } });
  };

  const handleLocatePress = async () => {
    if (locating) return;
    if (!getCachedCoords()) setLocating(true);
    try {
      const coords = await resolveCoords();
      if (!coords) return;

      cameraRef.current?.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: SELECTED_PERSON_FLY_ZOOM,
        duration: SELECTED_PERSON_FLY_DURATION_MS,
      });

      refreshFamilyLocations();
    } catch (e) {
      console.log('Failed to locate user', e);
    } finally {
      setLocating(false);
    }
  };

  // ---------------------------------------------------------------------
  return (
    <View style={styles.container}>

      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={flatMapStyle ?? MAP_STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={true}
        compassViewPosition={3}
        rotateEnabled={true}
        pitchEnabled={true}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: PH_CENTER,
            zoomLevel: 6,
          }}
          maxBounds={weatherOverlaysActive ? PAR_BOUNDS : PH_BOUNDS}
          minZoom={weatherOverlaysActive
            ? (activeId ? DAM_FLY_ZOOM : 4)
            : (activeId ? DAM_FLY_ZOOM : 6)}
          maxZoom={20}
          trackUserLocation={locationGranted ? "default" : undefined}
        />

        {mapReady && (
          <>
            {/* 3D buildings — extruded building footprints from the basemap's
                own OpenMapTiles source. Rendered FIRST (bottom of the layer
                stack) so they never occlude the markers above them: family
                member dots, dispatched/public team indicators, routes, the
                user-location dot, or the hazard overlays.

                Only renders at zoom ≥ 14 so the extrusions don't appear as
                noise at city-level views. When the user tilts the map,
                buildings rise up with their real (or fallback) height, giving
                the map a tangible 3-D feel. */}
            {mapReady && (
              <VectorSource
                id="maptilerBuildings"
                url={`https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_API_KEY}`}
                minzoom={14}
                maxzoom={18}
              >
                <Layer
                  id="buildings3d"
                  type="fill-extrusion"
                  source-layer="building"
                  minzoom={14}
                  maxzoom={18}
                  layout={{
                    "fill-extrusion-height": [
                      "coalesce",
                      ["get", "render_height"],
                      ["get", "height"],
                      10,
                    ],
                    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                  }}
                  paint={{
                    "fill-extrusion-color": [
                      "interpolate",
                      ["linear"],
                      ["coalesce", ["get", "render_height"], ["get", "height"], 10],
                      0,   "#e0e7ee",
                      20,  "#c8d6e0",
                      60,  "#a0b4c4",
                      120, "#7a98b0",
                    ],
                    "fill-extrusion-opacity": 0.85,
                  }}
                />
              </VectorSource>
            )}
            {visibleLayers.stormSignals &&
              stormSignals &&
              !stormSignals.unavailable && (
              <GeoJSONSource id="stormSignalsSource" data={stormSignalsGeojson} onPress={handleStormProvincePress}>
                <Layer
                  type="fill"
                  id="stormSignalsFill"
                  paint={{
                    'fill-color': [
                      'match',
                      ['get', 'signal'],
                      1, '#00aaff',
                      2, '#fff200',
                      3, '#ffaa00',
                      4, '#ff0000',
                      5, '#cd00cd',
                      'rgba(0,0,0,0)',
                    ],
                    'fill-opacity': 0.4,
                  }}
                />
                <Layer
                  type="line"
                  id="stormSignalsLine"
                  paint={{
                    'line-color': 'rgba(255,255,255,0.8)',
                    'line-width': 1,
                  }}
                />
                <Layer
                  type="symbol"
                  id="stormSignalsLabel"
                  filter={['>', ['get', 'signal'], 0]}
                  layout={{
                    'text-field': ['get', 'signal'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-allow-overlap': false,
                  }}
                  paint={{
                    'text-color': '#ffffff',
                    'text-halo-color': '#111827',
                    'text-halo-width': 1.5,
                  }}
                />
                {selectedStormProvince && (
                  <Layer
                    type="line"
                    id="stormSignalHighlight"
                    filter={['==', ['get', 'name'], selectedStormProvince.name]}
                    paint={{
                      'line-color': '#111827',
                      'line-width': 3,
                      'line-opacity': 0.95,
                    }}
                  />
                )}
              </GeoJSONSource>
            )}

            {visibleLayers.typhoons &&
              typhoons &&
              !typhoons.unavailable &&
              selectedTyphoon && (
              <GeoJSONSource id="typhoonsSource" data={typhoonsGeojson} onPress={handleTyphoonPress}>
                {/* PAR boundary */}
                <Layer
                  type="line"
                  id="typhoonsParLine"
                  filter={['==', ['get', 'kind'], 'par']}
                  paint={{ 'line-color': '#0EA5E9', 'line-width': 1.5, 'line-dasharray': [5, 4], 'line-opacity': 0.5 }}
                />
                {/* uncertainty cone: soft envelope fill + subtle edge */}
                <Layer
                  type="fill"
                  id="typhoonsConeFill"
                  filter={['==', ['get', 'kind'], 'cone']}
                  paint={{
                    'fill-color': '#FACC15',
                    'fill-opacity': 0.12,
                    'fill-outline-color': '#CA8A04',
                  }}
                />
                {/* wind footprint fills */}
                <Layer
                  type="fill"
                  id="typhoonsFootprintRed"
                  filter={['==', ['get', 'kind'], 'footprint_red']}
                  paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.22 }}
                />
                <Layer
                  type="fill"
                  id="typhoonsFootprintOrange"
                  filter={['==', ['get', 'kind'], 'footprint_orange']}
                  paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.22 }}
                />
                <Layer
                  type="fill"
                  id="typhoonsFootprintGreen"
                  filter={['==', ['get', 'kind'], 'footprint_green']}
                  paint={{ 'fill-color': '#22c55e', 'fill-opacity': 0.22 }}
                />
                <Layer
                  type="fill"
                  id="typhoonsWindRadius"
                  filter={['==', ['get', 'kind'], 'windradius']}
                  paint={{ 'fill-color': '#0EA5E9', 'fill-opacity': 0.08 }}
                />
                {/* impact halo: transparent fill + dashed intensity-colored ring */}
                <Layer
                  type="fill"
                  id="typhoonsHaloFill"
                  filter={['==', ['get', 'kind'], 'halo']}
                  paint={{
                    'fill-color': [
                      'match',
                      ['get', 'intensity'],
                      'superTyphoon', '#9b1c31',
                      'severeTyphoon', '#b91c1c',
                      'typhoon', '#e11d48',
                      'severeStorm', '#f97316',
                      'tropicalStorm', '#f59e0b',
                      'depression', '#60a5fa',
                      '#0EA5E9',
                    ],
                    'fill-opacity': 0.1,
                  }}
                />
                <Layer
                  type="line"
                  id="typhoonsHaloRingCasing"
                  filter={['==', ['get', 'kind'], 'haloRing']}
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 6,
                    'line-opacity': 0.5,
                    'line-dasharray': [4, 3],
                  }}
                />
                <Layer
                  type="line"
                  id="typhoonsHaloRingLine"
                  filter={['==', ['get', 'kind'], 'haloRing']}
                  paint={{
                    'line-color': [
                      'match',
                      ['get', 'intensity'],
                      'superTyphoon', '#9b1c31',
                      'severeTyphoon', '#b91c1c',
                      'typhoon', '#e11d48',
                      'severeStorm', '#f97316',
                      'tropicalStorm', '#f59e0b',
                      'depression', '#60a5fa',
                      '#0EA5E9',
                    ],
                    'line-width': 2.5,
                    'line-opacity': 0.75,
                    'line-dasharray': [4, 3],
                  }}
                />
                {/* track lines: solid past, dashed forecast (white casing lifts
                    them off the basemap) */}
                <Layer
                  type="line"
                  id="typhoonsForecastLineCasing"
                  filter={['==', ['get', 'segment'], 'forecast']}
                  paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.55 }}
                />
                <Layer
                  type="line"
                  id="typhoonsForecastLine"
                  filter={['==', ['get', 'segment'], 'forecast']}
                  paint={{
                    'line-color': '#0EA5E9',
                    'line-width': 2.5,
                    'line-dasharray': [2, 1.5],
                    'line-opacity': 0.9,
                  }}
                />
                <Layer
                  type="line"
                  id="typhoonsPastLineCasing"
                  filter={['==', ['get', 'segment'], 'past']}
                  paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.55 }}
                />
                <Layer
                  type="line"
                  id="typhoonsPastLine"
                  filter={['==', ['get', 'segment'], 'past']}
                  paint={{
                    'line-color': '#475569',
                    'line-width': 2.5,
                    'line-opacity': 0.85,
                  }}
                />
                {/* eye impact ring: small red halo (transparent fill + dashed
                    red dashed outline) + tiny center dot */}
                <Layer
                  type="fill"
                  id="typhoonsEyeHaloFill"
                  filter={['==', ['get', 'kind'], 'eye']}
                  paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.15 }}
                />
                <Layer
                  type="line"
                  id="typhoonsEyeRingCasing"
                  filter={['==', ['get', 'kind'], 'eyeRing']}
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 6,
                    'line-opacity': 0.5,
                    'line-dasharray': [3, 2],
                  }}
                />
                <Layer
                  type="line"
                  id="typhoonsEyeRingLine"
                  filter={['==', ['get', 'kind'], 'eyeRing']}
                  paint={{
                    'line-color': '#ef4444',
                    'line-width': 2.5,
                    'line-opacity': 0.85,
                    'line-dasharray': [3, 2],
                  }}
                />
                <Layer
                  type="circle"
                  id="typhoonsEyeDot"
                  filter={['==', ['get', 'kind'], 'eyeDot']}
                  paint={{
                    'circle-radius': 4,
                    'circle-color': '#ef4444',
                    'circle-opacity': 0.95,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff',
                  }}
                />
                {/* PAGASA-style category markers: hollow ring + letter at each
                    track point (STY / TY / T / STS / S / D / L) */}
                <Layer
                  type="circle"
                  id="typhoonsMarkerRing"
                  filter={['has', 'marker']}
                  paint={{
                    'circle-radius': 12,
                    'circle-color': 'rgba(255,255,255,0.92)',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': [
                      'match',
                      ['get', 'intensity'],
                      'superTyphoon', '#9b1c31',
                      'severeTyphoon', '#b91c1c',
                      'typhoon', '#e11d48',
                      'severeStorm', '#f97316',
                      'tropicalStorm', '#f59e0b',
                      'depression', '#60a5fa',
                      '#0EA5E9',
                    ],
                  }}
                />
                <Layer
                  type="symbol"
                  id="typhoonsMarkerText"
                  filter={['has', 'marker']}
                  style={{
                    textField: ['get', 'marker'],
                    textSize: 11,
                    textAnchor: 'center',
                    textAllowOverlap: true,
                  }}
                  paint={{
                    textColor: [
                      'match',
                      ['get', 'intensity'],
                      'superTyphoon', '#9b1c31',
                      'severeTyphoon', '#b91c1c',
                      'typhoon', '#e11d48',
                      'severeStorm', '#f97316',
                      'tropicalStorm', '#f59e0b',
                      'depression', '#60a5fa',
                      '#0EA5E9',
                    ],
                    textHaloColor: '#ffffff',
                    textHaloWidth: 2,
                  }}
                />
                {/* PAGASA-style forecast-hour labels (24H / 36H / ...) */}
                <Layer
                  type="symbol"
                  id="typhoonsHourLabel"
                  filter={['has', 'label']}
                  style={{
                    textField: ['get', 'label'],
                    textSize: 10,
                    textAnchor: 'bottom',
                    textOffset: [0, -1.1],
                    textAllowOverlap: true,
                  }}
                  paint={{
                    textColor: '#0369A1',
                    textHaloColor: '#ffffff',
                    textHaloWidth: 2,
                    textHaloBlur: 1,
                  }}
                />
              </GeoJSONSource>
            )}

            {visibleLayers.lpas && lpas && !lpas.unavailable && (
              <GeoJSONSource id="lpasSource" data={lpasGeojson} onPress={handleLpaPress}>
                {/* hollow circle casing (lifts the yellow outline off the
                    basemap) */}
                <Layer
                  type="line"
                  id="lpasCircleCasing"
                  filter={['==', ['get', 'kind'], 'lpaCircle']}
                  paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.7 }}
                />
                <Layer
                  type="line"
                  id="lpasCircleLine"
                  filter={['==', ['get', 'kind'], 'lpaCircle']}
                  paint={{ 'line-color': '#FACC15', 'line-width': 3, 'line-opacity': 1 }}
                />
                {/* PAR boundary */}
                <Layer
                  type="line"
                  id="lpasParLine"
                  filter={['==', ['get', 'kind'], 'par']}
                  paint={{ 'line-color': '#0EA5E9', 'line-width': 1.5, 'line-dasharray': [5, 4], 'line-opacity': 0.5 }}
                />
              </GeoJSONSource>
            )}

            {visibleLayers.rain && rainForecast && !rainForecast.unavailable && (
              <GeoJSONSource id="rainSource" data={rainGeojson} onPress={handleRainRegionPress}>
                {/* region fill tinted by today's rainfall */}
                <Layer
                  type="fill"
                  id="rainRegionFill"
                  paint={{
                    'fill-color': [
                      'case',
                      ['==', ['get', 'rainMm'], 0], '#E5E7EB',
                      ['<', ['get', 'rainMm'], 26], '#93C5FD',
                      ['<', ['get', 'rainMm'], 50], '#3B82F6',
                      ['<', ['get', 'rainMm'], 100], '#F59E0B',
                      '#DC2626',
                    ],
                    'fill-opacity': 0.45,
                  }}
                />
                {/* region borders */}
                <Layer
                  type="line"
                  id="rainRegionLine"
                  paint={{ 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 }}
                />
                {/* selected region highlight outline */}
                {selectedRainRegion && (
                  <Layer
                    type="line"
                    id="rainRegionHighlight"
                    filter={['==', ['get', 'name'], selectedRainRegion.name]}
                    paint={{ 'line-color': '#111827', 'line-width': 3, 'line-opacity': 0.9 }}
                  />
                )}
              </GeoJSONSource>
            )}

            <GeoJSONSource
              id="userLocationSource"
              data={familyGeojson}
              onPress={handleUserLocationPress}
            >
              <Layer
                type="circle"
                id="userLocationLayer"
                paint={{
                  'circle-color': staleColorExpr,
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    5, 2,
                    10, 5,
                    16, 8,
                  ],
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                  'circle-opacity': 0.9,
                }}
              />
              <Layer
                type="symbol"
                id="userLocationLabel"
                layout={{
                  'text-field': ['get', 'first_name'],
                  'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  'text-size': 11,
                  'text-offset': [0, 1.8],
                  'text-anchor': 'top',
                  'text-allow-overlap': false,
                }}
                paint={{
                  'text-color': '#1e40af',
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 1.5,
                  'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
                }}
              />
            </GeoJSONSource>

            <GeoJSONSource id="pulseSource" data={familyGeojson}>
              <Layer
                type="circle"
                id="pulseLayer"
                paint={{
                  'circle-color': staleColorExpr,
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    5, 2 + pulse * 20,
                    10, 5 + pulse * 20,
                    16, 8 + pulse * 20,
                  ],
                  'circle-opacity': Math.max(0.5 - pulse, 0),
                  'circle-stroke-width': 0,
                }}
              />
            </GeoJSONSource>

            {/* dispatched response team markers — blue with white outline */}
            {teamGeojson.features.length > 0 && (
              <GeoJSONSource id="dispatchTeamSource" data={teamGeojson}>
                <Layer
                  type="circle"
                  id="dispatchTeamPulse"
                  paint={{
                    'circle-color': '#3b82f6',
                    'circle-radius': [
                      'interpolate', ['linear'], ['zoom'],
                      8, 6 + teamPulse * 30,
                      12, 9 + teamPulse * 30,
                      16, 12 + teamPulse * 30,
                    ],
                    'circle-opacity': Math.max(0.6 - teamPulse * 0.6, 0),
                    'circle-stroke-width': 0,
                  }}
                />
                <Layer
                  type="circle"
                  id="dispatchTeamLayer"
                  paint={{
                    'circle-color': '#3b82f6',
                    'circle-radius': [
                      'interpolate', ['linear'], ['zoom'],
                      8, 4,
                      12, 6,
                      16, 8,
                    ],
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.95,
                  }}
                />
                <Layer
                  type="symbol"
                  id="dispatchTeamLabel"
                  layout={{
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 11,
                    'text-offset': [0, 1.8],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                  }}
                  paint={{
                    'text-color': '#1e40af',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                  }}
                />
              </GeoJSONSource>
            )}

            {/* marching-ants route lines from team base to cluster */}
            {routesGeojson.features.length > 0 && (
              <GeoJSONSource id="citizenRoutesSource" data={routesGeojson}>
                <RouteDashLayer />
              </GeoJSONSource>
            )}

            {/* team starting point markers — shelter icon, orange (busy), with name label */}
            {teamStartingPointGeojson.features.length > 0 && (
              <GeoJSONSource id="teamStartingPointSource" data={teamStartingPointGeojson}>
                <Layer
                  type="circle"
                  id="teamStartCircle"
                  paint={{
                    'circle-color': '#ffffff',
                    'circle-radius': [
                      'interpolate', ['linear'], ['zoom'],
                      8, 8,
                      12, 12,
                      16, 16,
                      20, 20,
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': TEAM_DISPATCH_COLOR,
                    'circle-opacity': 0.9,
                  }}
                />
                <Layer
                  type="symbol"
                  id="teamStartIcon"
                  layout={{
                    'icon-image': 'shelter',
                    'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 1, 16, 1.2, 20, 1.4],
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{
                    'icon-color': TEAM_DISPATCH_COLOR,
                  }}
                />
                <Layer
                  type="symbol"
                  id="teamStartLabel"
                  layout={{
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 11,
                    'text-offset': [0, 1.8],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                  }}
                  paint={{
                    'text-color': TEAM_DISPATCH_COLOR,
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                    'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
                  }}
                />
              </GeoJSONSource>
            )}

            {/* public team markers — blue circle with shelter icon */}
            {publicTeamGeojson.features.length > 0 && (
              <GeoJSONSource id="publicTeamSource" data={publicTeamGeojson}>
                <Layer
                  type="circle"
                  id="publicTeamCircle"
                  paint={{
                    'circle-color': '#ffffff',
                    'circle-radius': [
                      'interpolate', ['linear'], ['zoom'],
                      8, 8,
                      12, 12,
                      16, 16,
                      20, 20,
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': PUBLIC_TEAM_COLOR,
                    'circle-opacity': 0.9,
                  }}
                />
                <Layer
                  type="symbol"
                  id="publicTeamIcon"
                  layout={{
                    'icon-image': 'shelter',
                    'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 1, 16, 1.2, 20, 1.4],
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{
                    'icon-color': PUBLIC_TEAM_COLOR,
                  }}
                />
                <Layer
                  type="symbol"
                  id="publicTeamLabel"
                  layout={{
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 11,
                    'text-offset': [0, 1.8],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                  }}
                  paint={{
                    'text-color': PUBLIC_TEAM_COLOR,
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                    'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
                  }}
                />
              </GeoJSONSource>
            )}

            {visibleLayers.dams && (
              <>
                <GeoJSONSource id="nearestRouteSource" data={nearestRouteGeojson} onPress={handleRoutePress}>
                  <Layer
                    type="line"
                    id="nearestRouteLayer"
                    paint={{
                      'line-color': DAM_MARKER_COLOR,
                      'line-width': 1.5,
                      'line-opacity': 0.6,
                      'line-dasharray': [2, 1.5],
                    }}
                  />
                </GeoJSONSource>

                {/* Expanding ring for danger dams only */}
                <GeoJSONSource id="damsPulseSource" data={damsGeojson}>
                  <Layer
                    type="circle"
                    id="damsPulseLayer"
                    filter={['==', ['get', 'severity'], 'danger']}
                    paint={{
                      'circle-color': SEVERITY_LEVELS.danger.color,
                      'circle-radius': [
                        'interpolate', ['linear'], ['zoom'],
                        5, damPulseStop(2.5, 14),
                        10, damPulseStop(4, 20),
                        16, damPulseStop(5, 24),
                      ],
                      'circle-opacity': Math.max(0.45 - damPulse.danger * 0.45, 0),
                      'circle-stroke-width': 0,
                    }}
                  />
                </GeoJSONSource>

                {/* Icon markers for each dam */}
                {dams.filter((d) => d.coordinates).map((dam) => (
                  <DamMarker key={dam.slug} dam={dam} onPress={handleDamPress} />
                ))}
              </>
            )}
          </>
        )}

        {locationGranted && (
          <NativeUserLocation
            androidRenderMode="gps"
          />
        )}

        {/* hazard overlay — exactly one at a time (picked in the layers
            sheet). key={activeId} unmounts the previous layer's source and
            tiles the moment the selection changes. Streams for the visible
            area, or uses its local archive once downloaded. */}
        {mapReady && activeId != null && (
          <HazardLayerOverlay key={activeId} layerId={activeId} />
        )}
      </Map>

      <TouchableOpacity
        style={styles.hazardsButton}
        onPress={handleHazardsPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open hazards drawer"
      >
        <Ionicons name="warning-outline" size={18} color="#E32F31" />
        <Text style={styles.hazardsButtonText}>Monitor</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.locateButton}
        onPress={handleLocatePress}
        activeOpacity={0.7}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator size="small" color="#4287f5" />
        ) : (
          <Ionicons name="locate" size={24} color="#4287f5" />
        )}
      </TouchableOpacity>

      <View style={styles.layersButtonWrap}>
        <TouchableOpacity
          style={styles.layersButton}
          onPress={() => setLayersOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="layers" size={24} color="#4287f5" />
        </TouchableOpacity>
        {activeId && <View style={styles.layersDot} />}
      </View>

      {/* legend pills stack vertically (bottom-left) when multiple overlays
          are toggled at once; each collapses to its own chip */}
      <LegendStack>
        <HazardLayerLegend
          activeId={activeId}
          hidden={legendHidden}
          onToggle={handleToggleLegend}
        />
        {visibleLayers.stormSignals && (
          <StormSignalLegend
            hidden={stormLegendHidden}
            onToggle={() => {
              if (stormLegendHidden) {
                setTyphoonLegendHidden(true);
                setLpaLegendHidden(true);
                setRainLegendHidden(true);
              }
              setStormLegendHidden(!stormLegendHidden);
            }}
          />
        )}
        {visibleLayers.typhoons && (
          <TyphoonLegend
            hidden={typhoonLegendHidden}
            onToggle={() => {
              if (typhoonLegendHidden) {
                setStormLegendHidden(true);
                setLpaLegendHidden(true);
                setRainLegendHidden(true);
              }
              setTyphoonLegendHidden(!typhoonLegendHidden);
            }}
          />
        )}
        {visibleLayers.lpas && (
          <LPALegend
            hidden={lpaLegendHidden}
            onToggle={() => {
              if (lpaLegendHidden) {
                setStormLegendHidden(true);
                setTyphoonLegendHidden(true);
                setRainLegendHidden(true);
              }
              setLpaLegendHidden(!lpaLegendHidden);
            }}
          />
        )}
        {visibleLayers.rain && (
          <RainLegend
            hidden={rainLegendHidden}
            onToggle={() => {
              if (rainLegendHidden) {
                setStormLegendHidden(true);
                setTyphoonLegendHidden(true);
                setLpaLegendHidden(true);
              }
              setRainLegendHidden(!rainLegendHidden);
            }}
          />
        )}
      </LegendStack>

      {selectedStormProvince && (
        <View style={styles.stormProvinceChip}>
          <View
            style={[
              styles.stormProvinceSwatch,
              { backgroundColor: PAGASA_TCWS_COLORS[selectedStormProvince.signal] },
            ]}
          />
          <Text style={styles.stormProvinceChipText} numberOfLines={1}>
            {selectedStormProvince.name} - Signal #{selectedStormProvince.signal} (
            {PAGASA_TCWS_LABELS[selectedStormProvince.signal]})
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedStormProvince(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close province details"
          >
            <Ionicons name="close" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}


      {selectedTyphoon && (
        <View style={styles.stormProvinceChip}>
          <View
            style={[
              styles.stormProvinceSwatch,
              {
                backgroundColor:
                  INTENSITY_COLORS[
                    statusKeyFromWindspeed(
                      selectedTyphoon.current?.windspeed ??
                        selectedTyphoon.overallWindspeed
                    )
                  ] ?? INTENSITY_COLORS.unknown,
              },
            ]}
          />
          <Text style={styles.stormProvinceChipText} numberOfLines={1}>
            {selectedTyphoon.name ??
              `Cyclone ${selectedTyphoon.eventId}`}
            {selectedTyphoon.current?.windspeed != null
              ? ` · ${Math.round(selectedTyphoon.current.windspeed)} km/h`
              : ""}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedTyphoon(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close typhoon details"
          >
            <Ionicons name="close" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      {selectedLpa && (
        <View style={styles.stormProvinceChip}>
          <View style={[styles.stormProvinceSwatch, { backgroundColor: '#0EA5E9' }]} />
          <Text style={styles.stormProvinceChipText} numberOfLines={1}>
            {selectedLpa.name}
            {selectedLpa.pressure != null
              ? ` · ${selectedLpa.pressure} hPa`
              : ""}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedLpa(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close LPA details"
          >
            <Ionicons name="close" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      {selectedRainRegion && (
        <View style={styles.stormProvinceChip}>
          <View style={[styles.stormProvinceSwatch, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.stormProvinceChipText} numberOfLines={1}>
            {selectedRainRegion.name} · Week: {selectedRainRegion.weekTotal ?? 0} mm
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedRainRegion(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close rain region details"
          >
            <Ionicons name="close" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      <HazardLayersPanel
        visible={layersOpen}
        onClose={() => setLayersOpen(false)}
        activeId={activeId}
        onSelect={selectHazardLayer}
        onAskAI={handleAskAI}
        visibleLayers={visibleLayers}
        onToggleLayer={handleToggleLayer}
      />

      {selectedPerson && (
        <PersonCard
          age={selectedPerson.age}
          first_name={selectedPerson.first_name}
          last_name={selectedPerson.last_name}
          phone_number={selectedPerson.phone_number}
          relation={selectedPerson.relation}
          user_id={selectedPerson.user_id}
          last_seen={selectedPerson.last_seen}
          has_active_report={Boolean(selectedPerson.has_active_report)}
          report_id={selectedPerson.active_report_id}
          staleYellowThresholdMs={STALE_YELLOW_THRESHOLD_MS}
          staleGrayThresholdMs={STALE_GRAY_THRESHOLD_MS}
          onClose={handleClosePersonCard}
          onCall={handleCallPerson}
          onDetails={handleReportDetails}
        />
      )}

      {!typhoonDismissed && activeTyphoon && (
        <TyphoonAlertBanner
          typhoon={activeTyphoon}
          onDismiss={handleTyphoonDismiss}
          onViewDetails={handleTyphoonViewDetails}
          onAskPreparedness={handleTyphoonAskPreparedness}
        />
      )}

      <DispatchNotificationBar
        dispatches={dispatches}
        cancelledDispatches={cancelledDispatches}
        style={activeTyphoon && !typhoonDismissed ? { top: 160 } : undefined}
      />

      {showReportBar && (
        <ReportSubmittedBar
          report={{ reportId: activeReport.reportId }}
          onViewDetails={handleReportViewDetails}
          onCancel={handleReportCancel}
          style={{ top: dispatches.length > 0 ? 300 : 35 }}
        />
      )}

      {sosReceivedVariant && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSosReceivedVariant(null)}
        >
          <SosReceivedOverlay
            variant={sosReceivedVariant}
            onDone={() => setSosReceivedVariant(null)}
          />
        </Modal>
      )}

      {hazardsOpen && !selectedDam && (
        <HazardTabs
          activeTab={activeTab}
          onChangeTab={handleChangeTab}
          dams={dams}
          userLocation={userLocation}
          nearestSlug={nearestDamSlug}
          influencingSlugs={
            influencingSlugs.length > 0 ? influencingSlugs : EMPTY_SLUGS
          }
          onSelectDam={handleSelectDamFromList}
        />
      )}

      {(selectedDam || hazardsOpen) && (
        <HazardSheet
          key={selectedDam?.slug ?? 'drawer'}
          dams={dams}
          userLocation={userLocation}
          nearestSlug={nearestDamSlug}
          influencingSlugs={
            influencingSlugs.length > 0 ? influencingSlugs : EMPTY_SLUGS
          }
          userElevation={userElevation}
          dam={selectedDam}
          activeTab={activeTab}
          expanded={sheetExpanded}
          onExpandedChange={setSheetExpanded}
          onChangeTab={handleChangeTab}
          onSelectDam={handleSelectDamFromList}
          onClose={handleCloseHazards}
          stormSignals={stormSignals}
          stormSignalsLoading={stormSignals == null && !stormSignalsError}
          signalByProvince={signalByProvince}
          overlayVisible={visibleLayers.stormSignals || visibleLayers.typhoons || visibleLayers.lpas || visibleLayers.rain}
          onSelectStormRegion={handleSelectStormRegion}
          typhoons={typhoons}
          typhoonsLoading={typhoons == null && !typhoonsError}
          selectedTyphoonEventId={selectedTyphoon?.eventId ?? null}
          onSelectTyphoon={handleSelectTyphoon}
          lpas={lpas}
          lpasLoading={lpas == null && !lpasError}
          selectedLpaId={selectedLpa?.id ?? null}
          onSelectLpa={handleSelectLpa}
          rainForecast={rainForecast}
          rainLoading={rainForecast == null && !rainError}
          selectedRainRegionId={selectedRainRegion?.id ?? null}
          onSelectRainRegion={handleSelectRainRegion}
          onResetRainRegion={handleResetRainRegion}
          userProvinceName={userProvinceName}
          userRainProvince={userRainProvince}
          userSignalLevel={userSignalLevel}
        />
      )}

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dropdownWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  text: {
    color: "#f3eee3ff",
  },
  button: {
    textDecorationLine: 'underline',
    fontSize: 20,
    color: 'blue'
  },
  map: { flex: 1 },
  locateButton: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  // sits directly above the GPS/locate button, right-aligned
  layersButtonWrap: {
    position: 'absolute',
    bottom: 92,
    right: 16,
  },
  layersButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  layersDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#208AEF',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  // Red pill, bottom-left — opens the hazards drawer (dam statuses).
  hazardsButton: {
    position: 'absolute',
    left: 16,
    bottom: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  hazardsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E32F31',
  },
  locateButtonIcon: {
    fontSize: 22,
    color: '#4287f5',
  },
  stormProvinceChip: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  stormProvinceSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    flexShrink: 0,
  },
  stormProvinceChipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    includeFontPadding: false,
  },
});
