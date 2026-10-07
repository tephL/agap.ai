import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatETA } from "../../services/routeService";
import { haversineMeters, formatDistance } from "../../utils/haversine";
import colors from "../../constants/colors";

const PULSE_DURATION_MS = 1800;
const SUCCESS = "#16A34A";
const DANGER = "#DC2626";

/**
 * Persistent notification bar shown on the citizen map when a response team
 * has been dispatched to one of the user's clusters.
 *
 * Each dispatch card cannot be dismissed. It can only be minimized or
 * expanded via the chevron toggle so the active dispatch stays visible.
 *
 * Props:
 * - dispatches: Array<{
 *     assignment_id, team: { name, lat, lng },
 *     cluster: { lat, lng }, etaSeconds, status
 *   }>
 * - cancelledDispatches: Array<{ assignment_id, cluster }>, recently
 *   cancelled dispatches, rendered as a short-lived "Dispatch cancelled" card
 */
export default function DispatchNotificationBar({
  dispatches,
  cancelledDispatches = [],
  style,
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dispatches.length === 0) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [dispatches.length, pulse]);

  if (dispatches.length === 0 && cancelledDispatches.length === 0) return null;

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.5, 0.35, 0],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });

  // Hide any cancelled notice for a cluster that already has an active
  // dispatch. A new dispatch supersedes the earlier cancellation.
  const activeClusterIds = new Set(
    dispatches.map((d) => d.cluster?.cluster_id).filter((id) => id != null)
  );
  const visibleCancelled = cancelledDispatches.filter(
    (c) => !activeClusterIds.has(c.cluster?.cluster_id)
  );

  return (
    <View style={[styles.container, style]}>
      {dispatches.map((d) => (
        <DispatchCard
          key={d.assignment_id}
          dispatch={d}
          ringOpacity={ringOpacity}
          ringScale={ringScale}
        />
      ))}
      {visibleCancelled.map((d) => (
        <CancelledCard key={d.assignment_id} dispatch={d} />
      ))}
    </View>
  );
}

// Short-lived "dispatch cancelled" card. Auto-dismisses after a few seconds
// so the citizen learns the change without a lingering banner.
function CancelledCard({ dispatch }) {
  const { cluster } = dispatch;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setHidden(true), 5000);
    return () => clearTimeout(id);
  }, []);

  if (hidden) return null;

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: DANGER }]} />
      <View style={[styles.inner, styles.cancelledInner]}>
        <View style={[styles.iconCircle, { backgroundColor: DANGER }]}>
          <Ionicons name="close" size={20} color={colors.white} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Dispatch cancelled
          </Text>
          {cluster && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {`Cluster #${cluster.cluster_id ?? ""}: help is no longer on the way`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function DispatchCard({ dispatch, ringOpacity, ringScale }) {
  const { team, cluster, etaSeconds, status } = dispatch;
  const [minimized, setMinimized] = useState(false);

  const distanceMeters = haversineMeters(
    { lat: team?.lat, lng: team?.lng },
    { lat: cluster?.lat, lng: cluster?.lng }
  );

  return (
    <View style={styles.card}>
      <View style={styles.accent} />

      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.iconSlot}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
            <View style={styles.iconCircle}>
              <Ionicons name="navigate" size={18} color={colors.white} />
            </View>
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Help is on the way!
            </Text>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {status === "dispatched" ? "En route" : "Dispatching"}
              </Text>
            </View>
          </View>

          <Pressable
            hitSlop={8}
            onPress={() => setMinimized((m) => !m)}
            style={styles.minimizeBtn}
            accessibilityRole="button"
            accessibilityLabel={
              minimized ? "Expand notification" : "Minimize notification"
            }
          >
            <Ionicons
              name={minimized ? "chevron-down" : "chevron-up"}
              size={16}
              color={colors.text}
            />
          </Pressable>
        </View>

        {!minimized && (
          <View style={styles.body}>
            <View style={styles.infoStrip}>
              <Ionicons name="people-outline" size={16} color={colors.primary} />
              <Text style={styles.teamName} numberOfLines={2}>
                {team?.name
                  ? `A team from ${team.name} is on the way`
                  : "A response team is on the way"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={styles.etaText}>{formatETA(etaSeconds)}</Text>
              </View>
              {distanceMeters != null && (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={14} color={colors.muted} />
                  <Text style={styles.distanceText}>
                    {formatDistance(distanceMeters)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  accent: {
    width: 5,
    backgroundColor: SUCCESS,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconSlot: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SUCCESS,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.1,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  minimizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SUCCESS,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#166534",
  },

  body: {
    marginTop: 12,
    gap: 10,
  },
  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  teamName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  etaText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },

  cancelledInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
