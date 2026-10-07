import { StyleSheet } from "react-native";

/**
 * Shared visual language for the floating map legends (hazard overlay, storm
 * signals, typhoons, LPA, rain) so every legend reads as one system:
 *
 *   - frosted white surface, slate hairline border, soft lifted shadow
 *   - collapsed chip: accent dot + label + chevron-up hint
 *   - expanded card: uppercase micro-title with accent dot + small collapse
 *     button, then evenly spaced rows
 *
 * Components tint the dots with their own accent colour and keep only their
 * symbol-specific styles locally. Nothing here is absolutely positioned —
 * LegendStack owns placement.
 */
export const legendStyles = StyleSheet.create({
  wrapper: {
    alignItems: "flex-start",
  },

  // collapsed chip
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    includeFontPadding: false,
  },

  // expanded card
  card: {
    width: 236,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.10)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  titleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    includeFontPadding: false,
  },
  collapseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.05)",
    flexShrink: 0,
  },

  // micro section headings inside a card
  sectionLabel: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    includeFontPadding: false,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 3,
  },
  rowText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#374151",
    includeFontPadding: false,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    flexShrink: 0,
  },
  swatchWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#E5E7EB",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    overflow: "hidden",
    flexShrink: 0,
  },
});
