import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Keyboard
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import colors from "@/constants/colors";
import ChatBubble, { parseSuggestions } from "@/components/ai/ChatBubble";
import SuggestionChips from "@/components/ai/SuggestionChips";
import TypingIndicator from "@/components/ai/TypingIndicator";
import useNetworkStatus from "@/hooks/useNetworkStatus";
import useLiveLocation from "@/hooks/useLiveLocation";
import {
  sendChatMessage,
  getChatHistory,
  clearChatHistory,
  getSuggestions,
} from "@/services/aiService";
import { getStormSignalsContext, getTyphoonsContext } from "@/context/hazardContext";

const SYSTEM_SUGGESTIONS = [
  { text: "Ano ang dapat kong gawin kapag may bagyo?", icon: "thunderstorm" },
  { text: "Paano ko gagawin ang aking emergency go-bag?", icon: "bag-check" },
  { text: "Saan ang pinakamalapit na evacuation center?", icon: "location" },
  { text: "Paano ko che-check ang hazard map sa aking lugar?", icon: "map" },
  { text: "Ano ang mga emergency supplies na kailangan ko?", icon: "water" },
  { text: "Paano ko gagawin ang emergency plan ng aking pamilya?", icon: "people" },
];

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "[IMPORMASYON] Ikaw ay may AI emergency assistant. Matutulungan kitang maging ligtas sa panahon ng kalamidad, maunawaan ang mga panganib sa iyong lugar, at gagabayan ka sa mga emerhensya.\n\nAno ang gusto mong malaman?",
};

export default function Assistant() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { question, hazardLayerId, hazardVar } = useLocalSearchParams();
  const { isOnline, isConnected, isInternetReachable } = useNetworkStatus();
  const { coords: liveCoords } = useLiveLocation();
  const coordsRef = useRef(null);
  useEffect(() => {
    coordsRef.current = liveCoords;
  }, [liveCoords]);
  const [messages, setMessages] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);
  const pendingQuestion = useRef(null);
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
  const showSub = Keyboard.addListener("keyboardDidShow", () => {
    setInputFocused(true);
    scrollToBottom();
  });

  const hideSub = Keyboard.addListener("keyboardDidHide", () => {
    setInputFocused(false);
  });

  return () => {
    showSub.remove();
    hideSub.remove();
  };
}, [scrollToBottom]);

  // Hazard context captured from the "?" button on a hazard layer. Router
  // params are strings, so re-quote the var level. Only sent with the
  // pre-filled question; typed follow-ups never include it.
  const currentHazardContext = useMemo(() => {
    const level = Number(hazardVar);
    if (hazardLayerId && [1, 2, 3].includes(level)) {
      return { hazardLayerId, hazardVar: level };
    }
    return null;
  }, [hazardLayerId, hazardVar]);

  const netInfoLabel = useMemo(() => {
    if (isConnected && isInternetReachable) return "Online";
    if (isConnected && isInternetReachable === null) return "Tinitingnan...";
    if (!isConnected) return "Walang koneksyon";
    return "Offline";
  }, [isConnected, isInternetReachable]);

  useEffect(() => {
    if (wasOnlineRef.current && !isOnline) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `[WARNING] Wala ka sa online.\n\nKoneksyon: ${isConnected ? "Nakakonekta sa network" : "Walang network interface"}\nInternet: ${isInternetReachable === null ? "Hindi alam" : isInternetReachable ? "Maabot" : "Hindi maabot"}\n\nHindi ko maabot ang AI service nang walang internet. Mangyaring suriin ang iyong koneksyon at subukan muli.`,
        },
      ]);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, isConnected, isInternetReachable]);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await getSuggestions();
      const apiSuggestions = data.suggestions || [];
      setSuggestions(apiSuggestions.length > 0 ? apiSuggestions : SYSTEM_SUGGESTIONS);
    } catch {
      setSuggestions(SYSTEM_SUGGESTIONS);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getChatHistory({ limit: 50 });
      if (data.messages && data.messages.length > 0) {
        const formatted = data.messages.map((m) => ({
          role: m.role,
          content: m.content,
          id: m.conversation_id,
        }));
        setMessages(formatted);
        const lastAssistant = [...formatted].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) {
          const followUps = parseSuggestions(lastAssistant.content);
          if (followUps.length > 0) {
            setSuggestions(followUps);
            return;
          }
        }
        loadSuggestions();
      } else {
        setMessages([WELCOME_MESSAGE]);
        loadSuggestions();
      }
    } catch {
      setMessages([WELCOME_MESSAGE]);
      loadSuggestions();
    }
  }, [loadSuggestions]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadHistory().then(() => {
      if (question) {
        pendingQuestion.current = question;
      }
    });
    loadSuggestions();
  }, [loadHistory, loadSuggestions, question]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, []);

  const handleSend = useCallback(
    async (text, hazardContext) => {
      const msg = (text || input).trim();
      if (!msg || loading) return;

      if (!isOnline) {
        const offlineMsg = {
          role: "assistant",
          content: `[WARNING] Wala ka sa online.\n\nKoneksyon: ${isConnected ? "Nakakonekta sa network" : "Walang network interface"}\nInternet: ${isInternetReachable === null ? "Hindi alam" : isInternetReachable ? "Maabot" : "Hindi maabot"}\n\nHindi ako makakapagpadala ng mensahe nang walang internet. Mangyaring suriin ang iyong koneksyon at subukan muli.`,
        };
        setMessages((prev) => [...prev, { role: "user", content: msg }, offlineMsg]);
        setInput("");
        scrollToBottom();
        return;
      }

      const userMessage = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);
      setSuggestions([]);
      scrollToBottom();

      try {
        const signalsContext = await getStormSignalsContext(
          coordsRef.current ?? null
        );
        const typhoonContext = await getTyphoonsContext();
        let contextLine = [];
        if (signalsContext?.active) {
          contextLine.push(`Storm signals: ${signalsContext.summary}`);
        }
        if (typhoonContext?.active) {
          contextLine.push(`Typhoons: ${typhoonContext.summary}`);
        }
        const outgoing =
          contextLine.length > 0
            ? `${msg}\n\n[HAZARD CONTEXT] ${contextLine.join(" ")}`
            : msg;
        const data = await sendChatMessage(outgoing, hazardContext);
        const assistantMessage = { role: "assistant", content: data.reply };
        setMessages((prev) => [...prev, assistantMessage]);
        const followUps = parseSuggestions(data.reply);
        if (followUps.length > 0) {
          setSuggestions(followUps);
        } else {
          loadSuggestions();
        }
        scrollToBottom();
      } catch {
        const errorMessage = {
          role: "assistant",
          content:
            "[WARNING] Paumanhin, hindi ko maiproseso ang iyong kahilingan sa ngayon. Mangyaring suriin ang iyong koneksyon at subukan muli.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [input, loading, scrollToBottom, loadSuggestions, isOnline, isConnected, isInternetReachable]
  );

  useEffect(() => {
    if (pendingQuestion.current && !loading && messages.length > 0) {
      const q = pendingQuestion.current;
      pendingQuestion.current = null;
      handleSend(q, currentHazardContext);
    }
  }, [loading, messages.length, handleSend, currentHazardContext]);

  const prevQuestion = useRef(question);
  useEffect(() => {
    if (question && question !== prevQuestion.current && !loading) {
      handleSend(question, currentHazardContext);
    }
    prevQuestion.current = question;
  }, [question, loading, handleSend, currentHazardContext]);

  const handleClearChat = useCallback(() => {
    Alert.alert(
      "Burahin ang usapan",
      "Mabubura ang lahat ng iyong kasaysayan ng chat sa assistant.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await clearChatHistory();
              setMessages([WELCOME_MESSAGE]);
              loadSuggestions();
            } catch {
              Alert.alert("Error", "Hindi nabura ang kasaysayan ng chat.");
            }
          },
        },
      ]
    );
  }, [loadSuggestions]);

  const handleSuggestionSelect = useCallback(
    (text, index) => {
      setSuggestions((prev) => prev.filter((_, i) => i !== index));
      handleSend(text);
    },
    [handleSend]
  );

  const renderItem = useCallback(
    ({ item }) => <ChatBubble message={item} isUser={item.role === "user"} />,
    []
  );

  const keyExtractor = useCallback(
    (item, index) => item.id?.toString() || `msg-${index}`,
    []
  );

  const renderHeader = useCallback(() => {
  if (messages.length > 1) return null;
  return (
    <View style={styles.welcomeContainer}>
      <View style={styles.logoHalo}>
        <View style={styles.logoRing}>
          <View style={styles.logoWrap}>
            <Image
              source={require("../../assets/icons/logo.png")}
              style={styles.logoImage}
            />
          </View>
        </View>
      </View>

      <Text style={styles.welcomeTitle}>AGAP.ai</Text>
      <View style={styles.taglinePill}>
        <Ionicons name="sparkles" size={11} color={colors.primary} />
        <Text style={styles.welcomeTagline}>MAAGAP NA KA-AGAPAY</Text>
      </View>
      <Text style={styles.welcomeSubtitle}>
        Ang iyong AI-powered na emergency assistant. Magtanong tungkol sa
        paghahanda sa kalamidad, mga tip sa kaligtasan, o gabay sa emerhensya.
      </Text>

      <Text style={styles.sectionLabel}>SUBUKAN MONG ITANONG</Text>
        <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.quickScroll}
      contentContainerStyle={styles.quickRow}
      keyboardShouldPersistTaps="handled"
    >
      {SYSTEM_SUGGESTIONS.map((s) => (
        <TouchableOpacity
          key={s.text}
          style={styles.quickPill}
          activeOpacity={0.8}
          onPress={() => handleSend(s.text)}
          disabled={loading || !isOnline}
        >
          <Ionicons name={s.icon} size={16} color={colors.primary} />
          <Text style={styles.quickText} numberOfLines={2}>
            {s.text}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
    </View>
  );
}, [messages.length, handleSend, loading, isOnline]);

  const renderFooter = useCallback(() => {
    if (loading) {
      return (
        <View>
          <TypingIndicator />
          <View style={{ height: 8 }} />
        </View>
      );
    }
    return <View style={{ height: 8 }} />;
  }, [loading]);

  return (
  <View style={styles.screen}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.bubbleA} pointerEvents="none" />
        <View style={styles.bubbleB} pointerEvents="none" />

        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)")}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.avatarSlot}>
            <View style={styles.headerAvatar}>
              <Image
                source={require("../../assets/icons/logo.png")}
                style={styles.headerLogo}
              />
            </View>
            <View style={[styles.avatarDot, !isOnline && styles.dotOffline]} />
          </View>

          <View>
            <Text style={styles.headerTitle}>AGAP.ai</Text>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, !isOnline && styles.dotOffline]} />
              <Text style={styles.headerStatus}>{netInfoLabel}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleClearChat}
          style={styles.headerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      {/* Chat sheet */}
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={scrollToBottom}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.flatList}
        />
      </View>

      {/* Input area */}
      <View style={[styles.inputBar, { paddingBottom: inputFocused ? 10 : 70 }]}>
        {suggestions.length > 0 && messages.length > 1 && (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={handleSuggestionSelect}
          />
        )}

        {!isOnline && (
          <View style={styles.offlineBar}>
            <View style={styles.offlineIconWrap}>
              <Ionicons name="cloud-offline" size={13} color={colors.white} />
            </View>
            <Text style={styles.offlineBarText}>
              Wala ka sa online. Hindi available ang mga AI na tugon.
            </Text>
          </View>
        )}

    <View
  style={[
    styles.inputWrap,
    inputFocused && isOnline && styles.inputWrapFocused,
    !isOnline && styles.inputWrapOffline,
  ]}
>
  <TextInput
    ref={inputRef}
    style={styles.textInput}
    placeholder={isOnline ? "Magtanong kay AGAP.ai..." : "Walang internet connection..."}
    placeholderTextColor={colors.placeholder}
    value={input}
    onChangeText={setInput}
    onFocus={() => { setInputFocused(true); scrollToBottom(); } }
    onBlur={() => setInputFocused(false)}
    multiline
    maxLength={2000}
    editable={!loading && isOnline}
    selectionColor={colors.primary}
    textAlignVertical="center"
  />
  <TouchableOpacity
    style={[
      styles.sendButton,
      (!input.trim() || loading || !isOnline) && styles.sendButtonDisabled,
    ]}
    onPress={() => handleSend()}
    disabled={!input.trim() || loading || !isOnline}
    activeOpacity={0.8}
  >
    <Ionicons
      name="arrow-up"
      size={20}
      color={!input.trim() || loading || !isOnline ? colors.muted : colors.white}
    />
  </TouchableOpacity>
</View>
      </View>
    </KeyboardAvoidingView>
  </View>
);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 30,
    backgroundColor: colors.primary,
    overflow: "hidden",
  },
  bubbleA: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  bubbleB: {
    position: "absolute",
    bottom: -60,
    left: 70,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSlot: { width: 46, height: 46 },
  headerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerLogo: { width: 46, height: 46 },
  avatarDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#34D399",
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#34D399" },
  dotOffline: { backgroundColor: "#F59E0B" },
  headerStatus: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.92)" },

  // Chat sheet
  chatArea: {
    flex: 1,
    marginTop: -16,
    backgroundColor: "#F5F7FB",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  flatList: { flex: 1 },
  chatContent: { paddingTop: 20, paddingBottom: 8 },

  // Welcome
  welcomeContainer: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  logoHalo: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoRing: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: "hidden",
  },
  logoImage: { width: 80, height: 80, borderRadius: 26 },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  taglinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primary + "14",
    marginBottom: 14,
  },
  welcomeTagline: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.5,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    alignSelf: "flex-start",
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.muted,
  },
  quickText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.text,
  },

  // Input area
  inputBar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: "#F5F7FB",
    gap: 10,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.white,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "#E5E9F2",
    paddingVertical: 5,
    paddingLeft: 18,
    paddingRight: 5,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  inputWrapFocused: { borderColor: colors.primary },
  inputWrapOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    includeFontPadding: false,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonDisabled: {
    backgroundColor: "#E5E7EB",
    shadowOpacity: 0,
    elevation: 0,
  },

  // Offline
  offlineBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  offlineIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  offlineBarText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  quickScroll: {
  alignSelf: "stretch",
  marginHorizontal: -20, // lets the row scroll edge to edge
},
quickRow: {
  paddingHorizontal: 20,
  gap: 8,
},
quickPill: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  maxWidth: 230,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 999,
  backgroundColor: colors.white,
  borderWidth: 1,
  borderColor: "#E5E9F2",
},
quickText: {
  flexShrink: 1,
  fontSize: 12.5,
  lineHeight: 16,
  fontWeight: "700",
  color: colors.text,
},
});
