import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { legendStyles } from "@/components/hazards/common/legendTheme";

// Rain intensity color ramp shared by the map overlay and the legend. Kept in
// sync with RainForecastTab.rainColor manually (mm buckets are the same).
const RAIN_STEPS = [
  { label: "None", color: "#E5E7EB" },
  { label: "1–25 mm (Light)", color: "#93C5FD" },
  { label: "26–50 mm (Moderate)", color: "#3B82F6" },
  { label: "51–100 mm (Heavy)", color: "#F59E0B" },
  { label: "100+ mm (Torrential)", color: "#DC2626" },
];

const ACCENT = "#3B82F6";

/**
 * Bottom-left legend explaining the Rain overlay's color ramp (daily rainfall
 * in mm). The `wrapper` is intentionally NOT absolute so it can stack inside
 * LegendStack.
 */
export default function RainLegend({ hidden = false, onToggle }) {
  if (hidden) {
    return (
      <View style={legendStyles.wrapper}>
        <TouchableOpacity
          style={legendStyles.chip}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Ipakita ang rain forecast legend"
          hitSlop={8}
        >
          <View style={[legendStyles.chipDot, { backgroundColor: ACCENT }]} />
          <Text style={legendStyles.chipText}>Rain Forecast</Text>
          <Ionicons name="chevron-up" size={14} color="#64748B" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={legendStyles.wrapper}>
      <View style={legendStyles.card}>
        <View style={legendStyles.header}>
          <View style={legendStyles.titleRow}>
            <View
              style={[legendStyles.titleDot, { backgroundColor: ACCENT }]}
            />
            <Text style={legendStyles.title}>Rain Forecast (today)</Text>
          </View>
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={8}
            style={legendStyles.collapseButton}
            accessibilityLabel="Itago ang rain forecast legend"
          >
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
        {RAIN_STEPS.map((step) => (
          <View key={step.label} style={legendStyles.row}>
            <View
              style={[
                legendStyles.swatch,
                { backgroundColor: step.color },
              ]}
            />
            <Text style={legendStyles.rowText} numberOfLines={2}>
              {step.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
