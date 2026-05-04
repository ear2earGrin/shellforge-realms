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
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../lib/supabase";
import { colors, spacing } from "../lib/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
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

  async function signInWithApple() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert("Error", "No identity token received from Apple");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      setLoading(false);

      if (error) {
        Alert.alert("Apple Sign In Failed", error.message);
      }
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", "Apple Sign In failed. Try email instead.");
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 40 }]}>
        {/* Branding */}
        <View style={styles.header}>
          <View style={styles.logoGlow} />
          <Text style={styles.title}>SHELLFORGE</Text>
          <Text style={styles.subtitle}>R E A L M S</Text>
          <View style={styles.line} />
          <Text style={styles.tagline}>Companion Terminal</Text>
        </View>

        {/* Form */}
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
            placeholder={"••••••••"}
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

          {Platform.OS === "ios" && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={12}
                style={styles.appleBtn}
                onPress={signInWithApple}
              />
            </>
          )}
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginHorizontal: 12,
  },
  appleBtn: {
    width: "100%" as unknown as number,
    height: 52,
  },
  footer: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 32,
    letterSpacing: 0.5,
  },
});
