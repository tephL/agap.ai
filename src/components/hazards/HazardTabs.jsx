import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const TABS = [
  {
    key: "nearYou",
    label: "Near You",
    icon: "location-outline",
  },
  {
    key: "weatherBulletins",
    label: "Weather",
    icon: "newspaper-outline",
  },
  {
    key: "typhoons",
    label: "Tropical Cyclones",
    icon: "thunderstorm-outline",
  },
  {
    key: "rainForecast",
    label: "Rain",
    icon: "rainy-outline",
  },
  { key: "dams", label: "Dams", icon: "water-outline" },
];

export default function HazardTabs({ activeTab, onChangeTab }) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onChangeTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={13}
                color={isActive ? "#FFFFFF" : "#737B8C"}
              />
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
  },
  tabRow: {
    paddingHorizontal: 12,
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  chipActive: {
    backgroundColor: "#E32F31",
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#737B8C",
  },
  chipLabelActive: {
    color: "#FFFFFF",
  },
});
