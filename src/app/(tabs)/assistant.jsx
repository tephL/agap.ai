import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);
  const pendingQuestion = useRef(null);
  const wasOnlineRef = useRef(isOnline);

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
        { text: "Kanselahin", style: "cancel" },
        {
          text: "Burahin",
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
        <View style={styles.logoWrap}>
          <Image
            source={require("../../assets/icons/logo.png")}
            style={styles.logoImage}
          />
        </View>
        <Text style={styles.welcomeTitle}>AGAP.ai</Text>
        <Text style={styles.welcomeTagline}>MAAGAP NA KA-AGAPAY</Text>
        <Text style={styles.welcomeSubtitle}>
          Ang iyong AI-powered na emergency assistant. Magtanong tungkol sa paghahanda sa kalamidad, mga tip sa kaligtasan, o gabay sa emerhensya.
        </Text>
      </View>
    );
  }, [messages.length]);

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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerAvatar}>
              <Image
                source={require("../../assets/icons/logo.png")}
                style={styles.headerLogo}
              />
            </View>
            <View>
              <Text style={styles.headerTitle}>AGAP.ai</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, !isOnline && styles.statusDotOffline]} />
                <Text style={styles.headerStatus}>{netInfoLabel}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleClearChat}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

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
            style={styles.flatList}
          />
        </View>

        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          {suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={handleSuggestionSelect}
            />
          )}
          {!isOnline && (
            <View style={styles.offlineBar}>
              <Ionicons name="cloud-offline" size={14} color="#B45309" />
              <Text style={styles.offlineBarText}>
                Wala ka sa online — Hindi available ang mga AI na tugon
              </Text>
            </View>
          )}
          <View style={[styles.inputWrap, !isOnline && styles.inputWrapOffline]}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={isOnline ? "Tanungin mo ako kahit ano..." : "Walang internet connection..."}
              placeholderTextColor={colors.placeholder}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              editable={!loading && isOnline}
              selectionColor={colors.primary}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!input.trim() || loading || !isOnline) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || loading || !isOnline}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-up"
                size={22}
                fontWeight="bold"
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
  screen: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: colors.primary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.3,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },
  statusDotOffline: {
    backgroundColor: "#F59E0B",
  },
  headerStatus: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#F8F9FB",
  },
  welcomeContainer: {
    alignItems: "center",
    paddingHorizontal: 36,
    paddingTop: 32,
    paddingBottom: 16,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    overflow: "hidden",
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 22,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  welcomeTagline: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  flatList: {
    flex: 1,
  },
  chatContent: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 6,
    backgroundColor: "#F8F9FB",
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingLeft: 16,
    paddingRight: 5,
    minHeight: 46,
    maxHeight: 120,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 11,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginBottom: 5,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: "#E5E7EB",
    shadowOpacity: 0,
    elevation: 0,
  },
  offlineBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  offlineBarText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  inputWrapOffline: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
});
