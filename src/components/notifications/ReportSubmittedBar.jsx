import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../constants/colors";

const PULSE_DURATION_MS = 1800;
const SUCCESS = "#16A34A";

/**
 * Persistent floating notification bar shown on the citizen map after they
 * submit a report, while no team is on the way yet. Confirms the report was
 * received and offers two actions: view the report details, or cancel their
 * SOS help.
 *
 * Props:
 * - report: { reportId, createdAt (ms|ISO), clusterId }
 * - onViewDetails(reportId)
 * - onCancel(reportId)
 *
 * The bar cannot be dismissed; it can only be minimized/expanded via the
 * chevron toggle, keeping the active report visible to the citizen.
 */
export default function ReportSubmittedBar({
  report,
  onViewDetails,
  onCancel,
  style,
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!report) return;
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
  }, [report, pulse]);

  if (!report) return null;

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.5, 0.35, 0],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });

  const handleCancelPress = () => {
    Alert.alert(
      "Cancel SOS help?",
      "This will cancel your report so help is no longer dispatched to you.",
      [
        { text: "Keep report", style: "cancel" },
        {
          text: "Cancel help",
          style: "destructive",
          onPress: () => onCancel?.(report.reportId),
        },
      ]
    );
  };

  return (
    <View style={style}>
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
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </View>
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>
                Report received
              </Text>
              {!minimized && (
                <Text style={styles.subtitle} numberOfLines={2}>
                  Your SOS report has been submitted successfully.
                </Text>
              )}
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
              <View style={styles.noteRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.muted}
                />
                <Text style={styles.cancelNote}>
                  You can still cancel this report if you no longer need help.
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.viewBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onViewDetails?.(report.reportId)}
                  accessibilityRole="button"
                >
                  <Ionicons name="eye-outline" size={16} color={colors.white} />
                  <Text style={styles.viewBtnText}>View details</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.cancelBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleCancelPress}
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                  <Text style={styles.cancelBtnText}>Cancel help</Text>
                </Pressable>
              </View>
            </View>
          )}
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

  body: {
    marginTop: 12,
    gap: 12,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  cancelNote: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
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
  viewBtn: {
    backgroundColor: colors.primary,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: 0.2,
  },
  cancelBtn: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#DC2626",
  },
});
