import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import colors from "../constants/colors";
import { cameraStore, useCameraStore } from "../store/cameraStore";
import { requestReportLocation } from "../services/reportService";
import useNetworkStatus from "../hooks/useNetworkStatus";
import ReportHoldButton from "./ReportHoldButton";

// Base icon names. The outline variant is used when a tab is not focused.
const ICONS = {
  index: "map",
  assistant: "sparkles",
  family: "people",
  profile: "person",
};

const primaryColor = colors.primary;
const INACTIVE = "#9AA0A6";

function OfflineBadge({ visible }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, anim]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.offlineBadge,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.offlineIconChip}>
        <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
      </View>
      <View style={styles.offlineTextWrap}>
        <Text style={styles.offlineTitle}>You're offline</Text>
        <Text style={styles.offlineSubtitle}>
          Reports will be sent by text message
        </Text>
      </View>
      <View style={styles.offlineTail} />
    </Animated.View>
  );
}

function TabItem({ focused, label, iconName, onPress }) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  const pillStyle = {
    opacity: anim,
    transform: [
      {
        scaleX: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4, 1],
        }),
      },
    ],
  };

  const iconLiftStyle = {
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -1],
        }),
      },
    ],
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.tabItem}
      activeOpacity={0.7}
    >
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.activePill, pillStyle]} />
        <Animated.View style={iconLiftStyle}>
          <Ionicons
            name={focused ? iconName : `${iconName}-outline`}
            size={22}
            color={focused ? primaryColor : INACTIVE}
          />
        </Animated.View>
      </View>
      <Text
        style={[
          styles.label,
          focused ? styles.labelActive : styles.labelInactive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { reportExpiresAt } = useCameraStore();
  const { isOnline } = useNetworkStatus();

  const centerIndex = state.routes.findIndex((r) => r.name === "report");
  const centerRoute = centerIndex !== -1 ? state.routes[centerIndex] : null;
  const isReportFocused = centerIndex !== -1 && state.index === centerIndex;

  useEffect(() => {
    if (!reportExpiresAt) return;
    const delay = Math.max(0, reportExpiresAt - Date.now());
    const id = setTimeout(() => {
      cameraStore.discardReport();
      if (typeof router.canDismiss === "function" && router.canDismiss()) {
        router.dismissAll();
      }
      navigation.navigate("index");
      Alert.alert(
        "Report closed",
        "It's been over 5 minutes, so this report was closed and your extra details weren't saved. You can start a new one anytime.",
        [{ text: "Confirm" }]
      );
    }, delay);
    return () => clearTimeout(id);
  }, [reportExpiresAt, navigation]);

  const onHoldComplete = () => {
    cameraStore.startReport();
    // Fire the location request immediately, in parallel with navigating.
    // This is the ONLY call that creates the report row on the backend.
    // ReportScreen awaits this (via cameraStore.waitForLocation()) before
    // it uploads any photos or a description, so nothing can race ahead
    // of the report actually existing.
    //
    // Skipped entirely when offline: there's no backend to reach, and
    // calling it anyway would just sit there until it times out. The
    // report screen fetches location on its own (device-only, no network)
    // when it builds the offline SMS instead.
    if (isOnline) {
      cameraStore.setLocationRequest(requestReportLocation());
    }
    navigation.navigate("report");
  };

  return (
    <View
      style={isReportFocused ? styles.hidden : styles.wrapper}
      pointerEvents={isReportFocused ? "none" : "auto"}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom || 10 }]}>
        {state.routes.map((route) => {
          const isCenter = route.name === "report";

          if (isCenter) {
            return (
              <View key={route.key} style={styles.tabItem} pointerEvents="none" />
            );
          }

          const { options } = descriptors[route.key];
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === routeIndex;
          const label = options.tabBarLabel ?? options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              focused={isFocused}
              label={label}
              iconName={ICONS[route.name] || "ellipse"}
              onPress={onPress}
            />
          );
        })}
      </View>

      {centerRoute && <OfflineBadge visible={!isOnline} />}

      {centerRoute && <ReportHoldButton onComplete={onHoldComplete} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  hidden: { height: 0, overflow: "hidden" },

  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#ffffff",
    height: 104,
    paddingHorizontal: 8,
    // borderTopLeftRadius: 28,
    // borderTopRightRadius: 28,
    // soft shadow cast upward
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  iconSlot: {
    width: 52,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  activePill: {
    position: "absolute",
    width: 52,
    height: 30,
    borderRadius: 15,
    // 10% tint of the brand color (works with 6-digit hex values)
    backgroundColor: primaryColor + "1A",
  },
  label: { fontSize: 11, letterSpacing: 0.2 },
  labelActive: { color: primaryColor, fontWeight: "800" },
  labelInactive: { color: INACTIVE, fontWeight: "600" },

  offlineBadge: {
    position: "absolute",
    alignSelf: "center",
    top: -96, // taller than the old pill, so nudge to taste
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 300,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.text,
    zIndex: 21,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  offlineIconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.18)",
  },
  offlineTextWrap: {
    flexShrink: 1,
  },
  offlineTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  offlineSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  // small caret pointing down at the report button
  offlineTail: {
    position: "absolute",
    bottom: -5,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
    backgroundColor: colors.text,
    transform: [{ rotate: "45deg" }],
  },
});
