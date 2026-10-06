import { Tabs, useRouter } from "expo-router";
import CustomTabBar from '../../components/CustomTabBar';
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import colors from "../../constants/colors";
import { getStoredSession } from "../../services/authService";
import {
  getDispatcherSession,
} from "../../services/dispatcherService";

export default function RootLayout() {
  const router = useRouter()
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function guard() {
      const session = await getStoredSession();

      if (!session) {
        const dispatcherSession = await getDispatcherSession();
        if (!active) return;

        if (dispatcherSession) {
          router.replace("/map");
          return;
        }

        router.replace("/login");
        return;
      }

      if (active) setChecking(false);
    }

    guard();

    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1c1c1cff',
          headerShown: false
        }}
        tabBar={(props) => {
          const routeName = props.state?.routes?.[props.state.index]?.name;
          if (routeName === 'assistant') return null;
          return <CustomTabBar {...props} />;
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="assistant" options={{ title: 'Assistant' }} />
        <Tabs.Screen name="report" options={{ title: 'Report' }} />
        <Tabs.Screen name="family" options={{ title: 'Family' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
