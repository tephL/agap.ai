import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { legendStyles } from "@/components/hazards/common/legendTheme";

const ACCENT = "#EAB308";

/**
 * Bottom-left legend explaining the Low Pressure Area overlay symbol: a yellow
 * solid-outline hollow circle marking the low's center, plus the dashed blue
 * Philippine Area of Responsibility boundary. Collapses to a compact chip. The
 * `wrapper` is intentionally NOT absolute so it can stack inside LegendStack.
 */
export default function LPALegend({ hidden = false, onToggle }) {
  if (hidden) {
    return (
      <View style={legendStyles.wrapper}>
        <TouchableOpacity
          style={legendStyles.chip}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Ipakita ang low pressure area legend"
          hitSlop={8}
        >
          <View style={[legendStyles.chipDot, { backgroundColor: ACCENT }]} />
          <Text style={legendStyles.chipText}>Low Pressure Area</Text>
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
            <Text style={legendStyles.title}>Low Pressure Area</Text>
          </View>
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={8}
            style={legendStyles.collapseButton}
            accessibilityLabel="Itago ang low pressure area legend"
          >
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>

        <View style={legendStyles.row}>
          <View style={styles.symbolBox}>
            <View style={styles.circle} />
          </View>
          <Text style={legendStyles.rowText}>
            Low pressure area center (hollow circle)
          </Text>
        </View>
        <View style={legendStyles.row}>
          <View style={styles.symbolBox}>
            <View style={styles.parLine} />
          </View>
          <Text style={legendStyles.rowText}>
            Philippine Area of Responsibility (PAR)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  symbolBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FACC15",
    backgroundColor: "transparent",
  },
  parLine: {
    width: 22,
    height: 0,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: "#0EA5E9",
  },
});
