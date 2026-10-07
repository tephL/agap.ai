import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, Camera, NativeUserLocation, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// adjust this import to wherever fetchClustersWithinLocation actually lives
import { fetchClustersWithinLocation, fetchClusterReports } from '../../services/dispatcher/clusterServ.js';
import { getTeams, cancelAssignment, getAssignmentForTeam } from '../../services/teamService';
import { getRouteCoordinates } from '../../services/routeService';
import { useCluster } from '../../context/ClusterContext';
import ClusterDetailsWindow from '../../components/dispatcher/ClusterDetailsWindow';
import TeamDetailsWindow from '../../components/dispatcher/TeamDetailsWindow';
import AssignTeamModal from '../../components/dispatcher/AssignTeamModal';
import AssignSuccessModal from '../../components/dispatcher/AssignSuccessModal';
import useLiveLocation from '../../hooks/useLiveLocation.js';
import { useFlatMapStyle } from '../../hooks/useFlatMapStyle';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const PH_BOUNDS = [116.9, 4.5, 126.6, 21.2];
const PH_CENTER = [121.7740, 12.8797];
const MAP_STYLE_URL = `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_API_KEY}`;

const LOCATE_ZOOM = 15;
const LOCATE_FLY_DURATION_MS = 1000;
const CLUSTERS_FETCH_INTERVAL_MS = 1000 * 5; // 5 sec

// radar-style pulse loop for cluster halos: ~18fps ticks, full cycle ~1s
const PULSE_TICK_MS = 55;
const PULSE_STEP = 0.06;

// where the camera settles when a cluster is expanded
const CLUSTER_FOCUS_ZOOM = 15;
const CLUSTER_FOCUS_DURATION_MS = 800;
// pushes the visual center upward so the cluster sits in the
// upper-middle of the screen instead of behind the details window
const CLUSTER_FOCUS_PADDING = { top: 80, right: 0, bottom: 400, left: 0 };

// marching-ants steps for planned-route lines: cycling through these dash
// patterns makes the dashes flow along each line's direction, i.e. from
// the team base toward its assigned cluster; stepped off the shared
// pulsePhase clock (~8 frames per ~1s cycle)
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

const CLUSTER_PRIORITY_COLOR_EXPR = [
  'match',
  ['get', 'priority'],
  'critical', '#991B1B',
  'high', '#ef4444',
  'medium', '#eab308',
  'low', '#22c55e',
  '#a9a9a9', // fallback for unknown priority
];

// individual reports inside an expanded cluster, colored by status
const REPORT_STATUS_COLOR_EXPR = [
  'match',
  ['get', 'status'],
  'open', '#ef4444',
  'saved', '#eab308',
  'resolved', '#22c55e',
  '#a9a9a9', // fallback for unknown status
];

// teams, light blue while available and orange once dispatched (busy)
const TEAM_STATUS_COLOR_EXPR = [
  'match',
  ['get', 'status'],
  'available', '#60a5fa',
  'busy', '#f97316',
  '#a9a9a9', // fallback for offline/unknown
];

// ---------------------------------------------------------------------------
// PulseClusterLayer — self-contained animated halo, isolated from parent re-renders
// ---------------------------------------------------------------------------

const PulseClusterLayer = React.memo(function PulseClusterLayer() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + PULSE_STEP) % 1), PULSE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const scale = 1 + 1.6 * phase;
  const fade = 1 - phase;

  return (
    <Layer
      type="circle"
      id="clustersPulseLayer"
      paint={{
        'circle-color': CLUSTER_PRIORITY_COLOR_EXPR,
        'circle-opacity': 0.3 * fade,
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          5, 4 * scale,
          10, 8 * scale,
          16, 14 * scale,
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': CLUSTER_PRIORITY_COLOR_EXPR,
        'circle-stroke-opacity': 0.55 * fade,
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// RouteDashLayer — animated marching-ants dashes, isolated from parent re-renders
// ---------------------------------------------------------------------------

const RouteDashLayer = React.memo(function RouteDashLayer() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + PULSE_STEP) % 1), PULSE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const dashArray =
    ROUTE_DASH_SEQUENCE[Math.floor(phase * ROUTE_DASH_SEQUENCE.length) % ROUTE_DASH_SEQUENCE.length];

  return (
    <>
      <Layer
        type="line"
        id="routesCasingLayer"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
          'line-opacity': 0.6,
        }}
      />
      <Layer
        type="line"
        id="routesLayer"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#f97316',
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
  const router = useRouter();

  // location / permissions
  const { locationGranted, getCachedCoords, resolveCoords } = useLiveLocation();
  const [locating, setLocating] = useState(false);
  // while true the camera tracks the user's position; any programmatic
  // flight to a pin must turn it off first or tracking yanks the camera
  // back to the user on the next GPS fix
  const [followsUser, setFollowsUser] = useState(true);

  // flat basemap — no 3-D terrain; fetches the style once and strips it
  const flatMapStyle = useFlatMapStyle(MAP_STYLE_URL);

  // cluster markers state
  const [clusters, setClusters] = useState([]);

  // team markers state
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  // planned routes for dispatched teams: team_id -> LineString coordinates
  const [teamRoutes, setTeamRoutes] = useState({});

  // expanded cluster state (reports shown on map + details window)
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [clusterReports, setClusterReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  // populated right after a successful assign, drives the done popup
  const [assignSuccess, setAssignSuccess] = useState(null);

  // map lifecycle state
  const [mapReady, setMapReady] = useState(false);
  const cameraRef = useRef(null);
  const handledFocusRef = useRef(0);
  // guards the one-time auto-zoom so it runs only on the first location fix
  const hasAutoZoomedRef = useRef(false);
  const handledTeamFocusRef = useRef(0);

  // ---- clusters + teams fetch loop ---------------------------------------

  // team.jsx reads the selected cluster across tabs; focusNonce marks
  // explicit focus requests coming from the Reports tab, clustersNonce
  // marks cluster mutations (resolve/assign) done in other tabs,
  // focusTeamNonce marks "go to this team" requests (Teams tab)
  const {
    activeClusterId,
    setActiveClusterId,
    focusNonce,
    clustersNonce,
    invalidateClusters,
    focusTeamId,
    focusTeamNonce,
  } = useCluster();

  // ---- clusters + teams fetch loop ---------------------------------------
  const refreshClusters = useCallback(async () => {
    try {
      const [{ data }, teamList] = await Promise.all([
        fetchClustersWithinLocation(),
        getTeams(),
      ]);
      setClusters(data ?? []);
      setTeams(teamList ?? []);
    } catch (e) {
      console.log('failed to fetch clusters', e);
    }
  }, []);

  useEffect(() => {
    refreshClusters();
    const interval = setInterval(refreshClusters, CLUSTERS_FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshClusters]);

  // another tab just resolved a cluster / dispatched a team — refetch
  // right away so the pin disappears the moment it's resolved instead
  // of waiting for the next poll tick
  useEffect(() => {
    if (clustersNonce === 0) return;
    refreshClusters();
  }, [clustersNonce, refreshClusters]);

  // ---- planned routes: dispatched team base -> assigned cluster ----------
  const activeDispatches = useMemo(() => {
    return teams
      .filter(
        (t) =>
          t.assigned_to != null &&
          typeof t.lat === 'number' &&
          typeof t.lng === 'number' &&
          !Number.isNaN(t.lat) &&
          !Number.isNaN(t.lng)
      )
      .map((team) => {
        const cluster = clusters.find(
          (c) => c.cluster_id === team.assigned_to
        );
        if (
          !cluster ||
          typeof cluster.latitude !== 'number' ||
          typeof cluster.longitude !== 'number' ||
          Number.isNaN(cluster.latitude) ||
          Number.isNaN(cluster.longitude)
        ) {
          return null;
        }
        return {
          teamId: team.team_id,
          from: [team.lng, team.lat],
          to: [cluster.longitude, cluster.latitude],
        };
      })
      .filter(Boolean);
  }, [teams, clusters]);

  // content signature so the 1-min poll doesn't refetch identical routes;
  // includes coordinates so a moved team base re-requests its path
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

  // ---- derived geojson for cluster markers --------------------------------
  const clustersGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: clusters
        .filter(
          (c) =>
            typeof c.latitude === 'number' &&
            typeof c.longitude === 'number' &&
            !Number.isNaN(c.latitude) &&
            !Number.isNaN(c.longitude)
        )
        // empty clusters are cleaned up server-side; hide any stale ones
        // still cached between refreshes so they never render a pin
        .filter((c) => (c.report_count ?? 0) > 0)
        .map((cluster, index) => ({
          type: 'Feature',
          id: `cluster-${cluster.city}-${index}`,
          geometry: {
            type: 'Point',
            coordinates: [cluster.longitude, cluster.latitude],
          },
          properties: {
            cluster_id: cluster.cluster_id,
            city: cluster.city,
            priority: cluster.priority_level,
            status: cluster.status,
            report_count: cluster.report_count,
            people_affected: cluster.people_affected,
            ai_summary: cluster.ai_summary,
            action_plan: cluster.action_plan,
            ai_severity: cluster.ai_severity,
            ai_disaster_type: cluster.ai_disaster_type,
            ai_analyzed_at: cluster.ai_analyzed_at,
          },
        })),
    }),
    [clusters]
  );

  const teamsGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: teams
        .filter(
          (t) =>
            typeof t.lat === 'number' &&
            typeof t.lng === 'number' &&
            !Number.isNaN(t.lat) &&
            !Number.isNaN(t.lng)
        )
        .map((team, index) => ({
          type: 'Feature',
          id: `team-${team.team_id ?? index}`,
          geometry: {
            type: 'Point',
            coordinates: [team.lng, team.lat],
          },
          properties: {
            team_id: team.team_id,
            name: team.name,
            status: team.status,
          },
        })),
    }),
    [teams]
  );

  // planned routes as dashed lines under the pins; routes whose team or
  // cluster vanished (resolved/removed) drop out automatically
  const routesGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: Object.entries(teamRoutes).map(([teamId, coordinates]) => ({
        type: 'Feature',
        id: `route-${teamId}`,
        geometry: { type: 'LineString', coordinates },
        properties: { team_id: Number(teamId) },
      })),
    }),
    [teamRoutes]
  );

  // reports inside the expanded cluster, as map markers
  const reportsGeojson = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: (selectedClusterId != null ? clusterReports : [])
        .filter(
          (r) =>
            typeof r.latitude === 'number' &&
            typeof r.longitude === 'number' &&
            !Number.isNaN(r.latitude) &&
            !Number.isNaN(r.longitude)
        )
        .map((report) => ({
          type: 'Feature',
          id: `report-${report.report_id}`,
          geometry: {
            type: 'Point',
            coordinates: [report.longitude, report.latitude],
          },
          properties: {
            report_id: report.report_id,
            status: report.status,
          },
        })),
    };
  }, [clusterReports, selectedClusterId]);

  // the selected cluster re-emitted on its own source, so the halo can
  // inherit its priority color without a filter expression
  const selectedClusterGeojson = useMemo(() => {
    const feature =
      selectedClusterId != null
        ? clustersGeojson.features.find(
            (f) => f.properties.cluster_id === selectedClusterId
          )
        : null;
    return {
      type: 'FeatureCollection',
      features: feature ? [feature] : [],
    };
  }, [clustersGeojson, selectedClusterId]);

  // team(s) currently dispatched to the expanded cluster — shown in the
  // details window banner in place of the "Assign a Team" button
  const selectedAssignedTeam = useMemo(() => {
    if (selectedCluster == null) return null;
    const clusterId = Number(selectedCluster.cluster_id);
    const assigned = teams.filter((t) => Number(t.assigned_to) === clusterId);
    if (assigned.length === 0) return null;
    return { team: assigned[0], extraCount: assigned.length - 1 };
  }, [teams, selectedCluster]);

  // ---- handlers -----------------------------------------------------------
  const handleLocatePress = async () => {
    if (locating) return;
    if (!getCachedCoords()) setLocating(true);
    // resume tracking so the camera keeps following after recentering
    setFollowsUser(true);
    try {
      const coords = await resolveCoords();
      if (!coords) return;

      cameraRef.current?.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: LOCATE_ZOOM,
        duration: LOCATE_FLY_DURATION_MS,
      });
    } catch (e) {
      console.log('Failed to locate user', e);
    } finally {
      setLocating(false);
    }
  };

  // ---- auto-zoom to the user once their location loads ---------------------
  // mirrors the GPS button: flies to the current position on the first fix;
  // skipped when a "go to team/cluster" request is already pending so it
  // can't override the flight that request triggers
  useEffect(() => {
    if (!locationGranted || !mapReady || hasAutoZoomedRef.current) return;
    const teamFocusPending =
      focusTeamId != null && focusTeamNonce !== handledTeamFocusRef.current;
    const clusterFocusPending =
      activeClusterId != null && focusNonce !== handledFocusRef.current;
    if (teamFocusPending || clusterFocusPending) return;
    let cancelled = false;
    (async () => {
      const coords = await resolveCoords();
      if (cancelled || !coords || hasAutoZoomedRef.current) return;
      hasAutoZoomedRef.current = true;
      cameraRef.current?.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: LOCATE_ZOOM,
        duration: LOCATE_FLY_DURATION_MS,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    locationGranted,
    mapReady,
    resolveCoords,
    focusTeamId,
    focusTeamNonce,
    activeClusterId,
    focusNonce,
  ]);

  // ---- cluster expand / collapse -----------------------------------------
  const collapseCluster = useCallback(() => {
    setSelectedClusterId(null);
    setSelectedCluster(null);
    setClusterReports([]);
    setReportsLoading(false);
    setActiveClusterId(null);
  }, [setActiveClusterId]);

  // if the expanded cluster got resolved elsewhere it stops coming back
  // from the server — collapse immediately so its pin, halo, reports and
  // details window all vanish with the refetched data
  useEffect(() => {
    if (
      selectedClusterId != null &&
      !clusters.some((c) => c.cluster_id === selectedClusterId)
    ) {
      collapseCluster();
    }
  }, [clusters, selectedClusterId, collapseCluster]);

  const expandCluster = useCallback(
    async (clusterId) => {
      setSelectedTeamId(null);
      setSelectedClusterId(clusterId);
      setSelectedCluster(
        clusters.find((c) => c.cluster_id === clusterId) ?? null
      );
      setClusterReports([]);
      setReportsLoading(true);
      setActiveClusterId(clusterId);

      const target = clusters.find((c) => c.cluster_id === clusterId);
      if (
        target &&
        typeof target.latitude === 'number' &&
        typeof target.longitude === 'number'
      ) {
        // stop tracking the user or the flight gets overridden
        setFollowsUser(false);
        cameraRef.current?.flyTo({
          center: [target.longitude, target.latitude],
          zoom: CLUSTER_FOCUS_ZOOM,
          duration: CLUSTER_FOCUS_DURATION_MS,
          padding: CLUSTER_FOCUS_PADDING,
        });
      }

      try {
        const { data } = await fetchClusterReports(clusterId);
        setSelectedCluster(data?.cluster ?? null);
        setClusterReports(data?.reports ?? []);
      } catch (e) {
        console.log('failed to fetch cluster reports', e);
      } finally {
        setReportsLoading(false);
      }
    },
    [clusters, setActiveClusterId]
  );

  const handleClusterPress = useCallback(
    async (event) => {
      // keep Map's onPress from also firing on empty map
      event.stopPropagation();

      const feature = event.nativeEvent?.features?.find(
        (f) => f.properties?.cluster_id != null
      );
      if (!feature) return;

      // tapping a team pin while a cluster is open swaps to the team
      setSelectedTeamId(null);

      const clusterId = feature.properties.cluster_id;

      // tapping the expanded cluster collapses it again
      if (clusterId === selectedClusterId) {
        collapseCluster();
        return;
      }

      await expandCluster(clusterId);
    },
    [selectedClusterId, collapseCluster, expandCluster]
  );

  const selectedTeam = useMemo(
    () =>
      selectedTeamId != null
        ? teams.find((t) => t.team_id === selectedTeamId) ?? null
        : null,
    [teams, selectedTeamId]
  );

  // the cluster the selected team is currently dispatched to (its
  // assigned_to). Shown in the team window as a banner that, when tapped,
  // expands the cluster and pans the camera to it — mirroring how a
  // cluster window links to its assigned team.
  const selectedTeamAssignedCluster = useMemo(() => {
    if (selectedTeam == null || selectedTeam.assigned_to == null) return null;
    return (
      clusters.find((c) => c.cluster_id === selectedTeam.assigned_to) ?? null
    );
  }, [selectedTeam, clusters]);

  const handleTeamOpenCluster = useCallback(() => {
    if (selectedTeamAssignedCluster == null) return;
    expandCluster(selectedTeamAssignedCluster.cluster_id);
  }, [selectedTeamAssignedCluster, expandCluster]);

  // "assigned team" banner on an expanded cluster: instead of opening the
  // team detail, drop the cluster and fly the camera to the team's current
  // location (mirrors the team -> cluster pan described above).
  const handleClusterOpenTeam = useCallback(() => {
    const team = selectedAssignedTeam?.team;
    if (team == null) return;

    setSelectedTeamId(team.team_id);
    collapseCluster();

    if (
      typeof team.lat === "number" &&
      typeof team.lng === "number" &&
      !Number.isNaN(team.lat) &&
      !Number.isNaN(team.lng)
    ) {
      setFollowsUser(false);
      cameraRef.current?.flyTo({
        center: [team.lng, team.lat],
        zoom: CLUSTER_FOCUS_ZOOM,
        duration: CLUSTER_FOCUS_DURATION_MS,
      });
    }
  }, [selectedAssignedTeam, collapseCluster, setFollowsUser]);

  const collapseTeam = useCallback(() => setSelectedTeamId(null), []);

  const handleCancelDispatch = useCallback(
    async (team) => {
      if (team == null) return;
      try {
        const assignment = await getAssignmentForTeam(team.team_id);
        if (assignment && assignment.status !== "resolved" && assignment.status !== "cancelled") {
          await cancelAssignment(assignment.assignment_id);
        }
        invalidateClusters();
      } catch (e) {
        console.log("cancel dispatch error:", e);
        throw e;
      }
    },
    [invalidateClusters]
  );

  const handleTeamPress = useCallback(
    (event) => {
      event.stopPropagation();

      const feature = event.nativeEvent?.features?.find(
        (f) => f.properties?.team_id != null
      );
      if (!feature) return;

      const teamId = feature.properties.team_id;
      if (teamId === selectedTeamId) {
        collapseTeam();
        return;
      }

      setSelectedTeamId(teamId);
      collapseCluster();

      const team = teams.find((t) => t.team_id === teamId);
      if (
        team &&
        typeof team.lat === 'number' &&
        typeof team.lng === 'number'
      ) {
        // stop tracking the user or the flight gets overridden
        setFollowsUser(false);
        cameraRef.current?.flyTo({
          center: [team.lng, team.lat],
          zoom: CLUSTER_FOCUS_ZOOM,
          duration: CLUSTER_FOCUS_DURATION_MS,
        });
      }
    },
    [selectedTeamId, teams, collapseTeam, collapseCluster]
  );

  const openTeamDetail = useCallback(() => {
    if (selectedTeam == null) return;
    router.push({
      pathname: '/team-detail',
      params: { teamId: String(selectedTeam.team_id) },
    });
  }, [router, selectedTeam]);

  // opens a cluster picked from another tab with the same expand and
  // center behavior as tapping its marker here; waits for the map to
  // load and for clusters data before flying the camera
  useEffect(() => {
    if (
      focusNonce === handledFocusRef.current ||
      activeClusterId == null ||
      !mapReady ||
      clusters.length === 0
    ) {
      return;
    }
    handledFocusRef.current = focusNonce;
    expandCluster(activeClusterId);
  }, [focusNonce, activeClusterId, mapReady, clusters, expandCluster]);

  // "go to this team" from the Team detail screen: select the team's pin
  // (which drops any expanded cluster, same as tapping the pin) and fly
  // the camera to its position; waits for map + teams data like above
  useEffect(() => {
    if (
      focusTeamNonce === handledTeamFocusRef.current ||
      focusTeamId == null ||
      !mapReady ||
      teams.length === 0
    ) {
      return;
    }
    handledTeamFocusRef.current = focusTeamNonce;

    const team = teams.find((t) => t.team_id === focusTeamId);
    if (!team) return;

    setSelectedTeamId(team.team_id);
    collapseCluster();

    if (
      typeof team.lat === "number" &&
      typeof team.lng === "number" &&
      !Number.isNaN(team.lat) &&
      !Number.isNaN(team.lng)
    ) {
      // stop tracking the user or tracking yanks the camera right back
      // to their position on the next GPS fix (reported bug: "go to
      // location" from a team landed on the user instead of the team)
      setFollowsUser(false);
      cameraRef.current?.flyTo({
        center: [team.lng, team.lat],
        zoom: CLUSTER_FOCUS_ZOOM,
        duration: CLUSTER_FOCUS_DURATION_MS,
      });
    }
  }, [focusTeamNonce, focusTeamId, mapReady, teams, collapseCluster]);

  // ---------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <Map
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
          maxBounds={PH_BOUNDS}
          minZoom={6}
          maxZoom={20}
          trackUserLocation={
            locationGranted && followsUser ? "default" : undefined
          }
        />

        {/* planned routes for dispatched teams — drawn first so every
            pin/halo renders on top of the lines */}
        {mapReady && (
          <GeoJSONSource id="routesSource" data={routesGeojson}>
            <RouteDashLayer />
          </GeoJSONSource>
        )}

        {mapReady && (
          <GeoJSONSource
            id="clustersSource"
            data={clustersGeojson}
            hitbox={{ top: 16, right: 16, bottom: 16, left: 16 }}
            onPress={handleClusterPress}
          >
            {/* expanding priority-colored halo behind every cluster dot */}
            <PulseClusterLayer />
            <Layer
              type="circle"
              id="clustersLayer"
              paint={{
                'circle-color': CLUSTER_PRIORITY_COLOR_EXPR,
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  5, 4,
                  10, 8,
                  16, 14,
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.85,
              }}
            />
            {/* report count rendered in the middle of each cluster dot */}
            <Layer
              type="symbol"
              id="clustersCountLayer"
              layout={{
                'text-field': ['to-string', ['get', 'report_count']],
                'text-size': [
                  'interpolate', ['linear'], ['zoom'],
                  9, 10,
                  16, 14,
                ],
              }}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(38, 50, 56, 0.65)',
                'text-halo-width': 1.2,
                'text-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  7.5, 0,
                  9, 1,
                ],
              }}
            />
          </GeoJSONSource>
        )}

        {/* selection glow around the expanded cluster — empty data hides it */}
        {mapReady && (
          <GeoJSONSource id="selectedClusterSource" data={selectedClusterGeojson}>
            <Layer
              type="circle"
              id="selectedClusterHalo"
              paint={{
                'circle-color': CLUSTER_PRIORITY_COLOR_EXPR,
                'circle-opacity': 0.15,
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  5, 10,
                  10, 18,
                  16, 30,
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': CLUSTER_PRIORITY_COLOR_EXPR,
                'circle-stroke-opacity': 0.9,
              }}
            />
          </GeoJSONSource>
        )}

        {/* individual reports inside the expanded cluster — empty data hides them */}
        {mapReady && (
          <GeoJSONSource id="clusterReportsSource" data={reportsGeojson}>
            <Layer
              type="circle"
              id="clusterReportsLayer"
              paint={{
                'circle-color': REPORT_STATUS_COLOR_EXPR,
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, 2.5,
                  12, 3.5,
                  16, 4.5,
                  20, 6,
                ],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.95,
              }}
            />
          </GeoJSONSource>
        )}

        {/* teams — light blue when available, orange once dispatched (busy) */}
        {mapReady && (
          <GeoJSONSource
            id="teamsSource"
            data={teamsGeojson}
            hitbox={{ top: 16, right: 16, bottom: 16, left: 16 }}
            onPress={handleTeamPress}
          >
            <Layer
              type="circle"
              id="teamsCircle"
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
                'circle-stroke-color': TEAM_STATUS_COLOR_EXPR,
                'circle-opacity': 0.9,
              }}
            />
            <Layer
              type="symbol"
              id="teamsLayer"
              layout={{
                'icon-image': 'shelter',
                'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 1, 16, 1.2, 20, 1.4],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              }}
              paint={{
                'icon-color': TEAM_STATUS_COLOR_EXPR,
              }}
            />
            <Layer
              type="symbol"
              id="teamsLabel"
              layout={{
                'text-field': ['get', 'name'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 11,
                'text-offset': [0, 1.8],
                'text-anchor': 'top',
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': TEAM_STATUS_COLOR_EXPR,
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
              }}
            />
          </GeoJSONSource>
        )}

        {locationGranted && (
          <NativeUserLocation androidRenderMode="gps" />
        )}
      </Map>

      <TouchableOpacity
        style={[
          styles.locateButton,
          (selectedCluster != null || selectedTeam != null) &&
            styles.locateButtonRaised,
        ]}
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

      {selectedCluster && (
        <ClusterDetailsWindow
          cluster={selectedCluster}
          assignedTeam={selectedAssignedTeam?.team ?? null}
          assignedExtraCount={selectedAssignedTeam?.extraCount ?? 0}
          onClose={collapseCluster}
          onAssignTeam={() => setAssignOpen(true)}
          onResolved={invalidateClusters}
          onOpenTeam={handleClusterOpenTeam}
          onCancelDispatch={() => handleCancelDispatch(selectedAssignedTeam?.team)}
        />
      )}

      {selectedTeam && (
        <TeamDetailsWindow
          team={selectedTeam}
          assignedCluster={selectedTeamAssignedCluster}
          onClose={collapseTeam}
          onSeeDetails={openTeamDetail}
          onOpenCluster={handleTeamOpenCluster}
          onCancelDispatch={() => handleCancelDispatch(selectedTeam)}
        />
      )}

      <AssignTeamModal
        visible={assignOpen}
        clusterId={selectedCluster?.cluster_id}
        clusterName={selectedCluster?.city}
        onClose={() => setAssignOpen(false)}
        onAssigned={(assignment, team) => {
          setAssignSuccess({
            teamName: team?.name,
            clusterLabel:
              selectedCluster?.city && selectedCluster?.cluster_id != null
                ? `Cluster #${selectedCluster.cluster_id} · ${selectedCluster.city}`
                : `Cluster #${selectedCluster?.cluster_id ?? ""}`,
          });
          refreshClusters();
        }}
      />

      <AssignSuccessModal
        visible={assignSuccess != null}
        teamName={assignSuccess?.teamName}
        clusterLabel={assignSuccess?.clusterLabel}
        onClose={() => setAssignSuccess(null)}
      />
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
  // keeps the button above the expanded cluster window
  locateButtonRaised: {
    bottom: 372,
  },
});
