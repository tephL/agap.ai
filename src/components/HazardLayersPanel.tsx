import React from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HAZARD_COLORS, { HAZARD_LEGENDS } from "@/constants/hazardColors";
import { HAZARD_LAYERS, type HazardLayerConfig } from "@/lib/pmtiles/downloadLayer";
import { MAP_LAYERS } from "@/components/hazards/common/layerRegistry";
import { useOfflinePMTilesLayer } from "@/hooks/useOfflinePMTilesLayer";

/**
 * Bottom-sheet "layers" panel with two tabs:
 *   - Hazards: pick which single hazard layer is overlaid on the map and
 *     manage offline copies (download / remove). Only one renders at a time.
 *   - Map layers: toggleable map features (typhoons, storm signals, rain).
 *
 * Per-layer download state is independent of selection, so every row keeps
 * working (download/resume/remove) whether selected or not.
 */

type PanelTab = "hazards" | "map";

interface LayerRowProps {
  config: HazardLayerConfig;
  active: boolean;
  onSelect: () => void;
  onAskAI: (layerId: string) => void;
}

const LAYER_DESCRIPTIONS: Record<string, string> = {
  flood_5yr:
    "Mga lugar na malamang na bahain sa isang karaniwang 5 taon na bagyo",
  flood_25yr:
    "Mga lugar na malamang na bahain sa isang 1 sa 25 taon na bagyo",
  flood_100yr:
    "Mga lugar na malamang na bahain sa isang 1 sa 100 taon na matinding bagyo",
  landslide:
    "Mga zona na madulas batay sa hulmahan, lupa, at ulan",
};

function LayerRow({ config, active, onSelect, onAskAI }: LayerRowProps) {
  const { status, progress, download, remove } =
    useOfflinePMTilesLayer(config.id);
  const palette = HAZARD_COLORS[config.hazardType];
  // Badge shows the layer's own legend ramp (flood = 3 steps, others = one).
  const swatchColors = (HAZARD_LEGENDS[config.hazardType] ?? []).map(
    (item) => item.color
  );
  const swatches = swatchColors.length > 0 ? swatchColors : [palette.fill];

  // Download status stays visible even when unselected so an in-flight
  // offline copy isn't orphaned silently in the background.
  const metaText =
    status === "downloading"
      ? `~${config.approxSizeMB} MB · nagda-download ${progress}%`
      : status === "ready"
        ? `~${config.approxSizeMB} MB · naka-save offline`
        : status === "error"
          ? `~${config.approxSizeMB} MB · nabigo ang download`
          : `~${config.approxSizeMB} MB · nag-stream`;
  const metaColor =
    status === "error" ? "#DC2626" : status === "ready" ? "#16A34A" : "#6B7280";

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={config.label}
      style={[
        styles.card,
        {
          backgroundColor: active
            ? withAlpha(palette.stroke, 0.07)
            : "#FFFFFF",
          borderColor: active
            ? withAlpha(palette.stroke, 0.4)
            : "rgba(15,23,42,0.08)",
          shadowOpacity: active ? 0.14 : 0.06,
          elevation: active ? 6 : 2,
        },
      ]}
    >
      <View style={styles.swatchBadge}>
        {swatches.map((color, index) => (
          <View
            key={`${color}-${index}`}
            style={[styles.swatchBar, { backgroundColor: color }]}
          />
        ))}
      </View>

      <View style={styles.cardInfo}>
        <View style={styles.labelRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.cardLabel,
              { color: active ? "#111827" : "#374151", flexShrink: 1 },
            ]}
          >
            {config.label}
          </Text>
          {config.recommended ? (
            <View
              style={[styles.pill, active && { backgroundColor: palette.stroke }]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                Inirerekomenda
              </Text>
            </View>
          ) : null}
        </View>
        {LAYER_DESCRIPTIONS[config.id] ? (
          <Text style={styles.cardDescription}>
            {LAYER_DESCRIPTIONS[config.id]}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: metaColor }]}>{metaText}</Text>
        {status === "downloading" ? (
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                {
                  width: `${Math.max(progress, 4)}%`,
                  backgroundColor: palette.stroke,
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.rowActions}>
        <View
          style={[
            styles.checkCircle,
            active && {
              backgroundColor: palette.stroke,
              borderColor: palette.stroke,
            },
          ]}
        >
          {active ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onAskAI(config.id)}
            hitSlop={8}
            accessibilityLabel={`Tanong sa AI tungkol sa ${config.label}`}
          >
            <Ionicons name="help" size={14} color="#6B7280" />
          </TouchableOpacity>

          {status === "ready" ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={remove}
              hitSlop={8}
              accessibilityLabel="Alisin ang offline copy"
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
            </TouchableOpacity>
          ) : status === "not-downloaded" || status === "error" ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={download}
              hitSlop={8}
              accessibilityLabel="I-download para sa offline"
            >
              <Ionicons
                name="cloud-download-outline"
                size={15}
                color={status === "error" ? "#DC2626" : "#208AEF"}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Shape of a layerRegistry entry (plain JS module, typed here). */
interface MapLayerRowConfig {
  key: string;
  label: string;
  activeColor?: string;
  description?: string;
  icon?: string;
}

const TRACK_WIDTH = 46;
const THUMB_SIZE = 22;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 6;

/** #rgb / #rrggbb -> rgba() so a layer's accent can be tinted softly. */
function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const value = parseInt(full, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${
    value & 255
  }, ${alpha})`;
}

/** Slim pill switch — thumb slides with the layer's accent colour. */
function LayerToggle({ visible, color }: { visible: boolean; color: string }) {
  // lazy state keeps one stable Animated.Value for the component's lifetime
  // without reading a ref during render
  const [progress] = React.useState(() => new Animated.Value(visible ? 1 : 0));

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const thumbX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });

  return (
    <View
      style={[
        styles.toggleTrack,
        { backgroundColor: visible ? color : "#E5E7EB" },
      ]}
    >
      <Animated.View
        style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]}
      />
    </View>
  );
}

function MapLayerRow({
  config,
  visible,
  onToggle,
}: {
  config: MapLayerRowConfig;
  visible: boolean;
  onToggle: () => void;
}) {
  const color = config.activeColor ?? "#9CA3AF";
  const iconName = (config.icon ??
    "layers-outline") as React.ComponentProps<typeof Ionicons>["name"];

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: visible }}
      accessibilityLabel={config.label}
      style={styles.card}
    >
      <View style={[styles.cardBadge, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={iconName} size={21} color={color} />
      </View>

      <View style={styles.cardInfo}>
        <Text style={[styles.cardLabel, { color: "#111827" }]}>
          {config.label}
        </Text>
        {config.description ? (
          <Text style={styles.cardDescription}>{config.description}</Text>
        ) : null}
      </View>

      <LayerToggle visible={visible} color={color} />
    </TouchableOpacity>
  );
}

interface HazardLayersPanelProps {
  visible: boolean;
  onClose: () => void;
  /** The one layer currently overlaid on the map (null = none). */
  activeId: string | null;
  /**
   * Called with a layer id when a row is picked; passing that same id back
   * deselects it. Download state of every layer is unaffected.
   */
  onSelect: (layerId: string | null) => void;
  /** Called with a layer id when the user taps the ? button. */
  onAskAI: (layerId: string) => void;
  /** Toggleable map features (dams, fault lines, ...). */
  visibleLayers?: Record<string, boolean>;
  onToggleLayer?: (key: string) => void;
}

export default function HazardLayersPanel({
  visible,
  onClose,
  activeId,
  onSelect,
  onAskAI,
  visibleLayers,
  onToggleLayer,
}: HazardLayersPanelProps) {
  const [tab, setTab] = React.useState<PanelTab>("map");
  // The floating layers button always lands on the "Map layers" tab. Adjusted
  // during render (React's documented derived-state-from-props pattern)
  // instead of in an effect.
  const [wasOpen, setWasOpen] = React.useState(visible);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) setTab("map");
  }
  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      {/* backdrop tap closes the sheet; inner Pressable swallows sheet taps */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Map Layers</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, tab === "hazards" && styles.tabActive]}
              onPress={() => setTab("hazards")}
            >
              <Text
                style={[styles.tabText, tab === "hazards" && styles.tabTextActive]}
              >
                Hazards
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === "map" && styles.tabActive]}
              onPress={() => setTab("map")}
            >
              <Text
                style={[styles.tabText, tab === "map" && styles.tabTextActive]}
              >
                Map layers
              </Text>
            </TouchableOpacity>
          </View>

          {tab === "hazards" ? (
            <>
              <Text style={styles.subtitle}>
                Select a hazard overlay to view on the map. Only one layer can
                be shown at a time to keep performance smooth.
              </Text>

              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <View style={styles.cardList}>
                  {HAZARD_LAYERS.map((layer) => (
                    <LayerRow
                      key={layer.id}
                      config={layer}
                      active={activeId === layer.id}
                      onSelect={() =>
                        onSelect(activeId === layer.id ? null : layer.id)
                      }
                      onAskAI={onAskAI}
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.mapListContent}
              nestedScrollEnabled
            >
                <Text style={styles.subtitle}>
                  Only one map overlay at a time — turning one on turns the
                  others off.
                </Text>
              <View style={styles.cardList}>
                {(MAP_LAYERS ?? []).map((layer) => (
                  <MapLayerRow
                    key={layer.key}
                    config={layer}
                    visible={visibleLayers?.[layer.key] ?? false}
                    onToggle={() => onToggleLayer?.(layer.key)}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  tabBar: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#FFFFFF" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#111827" },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 8,
  },
  list: {
    paddingBottom: 10, 
    flexShrink: 1, 
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  mapListContent: {
    paddingBottom: 8,
  },
  cardList: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 1.5,
    elevation: 2,
  },
  swatchBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  swatchBar: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
  },
  pillText: { fontSize: 9, fontWeight: "700", color: "#208AEF" },
  pillTextActive: { color: "#FFFFFF" },
  meta: { fontSize: 11, color: "#6B7280", marginTop: 3 },
  track: {
    height: 4,
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: "#208AEF" },
  rowActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
