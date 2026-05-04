import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { colors, spacing } from "../lib/theme";
import {
  ARCHETYPES,
  CLUSTER_ORDER,
  generateTraits,
  type ArchetypeInfo,
} from "../lib/agentData";

export default function CreateAgentScreen() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [selectedArchetype, setSelectedArchetype] =
    useState<ArchetypeInfo | null>(null);
  const [deploying, setDeploying] = useState(false);

  const clusterArchetypes = selectedCluster
    ? ARCHETYPES.filter((a) => a.cluster === selectedCluster)
    : [];

  async function deploy() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      Alert.alert("Error", "Agent name must be at least 2 characters");
      return;
    }
    if (!selectedArchetype) {
      Alert.alert("Error", "Select an archetype");
      return;
    }

    setDeploying(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      Alert.alert("Error", "Session expired. Please sign out and log in again.");
      setDeploying(false);
      return;
    }

    const { data: existing } = await supabase
      .from("agents")
      .select("agent_id")
      .eq("user_id", user.id)
      .eq("is_alive", true)
      .limit(1);

    if (existing && existing.length > 0) {
      Alert.alert("Error", "You already have a living agent. One at a time.");
      setDeploying(false);
      return;
    }

    const { data: nameTaken } = await supabase
      .from("agents")
      .select("agent_id")
      .eq("agent_name", trimmedName)
      .limit(1);

    if (nameTaken && nameTaken.length > 0) {
      Alert.alert("Error", `"${trimmedName}" is already taken. Choose another.`);
      setDeploying(false);
      return;
    }

    const { stats, traits } = generateTraits(selectedArchetype.id);

    const { data: agentRows, error } = await supabase
      .from("agents")
      .insert({
        user_id: user.id,
        agent_name: trimmedName,
        archetype: selectedArchetype.id,
        archetype_name: selectedArchetype.name,
        cluster: selectedArchetype.cluster,
        cluster_name: selectedArchetype.clusterName,
        bio: bio.trim() || null,
        energy: 100,
        health: 100,
        karma: 0,
        shell_balance: 50,
        location: "Nexarch",
        location_detail: "The Core",
        visual_x: 0.75,
        visual_y: 0.34,
        stats,
        traits,
        turns_taken: 0,
        days_survived: 1,
      })
      .select();

    if (error || !agentRows?.length) {
      Alert.alert("Deploy Failed", error?.message || "Unknown error");
      setDeploying(false);
      return;
    }

    await supabase.from("activity_log").insert({
      agent_id: agentRows[0].agent_id,
      turn_number: 0,
      action_type: "spawn",
      action_detail: `${trimmedName} deployed in Nexarch.${bio.trim() ? ` "${bio.trim()}"` : ""}`,
      location: "Nexarch",
    });

    setDeploying(false);
    router.replace("/(tabs)");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>DEPLOY AGENT</Text>
      <View style={styles.divider} />

      <Text style={styles.label}>AGENT DESIGNATION</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="0xKallak"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
      />

      <Text style={styles.label}>DIRECTIVE (optional)</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        placeholder="Survive at all costs..."
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={200}
      />

      <Text style={styles.sectionTitle}>SELECT CLUSTER</Text>
      <View style={styles.clusterRow}>
        {CLUSTER_ORDER.map((c) => {
          const info = ARCHETYPES.find((a) => a.cluster === c);
          const label =
            c === "prime_helix"
              ? "PRIME HELIX"
              : c === "sec_grid"
                ? "SEC-GRID"
                : "DYN-SWARM";
          return (
            <TouchableOpacity
              key={c}
              style={[
                styles.clusterBtn,
                selectedCluster === c && styles.clusterBtnActive,
              ]}
              onPress={() => {
                setSelectedCluster(c);
                setSelectedArchetype(null);
              }}
            >
              <Text
                style={[
                  styles.clusterBtnText,
                  selectedCluster === c && styles.clusterBtnTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedCluster && (
        <>
          <Text style={styles.sectionTitle}>SELECT ARCHETYPE</Text>
          <View style={styles.archetypeGrid}>
            {clusterArchetypes.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.archetypeCard,
                  selectedArchetype?.id === a.id && styles.archetypeCardActive,
                ]}
                onPress={() => setSelectedArchetype(a)}
              >
                <Text style={styles.archetypeEmoji}>
                  {a.cluster === "prime_helix"
                    ? "🔷"
                    : a.cluster === "sec_grid"
                      ? "🔶"
                      : "🟣"}
                </Text>
                <Text
                  style={[
                    styles.archetypeName,
                    selectedArchetype?.id === a.id &&
                      styles.archetypeNameActive,
                  ]}
                >
                  {a.name.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity
        style={[
          styles.deployBtn,
          (!selectedArchetype || !name.trim() || deploying) &&
            styles.deployBtnDisabled,
        ]}
        onPress={deploy}
        disabled={!selectedArchetype || !name.trim() || deploying}
      >
        {deploying ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.deployBtnText}>DEPLOY</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => router.back()}
      >
        <Text style={styles.cancelText}>CANCEL</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDeep },
  content: { padding: spacing.lg, paddingTop: 60 },
  title: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 4,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 16,
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
  bioInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 12,
  },
  clusterRow: {
    flexDirection: "row",
    gap: 8,
  },
  clusterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: colors.bgCard,
  },
  clusterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(0,240,255,0.08)",
  },
  clusterBtnText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  clusterBtnTextActive: {
    color: colors.primary,
  },
  archetypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  archetypeCard: {
    width: "48%" as unknown as number,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.bgCard,
  },
  archetypeCardActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(0,240,255,0.1)",
  },
  archetypeEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  archetypeName: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  archetypeNameActive: {
    color: colors.primary,
  },
  deployBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 32,
  },
  deployBtnDisabled: {
    opacity: 0.35,
  },
  deployBtnText: {
    color: colors.bgDeep,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 3,
  },
  cancelBtn: {
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
  },
});
