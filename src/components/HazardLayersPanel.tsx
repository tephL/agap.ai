import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import HAZARD_COLORS from "@/constants/hazardColors";
import { HAZARD_LAYERS, type HazardLayerConfig } from "@/lib/pmtiles/downloadLayer";
import { MAP_LAYERS } from "@/components/hazards/common/layerRegistry";
import { useOfflinePMTilesLayer } from "@/hooks/useOfflinePMTilesLayer";

/**
 * Bottom-sheet "layers" panel with two tabs:
 *   - Hazards: pick which single hazard layer is overlaid on the map and
 *     manage offline copies (download / remove). Only one renders at a time.
 *   - Map layers: toggleable map features (dams, fault lines, ...).
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

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={onSelect}
        activeOpacity={0.6}
      >
        <Ionicons
          name={active ? "radio-button-on" : "radio-button-off"}
          size={22}
          color={active ? "#208AEF" : "#9CA3AF"}
        />
        <View style={[styles.dot, { backgroundColor: palette.stroke }]} />
        <View style={styles.info}>
          {config.recommended ? (
            <View style={[styles.badge, active && styles.badgeActive]}>
              <Text
                style={[
                  styles.badgeText,
                  active && styles.badgeTextActive,
                ]}
              >
                Inirerekomenda
              </Text>
            </View>
          ) : null}
          <Text style={[styles.label, !active && styles.labelDisabled]}>
            {config.label}
          </Text>
          {LAYER_DESCRIPTIONS[config.id] ? (
            <Text style={styles.description}>
              {LAYER_DESCRIPTIONS[config.id]}
            </Text>
          ) : null}
          <Text style={styles.meta}>{metaText}</Text>
          {status === "downloading" ? (
            <View style={styles.track}>
              <View
                style={[
                  styles.trackFill,
                  { width: `${Math.max(progress, 4)}%` },
                ]}
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.helpButton}
        onPress={() => onAskAI(config.id)}
        hitSlop={8}
      >
        <Ionicons name="help" size={14} color="#6B7280" />
      </TouchableOpacity>

      {status === "ready" ? (
        <TouchableOpacity style={styles.actionButton} onPress={remove}>
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </TouchableOpacity>
      ) : status === "not-downloaded" || status === "error" ? (
        <TouchableOpacity style={styles.actionButton} onPress={download}>
          <Ionicons
            name="cloud-download-outline"
            size={16}
            color={status === "error" ? "#DC2626" : "#208AEF"}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Shape of a layerRegistry entry (plain JS module, typed here). */
interface MapLayerRowConfig {
  key: string;
  label: string;
  activeColor?: string;
  description?: string;
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
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View
          style={[styles.dot, { backgroundColor: config.activeColor ?? "#9CA3AF" }]}
        />
        <View style={styles.info}>
          <Text style={styles.label}>{config.label}</Text>
          {config.description ? (
            <Text style={styles.description}>{config.description}</Text>
          ) : null}
        </View>
      </View>
      <Switch
        value={visible}
        onValueChange={onToggle}
        trackColor={{ false: "#E5E7EB", true: "#208AEF" }}
        thumbColor="#FFFFFF"
      />
    </View>
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
  // The floating layers button always lands on the "Map layers" tab.
  React.useEffect(() => {
    if (visible) setTab("map");
  }, [visible]);
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
              </ScrollView>
            </>
          ) : (
            <ScrollView style={styles.list} nestedScrollEnabled>
              <Text style={styles.subtitle}>
                Choose which map features are shown. Toggles apply instantly.
              </Text>
              {(MAP_LAYERS ?? []).map((layer) => (
                <MapLayerRow
                  key={layer.key}
                  config={layer}
                  visible={visibleLayers?.[layer.key] ?? false}
                  onToggle={() => onToggleLayer?.(layer.key)}
                />
              ))}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: "600", color: "#111827" },
  labelDisabled: { color: "#9CA3AF" },
  description: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    marginBottom: 2,
  },
  badgeActive: { backgroundColor: "#208AEF" },
  badgeText: { fontSize: 9, fontWeight: "700", color: "#208AEF" },
  badgeTextActive: { color: "#FFFFFF" },
  meta: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  track: {
    height: 4,
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: "#208AEF" },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  helpButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    marginLeft: 6,
    marginRight: 7
  },
});
