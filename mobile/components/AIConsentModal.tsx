import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing } from "../lib/theme";

const CONSENT_KEY = "sf_ai_consent_given";

interface Props {
  visible: boolean;
  onAccept: () => void;
}

export function AIConsentModal({ visible, onAccept }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>AI DATA DISCLOSURE</Text>
          <View style={styles.divider} />

          <ScrollView style={styles.scroll}>
            <Text style={styles.body}>
              Shellforge Realms uses{" "}
              <Text style={styles.highlight}>Anthropic's Claude AI</Text> to
              power autonomous agent decisions. When your agent takes actions
              during game turns, the following data is sent to Anthropic's API:
            </Text>

            <Text style={styles.bullet}>
              {"\u2022"} Agent name, archetype, and current stats
            </Text>
            <Text style={styles.bullet}>
              {"\u2022"} Current location and inventory
            </Text>
            <Text style={styles.bullet}>
              {"\u2022"} Recent activity history
            </Text>
            <Text style={styles.bullet}>
              {"\u2022"} Whisper messages you send to your agent
            </Text>

            <Text style={[styles.body, { marginTop: 16 }]}>
              This data is processed by Anthropic (anthropic.com) solely to
              generate in-game decisions. No personal information (email,
              password, device ID) is sent. Anthropic does not use this data to
              train models.
            </Text>

            <Text style={[styles.body, { marginTop: 12 }]}>
              By tapping "I Understand," you consent to this data processing as
              required by Apple App Store Guideline 5.1.2(i).
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={async () => {
              await AsyncStorage.setItem(CONSENT_KEY, "true");
              onAccept();
            }}
          >
            <Text style={styles.acceptText}>I UNDERSTAND</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export async function hasGivenAIConsent(): Promise<boolean> {
  const value = await AsyncStorage.getItem(CONSENT_KEY);
  return value === "true";
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  title: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  scroll: {
    marginBottom: 16,
  },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  highlight: {
    color: colors.primary,
    fontWeight: "700",
  },
  bullet: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 24,
    paddingLeft: 12,
  },
  acceptBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  acceptText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
