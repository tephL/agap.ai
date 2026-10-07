import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../constants/colors";

const HOLD_MS = 3000;
const RING_SIZE = 76;
const RING_THICKNESS = 4;
const INNER_SIZE = RING_SIZE - RING_THICKNESS * 2;
const BUTTON_SIZE = 58;

export default function ReportHoldButton({ onComplete }) {
  const progress = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const animation = useRef(null);
  const completed = useRef(false);

  // Idle pulse so the button invites a press
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const rightRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["-180deg", "0deg", "0deg"],
  });
  const leftRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["-180deg", "-180deg", "0deg"],
  });
  const leftOpacity = progress.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  const pressScale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.93],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  const stopHold = () => {
    animation.current?.stop();
    animation.current = null;
  };

  const onPressIn = () => {
    completed.current = false;
    progress.setValue(0);
    Animated.spring(press, {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();

    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.current.start(({ finished }) => {
      if (!finished) return;
      completed.current = true;
      onComplete?.();
    });
  };

  const onPressOut = () => {
    Animated.spring(press, {
      toValue: 0,
      friction: 6,
      useNativeDriver: true,
    }).start();
    stopHold();
    progress.setValue(0);
  };

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel="Hold to open report"
    >
      {/* Idle pulse (sits behind everything) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulse,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0.4, 0.28, 0],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1.6],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[styles.stack, { transform: [{ scale: pressScale }] }]}
      >
        <View style={styles.track} />

        <View style={styles.rightClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.spinner,
              styles.spinnerRight,
              { transform: [{ rotate: rightRotate }] },
            ]}
          >
            <View style={styles.rightFill} />
          </Animated.View>
        </View>

        <Animated.View
          style={[styles.leftClip, { opacity: leftOpacity }]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.spinner,
              styles.spinnerLeft,
              { transform: [{ rotate: leftRotate }] },
            ]}
          >
            <View style={styles.leftFill} />
          </Animated.View>
        </Animated.View>

        {/* White gap that turns the filled pie into a thin ring */}
        <View style={styles.ringInner} />

        <View style={styles.button}>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <Ionicons name="megaphone" size={26} color={colors.white} />
          </Animated.View>
        </View>
      </Animated.View>

      <Text style={styles.hint} pointerEvents="none">
        HOLD FOR HELP
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
    top: -36,
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  pulse: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.primary,
  },
  stack: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.border,
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
    backgroundColor: colors.primary,
    borderTopRightRadius: RING_SIZE / 2,
    borderBottomRightRadius: RING_SIZE / 2,
  },
  leftFill: {
    width: RING_SIZE / 2,
    height: RING_SIZE,
    position: "absolute",
    left: 0,
    backgroundColor: colors.primary,
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
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  hint: {
    position: "absolute",
    bottom: -16,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.muted,
  },
});
