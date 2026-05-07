import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { colors, spacing } from "../lib/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [agentName, setAgentName] = useState("");
  const [loading, setLoading] = useState(false);

  async function devLogin() {
    const name = agentName.trim();
    if (!name) {
      Alert.alert("Error", "Enter your agent name");
      return;
    }

    setLoading(true);

    const { data: agents } = await supabase
      .from("agents")
      .select("agent_id, agent_name")
      .eq("agent_name", name)
      .limit(1);

    if (!agents || agents.length === 0) {
      Alert.alert("Not Found", `No agent named "${name}" exists.`);
      setLoading(false);
      return;
    }

    const devEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@shellforge.dev`;
    const devPassword = "shellforge2024dev";

    let { error } = await supabase.auth.signInWithPassword({
      email: devEmail,
      password: devPassword,
    });

    if (error) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: devEmail,
        password: devPassword,
      });

      if (signUpError) {
        Alert.alert("Error", signUpError.message);
        setLoading(false);
        return;
      }

      if (signUpData.session) {
        const userId = signUpData.user?.id;
        if (userId) {
          await supabase
            .from("agents")
            .update({ user_id: userId })
            .eq("agent_id", agents[0].agent_id);
        }
        setLoading(false);
        return;
      }

      const { error: retryError } = await supabase.auth.signInWithPassword({
        email: devEmail,
        password: devPassword,
      });

      if (retryError) {
        Alert.alert(
          "Almost There",
          "Account created. If email confirmation is enabled in Supabase, disable it in Dashboard → Auth → Settings → Email Confirmations → OFF, then try again."
        );
        setLoading(false);
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("agents")
        .update({ user_id: user.id })
        .eq("agent_id", agents[0].agent_id);
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 40 }]}>
        <View style={styles.header}>
          <View style={styles.logoGlow} />
          <Text style={styles.title}>SHELLFORGE</Text>
          <Text style={styles.subtitle}>R E A L M S</Text>
          <View style={styles.line} />
          <Text style={styles.tagline}>Companion Terminal</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>AGENT NAME</Text>
          <TextInput
            style={styles.input}
            value={agentName}
            onChangeText={setAgentName}
            placeholder="Seth07"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={devLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "CONNECTING..." : "CONNECT"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Enter your agent name to connect
        </Text>
        <Text style={[styles.footer, { marginTop: 8, fontSize: 9, color: colors.textMuted }]}>
          DEV MODE — password auth disabled
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
    position: "relative",
  },
  logoGlow: {
    position: "absolute",
    top: -20,
    width: 200,
    height: 100,
    borderRadius: 100,
    backgroundColor: "rgba(0,240,255,0.03)",
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    letterSpacing: 12,
    marginTop: 4,
  },
  line: {
    width: 60,
    height: 1,
    backgroundColor: colors.primary,
    marginVertical: 16,
    opacity: 0.3,
  },
  tagline: {
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    fontWeight: "600",
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.bgDeep,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },
  footer: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 32,
    letterSpacing: 0.5,
  },
});
