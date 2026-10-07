import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../constants/colors";

const COPY = {
  received: {
    title: "We have received your report",
    sub: "Help will be on its way.",
    icon: "checkmark",
    iconBg: "#ECFDF5",
    iconColor: "#16A34A",
    accent: "#16A34A",
  },
  prepared: {
    title: "Your SOS message is ready",
    sub: "Tap Send in Messages if you haven't. Help is on the way.",
    icon: "checkmark",
    iconBg: "#ECFDF5",
    iconColor: "#16A34A",
    accent: "#16A34A",
  },
  active: {
    title: "You cancelled your offline SOS report",
    sub: "No report was sent.",
    icon: "close",
    iconBg: "#FEF2F2",
    iconColor: "#DC2626",
    accent: "#DC2626",
  },
};

const AUTO_CLOSE_MS = 10000;
const RING_SIZE = 104;
const RING_THICKNESS = 6;
const INNER_SIZE = RING_SIZE - RING_THICKNESS * 2;
const ICON_BG_SIZE = 72;

export default function SosReceivedOverlay({ variant = "received", onDone }) {
  const copy = COPY[variant] ?? COPY.received;
  const accent = copy.accent ?? colors.primary;

  const progressAnim = useRef(new Animated.Value(0)).current;
  const popupScale = useRef(new Animated.Value(0.92)).current;
  const popupShift = useRef(new Animated.Value(18)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ringAnim = Animated.sequence([
      Animated.delay(300),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: AUTO_CLOSE_MS - 300,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);

    const cardAnim = Animated.parallel([
      Animated.timing(popupScale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(popupShift, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]);

    Animated.parallel([cardAnim, ringAnim]).start(({ finished }) => {
      if (finished) onDoneRef.current?.();
    });

    return () => {
      progressAnim.stopAnimation();
      popupScale.stopAnimation();
      popupShift.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, []);

  const handleDismiss = () => {
    progressAnim.stopAnimation();
    popupScale.stopAnimation();
    popupShift.stopAnimation();
    backdropOpacity.stopAnimation();
    onDoneRef.current?.();
  };

  const rightRotate = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["-180deg", "0deg", "0deg"],
  });
  const leftRotate = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["-180deg", "-180deg", "0deg"],
  });
  const leftOpacity = progressAnim.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY: popupShift }, { scale: popupScale }] },
        ]}
      >
        <View style={styles.ringWrap}>
          <View style={[styles.ringTrack, { backgroundColor: accent + "22" }]} />

          <View style={styles.rightClip}>
            <Animated.View
              style={[
                styles.spinner,
                styles.spinnerRight,
                { transform: [{ rotate: rightRotate }] },
              ]}
            >
              <View style={[styles.rightFill, { backgroundColor: accent }]} />
            </Animated.View>
          </View>

          <Animated.View style={[styles.leftClip, { opacity: leftOpacity }]}>
            <Animated.View
              style={[
                styles.spinner,
                styles.spinnerLeft,
                { transform: [{ rotate: leftRotate }] },
              ]}
            >
              <View style={[styles.leftFill, { backgroundColor: accent }]} />
            </Animated.View>
          </Animated.View>

          {/* White gap that turns the filled pie into a thin ring */}
          <View style={styles.ringInner} />

          <View style={[styles.iconBg, { backgroundColor: copy.iconBg }]}>
            <Ionicons name={copy.icon} size={36} color={copy.iconColor} />
          </View>
        </View>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.sub}</Text>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          activeOpacity={0.85}
        >
          <Text style={styles.closeButtonText}>CLOSE</Text>
        </TouchableOpacity>

        <View style={styles.autoRow}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.autoText}>Closes automatically</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "86%",
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingTop: 32,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  ringTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RING_SIZE / 2,
  },
  rightClip: {
    position: "absolute",
    width: RING_SIZE / 2,
    height: RING_SIZE,
    right: 0,
    overflow: "hidden",
  },
  leftClip: {
    position: "absolute",
    width: RING_SIZE / 2,
    height: RING_SIZE,
    left: 0,
    overflow: "hidden",
  },
  spinner: {
    width: RING_SIZE,
    height: RING_SIZE,
    position: "absolute",
    top: 0,
  },
  spinnerRight: { left: -RING_SIZE / 2 },
  spinnerLeft: { left: 0 },
  rightFill: {
    width: RING_SIZE / 2,
    height: RING_SIZE,
    position: "absolute",
    right: 0,
    borderTopRightRadius: RING_SIZE / 2,
    borderBottomRightRadius: RING_SIZE / 2,
  },
  leftFill: {
    width: RING_SIZE / 2,
    height: RING_SIZE,
    position: "absolute",
    left: 0,
    borderTopLeftRadius: RING_SIZE / 2,
    borderBottomLeftRadius: RING_SIZE / 2,
  },
  ringInner: {
    position: "absolute",
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: colors.white,
  },
  iconBg: {
    width: ICON_BG_SIZE,
    height: ICON_BG_SIZE,
    borderRadius: ICON_BG_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  closeButton: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: 1,
  },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 14,
  },
  autoText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
});
