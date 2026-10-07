import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  PAGASA_TCWS_COLORS,
  PAGASA_TCWS_LABELS,
} from "@/services/stormSignalService";
import { legendStyles } from "@/components/hazards/common/legendTheme";

const LEVELS = [1, 2, 3, 4, 5];
const ACCENT = "#E32F31";

/**
 * Bottom-left legend explaining the TCWS signal colors. Collapses into a
 * compact chip when hidden — tap the chip (or the header chevron) to flip.
 * Rendered only while the Storm Signals layer is toggled on.
 */
export default function StormSignalLegend({ hidden = false, onToggle }) {
  if (hidden) {
    return (
      <View style={legendStyles.wrapper}>
        <TouchableOpacity
          style={legendStyles.chip}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Ipakita ang storm signals legend"
          hitSlop={8}
        >
          <View style={[legendStyles.chipDot, { backgroundColor: ACCENT }]} />
          <Text style={legendStyles.chipText}>Storm Signals</Text>
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
            <Text style={legendStyles.title}>Storm Signals (TCWS)</Text>
          </View>
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={8}
            style={legendStyles.collapseButton}
            accessibilityLabel="Itago ang storm signals legend"
          >
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
        {LEVELS.map((level) => (
          <View key={level} style={legendStyles.row}>
            <View
              style={[
                legendStyles.swatch,
                { backgroundColor: PAGASA_TCWS_COLORS[level] },
              ]}
            />
            <Text style={legendStyles.rowText} numberOfLines={2}>
              {level} — {PAGASA_TCWS_LABELS[level]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
