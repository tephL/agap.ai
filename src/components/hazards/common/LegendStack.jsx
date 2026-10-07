import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * Bottom-left container that stacks any number of legend chips/cards
 * vertically. Unlike the legends themselves (whose wrappers are plain flex
 * children), this is the one absolute-positioned element, so multiple legend
 * pills stack on top of each other instead of overlapping whenever several
 * overlays are toggled at once.
 */
export default function LegendStack({ children }) {
  return <View style={styles.stack}>{children}</View>;
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: 16,
    // shares a baseline with the bottom-right locate button (bottom:32), so
    // the legend pills and the map buttons read as one row of chrome
    bottom: 34,
    alignItems: "flex-start",
    gap: 10,
    zIndex: 15,
    elevation: 15,
  },
});
