import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../constants/colors";

const ASSUMED_SIGNAL = 3;
const PULSE_DURATION_MS = 1800;
const DANGER = "#DC2626";
const DANGER_DARK = "#991B1B";
const DANGER_SOFT = "#FEF2F2";

function DetailRow({ icon, label, value, last }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowDivider]}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={14} color={DANGER} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function TyphoonAlertBanner({ typhoon, onDismiss, onViewDetails, onAskPreparedness }) {
  const [expanded, setExpanded] = useState(false);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_DURATION_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));

  if (!typhoon) return null;

  const details = [
    { icon: "warning-outline", label: "Name", value: typhoon.name },
    { icon: "pricetag-outline", label: "Category", value: typhoon.category ?? "N/A" },
    { icon: "speedometer-outline", label: "Signal", value: `No. ${ASSUMED_SIGNAL} (your area)` },
    typhoon.source
      ? { icon: "information-circle-outline", label: "Source", value: typhoon.source }
      : null,
    typhoon.created_at
      ? {
          icon: "time-outline",
          label: "Posted",
          value: new Date(typhoon.created_at).toLocaleDateString(),
        }
      : null,
  ].filter(Boolean);

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.accent} />

        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={styles.iconSlot}>
              <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
              <View style={styles.iconCircle}>
                <Ionicons name="thunderstorm" size={18} color={colors.white} />
              </View>
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>
                Typhoon Alert
              </Text>
              <Text style={styles.typhoonName} numberOfLines={1}>
                {typhoon.name}
              </Text>
              <View style={styles.signalBadge}>
                <View style={styles.signalDot} />
                <Text style={styles.signalText}>Signal No. {ASSUMED_SIGNAL}</Text>
              </View>
            </View>

            <Pressable
              hitSlop={8}
              onPress={onDismiss}
              style={styles.dismissBtn}
              accessibilityRole="button"
              accessibilityLabel="Dismiss typhoon alert"
            >
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {expanded && (
              <Animated.View
                entering={FadeInDown.duration(250)}
                exiting={FadeOutUp.duration(150)}
                style={styles.detailsSection}
              >
                {details.map((d, i) => (
                  <DetailRow
                    key={d.label}
                    icon={d.icon}
                    label={d.label}
                    value={d.value}
                    last={i === details.length - 1}
                  />
                ))}
              </Animated.View>
            )}

            <View style={styles.buttonRow}>
              {!expanded ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setExpanded(true);
                    onViewDetails?.();
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="information-circle-outline" size={16} color={colors.text} />
                  <Text style={styles.secondaryButtonText}>View Details</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setExpanded(false)}
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-up" size={16} color={colors.text} />
                  <Text style={styles.secondaryButtonText}>Collapse</Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
                onPress={onAskPreparedness}
                accessibilityRole="button"
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.white} />
                <Text style={styles.primaryButtonText}>AI Tips</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: DANGER,
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
    backgroundColor: DANGER,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.1,
  },
  typhoonName: {
    fontSize: 13,
    fontWeight: "700",
    color: DANGER_DARK,
  },
  signalBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 3,
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: DANGER,
  },
  signalText: {
    fontSize: 11,
    fontWeight: "800",
    color: DANGER_DARK,
  },
  dismissBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  body: {
    marginTop: 12,
    gap: 12,
  },
  detailsSection: {
    backgroundColor: DANGER_SOFT,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  detailRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  detailIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    width: 62,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: DANGER_DARK,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 21,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: 0.2,
  },
});
