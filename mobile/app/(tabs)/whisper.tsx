import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import type { Whisper } from "../../lib/types";

const MAX_CHARS = 200;
const COOLDOWN_HOURS = 12;

export default function WhisperScreen() {
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [canWhisper, setCanWhisper] = useState(true);
  const [cooldownText, setCooldownText] = useState("");
  const [loading, setLoading] = useState(true);

  const checkCooldown = useCallback((whisperList: Whisper[]) => {
    if (whisperList.length === 0) {
      setCanWhisper(true);
      return;
    }
    const last = whisperList[0];
    const lastTime = new Date(last.sent_at).getTime();
    const now = Date.now();
    const diff = now - lastTime;
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;

    if (diff < cooldownMs) {
      setCanWhisper(false);
      const remaining = cooldownMs - diff;
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      setCooldownText(`${hours}h ${mins}m`);
    } else {
      setCanWhisper(true);
    }
  }, []);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: agents } = await supabase
      .from("agents")
      .select("agent_id, agent_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!agents || agents.length === 0) {
      setLoading(false);
      return;
    }

    setAgentId(agents[0].agent_id);
    setAgentName(agents[0].agent_name);

    const { data } = await supabase
      .from("whispers")
      .select("*")
      .eq("agent_id", agents[0].agent_id)
      .order("sent_at", { ascending: false })
      .limit(20);

    const whisperData = data || [];
    setWhispers(whisperData);
    checkCooldown(whisperData);
    setLoading(false);
  }, [checkCooldown]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function sendWhisper() {
    if (!message.trim() || !agentId || sending) return;

    setSending(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSending(false);
      return;
    }

    const rollValue = Math.random();
    const wasHeard = rollValue >= 0.5;

    const { data, error } = await supabase
      .from("whispers")
      .insert({
        agent_id: agentId,
        user_id: user.id,
        message: message.trim(),
        was_heard: wasHeard,
        roll_value: Math.round(rollValue * 100),
        whisper_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    setSending(false);

    if (error) {
      Alert.alert("Error", "Failed to send whisper");
      return;
    }

    if (data) {
      setWhispers((prev) => [data as Whisper, ...prev]);
      setMessage("");
      setCanWhisper(false);
      setCooldownText(`${COOLDOWN_HOURS}h 0m`);

      Alert.alert(
        wasHeard ? "Whisper Heard" : "Whisper Lost",
        wasHeard
          ? `${agentName} received your message.`
          : `Your whisper was lost in the noise. Roll: ${Math.round(rollValue * 100)}/100`
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>TUNING FREQUENCY...</Text>
      </View>
    );
  }

  if (!agentId) {
    return (
      <View style={styles.center}>
        <Text style={styles.noAgent}>NO AGENT TO WHISPER TO</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Whisper History */}
      <FlatList
        data={whispers}
        keyExtractor={(item) => item.whisper_id}
        inverted
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>NO WHISPERS SENT</Text>
            <Text style={styles.emptySub}>
              Send your first message to {agentName}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.whisperBubble,
              item.was_heard
                ? styles.whisperHeard
                : styles.whisperLost,
            ]}
          >
            <Text style={styles.whisperMsg}>{item.message}</Text>
            <View style={styles.whisperMeta}>
              <Text
                style={[
                  styles.whisperStatus,
                  {
                    color: item.was_heard
                      ? colors.success
                      : colors.danger,
                  },
                ]}
              >
                {item.was_heard ? "HEARD" : "LOST"}
              </Text>
              <Text style={styles.whisperRoll}>
                Roll: {item.roll_value}/100
              </Text>
              <Text style={styles.whisperTime}>
                {new Date(item.sent_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Input Area */}
      <View style={styles.inputArea}>
        {!canWhisper ? (
          <View style={styles.cooldownBar}>
            <Text style={styles.cooldownText}>
              FREQUENCY COOLING DOWN: {cooldownText}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={(t) =>
                  t.length <= MAX_CHARS && setMessage(t)
                }
                placeholder={`Whisper to ${agentName}...`}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={MAX_CHARS}
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!message.trim() || sending) && styles.sendBtnDisabled,
                ]}
                onPress={sendWhisper}
                disabled={!message.trim() || sending}
              >
                <Text style={styles.sendText}>
                  {sending ? "..." : "SEND"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.charCount}>
              {message.length}/{MAX_CHARS}
            </Text>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.primary,
    fontSize: 12,
    letterSpacing: 3,
  },
  noAgent: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 2,
  },
  listContent: {
    padding: spacing.md,
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 2,
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  whisperBubble: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  whisperHeard: {
    backgroundColor: colors.bgCard,
    borderColor: colors.success + "40",
  },
  whisperLost: {
    backgroundColor: colors.bgCard,
    borderColor: colors.danger + "30",
    opacity: 0.7,
  },
  whisperMsg: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  whisperMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  whisperStatus: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  whisperRoll: {
    color: colors.textMuted,
    fontSize: 10,
  },
  whisperTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: "auto",
  },
  inputArea: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  cooldownBar: {
    padding: 14,
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cooldownText: {
    color: colors.warning,
    fontSize: 11,
    letterSpacing: 2,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  sendText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  charCount: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 4,
  },
});
