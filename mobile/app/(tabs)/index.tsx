import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import type { Agent, InventoryItem } from "../../lib/types";
import { StatBar } from "../../components/StatBar";
import { useAppRefresh } from "../../lib/useAppRefresh";

export default function AgentScreen() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAgent = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (agents && agents.length > 0) {
      setAgent(agents[0]);
      const { data: items } = await supabase
        .from("inventory")
        .select("*")
        .eq("agent_id", agents[0].agent_id);
      setInventory(items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgent();

    // Subscribe to realtime changes on agents table
    const channel = supabase
      .channel("agent-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          if (agent && payload.new.agent_id === agent.agent_id) {
            setAgent(payload.new as Agent);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAgent, agent?.agent_id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAgent();
    setRefreshing(false);
  }, [fetchAgent]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>LOADING AGENT DATA...</Text>
      </View>
    );
  }

  useAppRefresh(useCallback(() => { fetchAgent(); }, [fetchAgent]));

  if (!agent) {
    return (
      <View style={styles.center}>
        <Text style={styles.noAgentTitle}>NO AGENT DETECTED</Text>
        <Text style={styles.noAgentSub}>Deploy your first agent to begin</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push("/create-agent")}
        >
          <Text style={styles.createBtnText}>DEPLOY AGENT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const equippedItems = inventory.filter((i) => i.is_equipped);
  const backpackItems = inventory.filter((i) => !i.is_equipped);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Agent Header */}
      <View style={styles.header}>
        <View style={styles.statusDot}>
          <View
            style={[
              styles.dot,
              { backgroundColor: agent.is_alive ? colors.success : colors.danger },
            ]}
          />
          <Text style={styles.statusLabel}>
            {agent.is_alive ? "ACTIVE" : "DECEASED"}
          </Text>
        </View>
        <Text style={styles.agentName}>{agent.agent_name}</Text>
        <Text style={styles.archetype}>{agent.archetype.toUpperCase()}</Text>
        <Text style={styles.location}>{agent.location}</Text>
      </View>

      {/* Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>VITAL STATS</Text>
        <StatBar
          label="ENERGY"
          value={agent.energy}
          max={100}
          color={colors.primary}
        />
        <StatBar
          label="HEALTH"
          value={agent.health}
          max={100}
          color={agent.health > 30 ? colors.success : colors.danger}
        />
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{agent.karma}</Text>
            <Text style={styles.statLabel}>KARMA</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{agent.shell_balance}</Text>
            <Text style={styles.statLabel}>SHELLS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{agent.turns_taken}</Text>
            <Text style={styles.statLabel}>TURNS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{agent.days_survived}</Text>
            <Text style={styles.statLabel}>DAYS</Text>
          </View>
        </View>
      </View>

      {/* Equipped Items */}
      {equippedItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>EQUIPPED</Text>
          {equippedItems.map((item) => (
            <View key={item.inventory_id} style={styles.itemRow}>
              <View
                style={[styles.itemDot, { backgroundColor: colors.primary }]}
              />
              <Text style={styles.itemName}>{item.item_name}</Text>
              <Text style={styles.itemType}>{item.item_type}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Backpack */}
      {backpackItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            BACKPACK ({backpackItems.length})
          </Text>
          {backpackItems.map((item) => (
            <View key={item.inventory_id} style={styles.itemRow}>
              <View
                style={[styles.itemDot, { backgroundColor: colors.textMuted }]}
              />
              <Text style={styles.itemName}>{item.item_name}</Text>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOut}
        onPress={() => {
          Alert.alert("Sign Out", "Disconnect from terminal?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign Out",
              style: "destructive",
              onPress: () => supabase.auth.signOut(),
            },
          ]);
        }}
      >
        <Text style={styles.signOutText}>DISCONNECT</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
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
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.primary,
    fontSize: 12,
    letterSpacing: 3,
  },
  noAgentTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
  },
  noAgentSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  createBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  createBtnText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  header: {
    padding: spacing.lg,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
  },
  agentName: {
    color: colors.textBright,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  archetype: {
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 3,
    marginTop: 4,
  },
  location: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 1,
  },
  card: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  statBox: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: colors.textBright,
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  itemName: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  itemType: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  itemQty: {
    color: colors.textMuted,
    fontSize: 12,
  },
  signOut: {
    margin: spacing.md,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    opacity: 0.7,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 11,
    letterSpacing: 3,
  },
});
