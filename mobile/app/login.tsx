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
import { supabase } from "../lib/supabase";
import { colors, spacing } from "../lib/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!email || !password) {
      Alert.alert("Error", "Enter email and password");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      Alert.alert("Sign In Failed", error.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>SHELLFORGE</Text>
          <Text style={styles.subtitle}>R E A L M S</Text>
          <View style={styles.line} />
          <Text style={styles.tagline}>Companion Terminal</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="operator@shellforge.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={signIn}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "AUTHENTICATING..." : "CONNECT"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Use your shellforge.com credentials
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
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
    opacity: 0.5,
  },
  tagline: {
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 2,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
  footer: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 32,
  },
});
