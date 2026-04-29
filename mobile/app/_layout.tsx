import { useEffect, useState, useCallback } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import { registerForPushNotifications } from "../lib/notifications";
import { AIConsentModal, hasGivenAIConsent } from "../components/AIConsentModal";
import { ForceUpdate } from "../components/ForceUpdate";
import { checkMinVersion } from "../lib/version";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  authenticateWithBiometric,
} from "../lib/biometric";
import { useAppRefresh } from "../lib/useAppRefresh";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [versionOk, setVersionOk] = useState(true);
  const [biometricLocked, setBiometricLocked] = useState(false);

  const init = useCallback(async () => {
    const vOk = await checkMinVersion();
    setVersionOk(vOk);
    if (!vOk) {
      setLoading(false);
      return;
    }

    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    setSession(s);

    if (s) {
      const [bioAvail, bioEnabled] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
      ]);
      if (bioAvail && bioEnabled) {
        setBiometricLocked(true);
        const ok = await authenticateWithBiometric();
        setBiometricLocked(!ok);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, [init]);

  useEffect(() => {
    if (!session) return;

    hasGivenAIConsent().then((consented) => {
      if (!consented) setShowConsent(true);
    });

    registerForPushNotifications();
  }, [session]);

  useAppRefresh(
    useCallback(() => {
      checkMinVersion().then(setVersionOk);
    }, [])
  );

  if (loading || biometricLocked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!versionOk) {
    return (
      <>
        <StatusBar style="light" />
        <ForceUpdate />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AIConsentModal
        visible={showConsent}
        onAccept={() => setShowConsent(false)}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="create-agent"
              options={{ presentation: "modal" }}
            />
          </>
        ) : (
          <Stack.Screen name="login" />
        )}
      </Stack>
    </>
  );
}
