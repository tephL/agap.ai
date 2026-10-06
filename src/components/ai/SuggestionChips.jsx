import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "@/constants/colors";

export default function SuggestionChips({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flash" size={13} color={colors.primary} />
        <Text style={styles.headerText}>Mga iminumungkahing tanong</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.chip}
            activeOpacity={0.7}
            onPress={() => onSelect(item.text, index)}
          >
            <Ionicons name={item.icon || "chatbubble-ellipses"} size={14} color={colors.primary} />
            <Text style={styles.chipText} numberOfLines={2}>
              {item.text}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
    paddingLeft: 8,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.2,
  },
  scrollContent: {
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: "#F0F0F5",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 230,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    flexShrink: 1,
    lineHeight: 17,
  },
});
