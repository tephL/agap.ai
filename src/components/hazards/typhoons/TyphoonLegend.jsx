import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { INTENSITY_COLORS } from "@/lib/typhoonTracks/trackJson";
import { legendStyles } from "@/components/hazards/common/legendTheme";

const INTENSITY_ROWS = [
  { key: "superTyphoon", label: "Super Typhoon", marker: "STY" },
  { key: "severeTyphoon", label: "Severe Typhoon", marker: "TY" },
  { key: "typhoon", label: "Typhoon", marker: "T" },
  { key: "severeStorm", label: "Severe Tropical Storm", marker: "STS" },
  { key: "tropicalStorm", label: "Tropical Storm", marker: "S" },
  { key: "depression", label: "Tropical Depression", marker: "D" },
];

const CONE_COLOR = "#FACC15";
const CONE_COLOR_EDGE = "#CA8A04";
const ACCENT = "#0EA5E9";

/**
 * Bottom-left legend for the Typhoons track overlay. Collapses into a compact
 * chip when hidden. Rendered only while the Typhoons layer is toggled on.
 */
export default function TyphoonLegend({ hidden = false, onToggle }) {
  if (hidden) {
    return (
      <View style={legendStyles.wrapper}>
        <TouchableOpacity
          style={legendStyles.chip}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Ipakita ang typhoons legend"
          hitSlop={8}
        >
          <View style={[legendStyles.chipDot, { backgroundColor: ACCENT }]} />
          <Text style={legendStyles.chipText}>Typhoons</Text>
          <Ionicons name="chevron-up" size={14} color="#64748B" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={legendStyles.wrapper}>
      <View style={[legendStyles.card, styles.card]}>
        <View style={legendStyles.header}>
          <View style={legendStyles.titleRow}>
            <View
              style={[legendStyles.titleDot, { backgroundColor: ACCENT }]}
            />
            <Text style={legendStyles.title}>Typhoon Tracks</Text>
          </View>
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={8}
            style={legendStyles.collapseButton}
            accessibilityLabel="Itago ang typhoons legend"
          >
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>

        <Text style={legendStyles.sectionLabel}>Track</Text>
        <View style={legendStyles.row}>
          <View style={[styles.lineSwatch, styles.pastLine]} />
          <Text style={legendStyles.rowText}>Past track</Text>
        </View>
        <View style={legendStyles.row}>
          <View style={[styles.lineSwatch, styles.forecastLine]} />
          <Text style={legendStyles.rowText}>Forecast path</Text>
        </View>

        <Text style={legendStyles.sectionLabel}>Uncertainty</Text>
        <View style={legendStyles.row}>
          <View style={[legendStyles.swatch, styles.coneSwatch]} />
          <Text style={legendStyles.rowText}>Cone of uncertainty</Text>
        </View>

        <Text style={legendStyles.sectionLabel}>Current position</Text>
        <View style={legendStyles.row}>
          <View style={styles.eyeStack}>
            <View style={styles.impactSwatch} />
            <View style={styles.eyeRing} />
            <View style={styles.eyeDot} />
          </View>
          <Text style={legendStyles.rowText}>
            <Text style={styles.rowTextStrong}>Eye</Text> = current center,
            inside the impact halo (storm size)
          </Text>
        </View>
        <View style={legendStyles.row}>
          <View style={styles.badgeText}>
            <Text style={styles.badgeLabel}>12H</Text>
          </View>
          <Text style={legendStyles.rowText}>
            Forecast positions (24H, 36H, …)
          </Text>
        </View>

        <Text style={legendStyles.sectionLabel}>Intensity</Text>
        {INTENSITY_ROWS.map(({ key, label, marker }) => (
          <View key={key} style={legendStyles.row}>
            <View
              style={[
                styles.markerBadge,
                { borderColor: INTENSITY_COLORS[key] },
              ]}
            >
              <Text
                style={[
                  styles.markerLetter,
                  { color: INTENSITY_COLORS[key] },
                ]}
              >
                {marker}
              </Text>
            </View>
            <Text style={legendStyles.rowText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // the track card carries more rows, so it is slightly wider
  card: {
    width: 252,
  },
  lineSwatch: {
    width: 22,
    height: 3,
    borderRadius: 2,
    flexShrink: 0,
  },
  pastLine: {
    backgroundColor: "#475569",
  },
  forecastLine: {
    backgroundColor: "#0EA5E9",
  },
  coneSwatch: {
    backgroundColor: CONE_COLOR,
    borderColor: CONE_COLOR_EDGE,
    opacity: 0.9,
  },
  impactSwatch: {
    position: "absolute",
    width: 20,
    height: 20,
    left: 1,
    top: 1,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: "#9b1c31",
    backgroundColor: "transparent",
  },
  eyeStack: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eyeRing: {
    position: "absolute",
    width: 16,
    height: 16,
    left: 3,
    top: 3,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: "#ef4444",
    backgroundColor: "transparent",
  },
  eyeDot: {
    position: "absolute",
    width: 6,
    height: 6,
    left: 8,
    top: 8,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },
  badgeText: {
    minWidth: 30,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0369A1",
    includeFontPadding: false,
  },
  markerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  markerLetter: {
    fontSize: 9,
    fontWeight: "700",
    includeFontPadding: false,
  },
  rowTextStrong: {
    fontWeight: "700",
    color: "#111827",
  },
});
