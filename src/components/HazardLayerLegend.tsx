import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { HAZARD_LEGENDS, default as HAZARD_COLORS } from "@/constants/hazardColors";
import { getHazardLayer } from "@/lib/pmtiles/downloadLayer";
import { legendStyles } from "@/components/hazards/common/legendTheme";

interface HazardLayerLegendProps {
  /** The one layer currently overlaid on the map (null = none). */
  activeId: string | null;
  /** Collapsed into the small chip; tap it to expand. */
  hidden: boolean;
  /** Flip between the chip and the full legend card. */
  onToggle: () => void;
}

/** Short, single-line names for the chip + card titles. */
const TYPE_TITLES: Record<string, string> = {
  flood: "Flood Hazard",
  landslide: "Landslide",
  "debris-flow": "Debris Flow",
  "storm-surge": "Storm Surge",
};

/**
 * Bottom-left legend explaining what the active hazard overlay's colors
 * mean (flood low/medium/high blue steps, landslide-prone areas, etc.).
 * Collapses into a compact chip when hidden — the only hide/show control
 * lives on the map itself. Renders nothing when no layer is active.
 */
export default function HazardLayerLegend({
  activeId,
  hidden,
  onToggle,
}: HazardLayerLegendProps) {
  if (!activeId) return null;

  const config = getHazardLayer(activeId);
  const items = HAZARD_LEGENDS[config.hazardType];
  const accent = HAZARD_COLORS[config.hazardType].stroke;
  const title = TYPE_TITLES[config.hazardType] ?? "Hazard";

  if (hidden) {
    return (
      <View style={legendStyles.wrapper}>
        <TouchableOpacity
          style={legendStyles.chip}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel="Ipakita ang legend"
          hitSlop={8}
        >
          <View style={[legendStyles.chipDot, { backgroundColor: accent }]} />
          <Text style={legendStyles.chipText} numberOfLines={1}>
            {title}
          </Text>
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
            <View style={[legendStyles.titleDot, { backgroundColor: accent }]} />
            <Text style={legendStyles.title}>{title}</Text>
          </View>
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={8}
            style={legendStyles.collapseButton}
            accessibilityLabel="Itago ang legend"
          >
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {config.label}
        </Text>

        {items.map((item) => {
          const isFlood = config.hazardType === "flood";
          const alpha = isFlood ? HAZARD_COLORS.flood.opacity : 1;
          // Convert hex → rgba at the layer's opacity so the legend
          // swatch matches the subtle look of what's actually rendered.
          const swatchColor =
            alpha < 1
              ? `${item.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
              : item.color;
          return (
            <View key={item.color + item.label} style={legendStyles.row}>
              {isFlood ? (
                <View style={[legendStyles.swatchWrap, styles.floodWrap]}>
                  <View
                    style={[styles.floodSwatch, { backgroundColor: swatchColor }]}
                  />
                </View>
              ) : (
                <View
                  style={[
                    legendStyles.swatch,
                    styles.plainSwatch,
                    { backgroundColor: item.color },
                  ]}
                />
              )}
              <Text style={legendStyles.rowText} numberOfLines={2}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 244,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
    includeFontPadding: false,
  },
  // flood swatches sit on a pale frame so the 28%-opacity fill reads the way
  // it does on the map
  floodWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  floodSwatch: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  plainSwatch: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
});
