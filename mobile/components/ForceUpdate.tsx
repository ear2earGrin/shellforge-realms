import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { colors, spacing } from "../lib/theme";

const STORE_URL = Platform.select({
  ios: "https://apps.apple.com/app/shellforge-realms/id0000000000",
  android: "https://play.google.com/store/apps/details?id=com.shellforge.realms",
  default: "",
});

export function ForceUpdate() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>UPDATE REQUIRED</Text>
      <Text style={styles.body}>
        A new version of Shellforge Realms is available. Please update to
        continue playing.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => {
          if (STORE_URL) Linking.openURL(STORE_URL);
        }}
      >
        <Text style={styles.btnText}>UPDATE NOW</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 12,
  },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  btnText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
