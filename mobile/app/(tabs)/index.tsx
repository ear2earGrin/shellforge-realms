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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import type { Agent, InventoryItem, ActivityLog } from "../../lib/types";
import { useAppRefresh } from "../../lib/useAppRefresh";

const ACTION_COLORS: Record<string, string> = {
  move: colors.primary,
  explore: colors.tertiary,
  gather: colors.success,
  craft: colors.warning,
  trade: "#ffdd57",
  rest: "#88aacc",
  combat: colors.danger,
  quest: colors.secondary,
  spawn: colors.primary,
  arena: colors.danger,
  church: "#ddbbff",
};

function itemTypeIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "weapon":
      return "⚔️";
    case "armor":
      return "🛡️";
    case "consumable":
      return "💊";
    case "scroll":
      return "📜";
    case "artifact":
      return "💎";
    case "tool":
      return "🔧";
    case "deployable":
      return "📡";
    default:
      return "📦";
  }
}

function rarityColor(rarity?: string): string {
  switch (rarity?.toLowerCase()) {
    case "legendary":
      return colors.warning;
    case "rare":
      return colors.tertiary;
    case "uncommon":
      return colors.primary;
    default:
      return colors.textMuted;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAgent = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (agents && agents.length > 0) {
      setAgent(agents[0]);

      const [{ data: items }, { data: logs }] = await Promise.all([
        supabase
          .from("inventory")
          .select("*")
          .eq("agent_id", agents[0].agent_id),
        supabase
          .from("activity_log")
          .select("*")
          .eq("agent_id", agents[0].agent_id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      setInventory(items || []);
      setRecentLogs(logs || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgent();

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

  useAppRefresh(
    useCallback(() => {
      fetchAgent();
    }, [fetchAgent])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>LOADING AGENT DATA...</Text>
      </View>
    );
  }

  if (!agent) {
    return (
      <View style={styles.center}>
        <Text style={styles.noAgentTitle}>NO AGENT DETECTED</Text>
        <Text style={styles.noAgentSub}>Deploy your first agent to begin</Text>
        <TouchableOpacity
          style={styles.deployBtn}
          onPress={() => router.push("/create-agent")}
        >
          <Text style={styles.deployBtnText}>DEPLOY AGENT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={styles.signOutBtnText}>DISCONNECT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Death screen (Design C dramatic layout)
  if (!agent.is_alive) {
    return (
      <ScrollView
        style={styles.deathContainer}
        contentContainerStyle={[
          styles.deathContent,
          { paddingTop: insets.top + 60 },
        ]}
      >
        <View style={styles.deathIconRing}>
          <Text style={{ fontSize: 36 }}>{"💀"}</Text>
        </View>
        <Text style={styles.deathLabel}>SIGNAL LOST</Text>
        <Text style={styles.deathName}>{agent.agent_name}</Text>
        <Text style={styles.deathSub}>
          {agent.archetype.toUpperCase()} {"·"} {agent.location}
        </Text>

        {agent.death_cause && (
          <View style={styles.deathCauseBox}>
            <Text style={styles.deathCauseText}>{agent.death_cause}</Text>
          </View>
        )}

        <View style={styles.deathStats}>
          <View style={styles.deathStatBox}>
            <Text style={styles.deathStatVal}>{agent.turns_taken}</Text>
            <Text style={styles.deathStatLbl}>TURNS</Text>
          </View>
          <View style={styles.deathStatBox}>
            <Text style={styles.deathStatVal}>{agent.days_survived}</Text>
            <Text style={styles.deathStatLbl}>DAYS</Text>
          </View>
          <View style={styles.deathStatBox}>
            <Text style={styles.deathStatVal}>{agent.shell_balance}</Text>
            <Text style={styles.deathStatLbl}>SHELLS</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.redeployBtn}
          onPress={() => router.push("/create-agent")}
        >
          <Text style={styles.redeployBtnText}>DEPLOY NEW AGENT</Text>
        </TouchableOpacity>
        <Text style={styles.vaultText}>
          Items transferred to dynasty vault
        </Text>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={styles.signOutBtnText}>DISCONNECT</Text>
        </TouchableOpacity>
      </ScrollView>
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
      {/* Gradient Banner (Design C atmosphere) */}
      <View style={[styles.banner, { paddingTop: insets.top + 16 }]}>
        <View style={styles.bannerOverlay} />
        <View style={styles.bannerGrid} />
        <View style={styles.bannerGlow} />

        <View style={styles.bannerContent}>
          <View style={styles.statusRow}>
            <View style={styles.activeDot} />
            <Text style={styles.statusText}>ACTIVE</Text>
          </View>

          <Text style={styles.bannerName}>{agent.agent_name}</Text>

          <View style={styles.tagRow}>
            <View style={styles.archetypeTag}>
              <Text style={styles.archetypeTagText}>
                {agent.archetype.toUpperCase().replace(/-/g, " ")}
              </Text>
            </View>
          </View>

          <Text style={styles.bannerLoc}>
            {"⬡"} {agent.location}
            {agent.location_detail ? ` — ${agent.location_detail}` : ""}
          </Text>
        </View>
      </View>

      {/* Gauge Strip (Design C HUD) */}
      <View style={styles.gaugeStrip}>
        <View style={[styles.gauge, styles.gaugeFirst]}>
          <Text style={styles.gaugeVal}>{agent.energy}</Text>
          <View style={styles.gaugeBar}>
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${Math.min(100, agent.energy)}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.gaugeLbl}>ENERGY</Text>
        </View>
        <View style={styles.gauge}>
          <Text style={styles.gaugeVal}>{agent.health}</Text>
          <View style={styles.gaugeBar}>
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${Math.min(100, agent.health)}%`,
                  backgroundColor:
                    agent.health > 30 ? colors.success : colors.danger,
                },
              ]}
            />
          </View>
          <Text style={styles.gaugeLbl}>HEALTH</Text>
        </View>
        <View style={styles.gauge}>
          <Text style={styles.gaugeVal}>{agent.karma}</Text>
          <Text style={styles.gaugeLbl}>KARMA</Text>
        </View>
        <View style={[styles.gauge, styles.gaugeLast]}>
          <Text style={styles.gaugeVal}>{agent.shell_balance}</Text>
          <Text style={styles.gaugeLbl}>SHELLS</Text>
        </View>
      </View>

      {/* Stats Pills (Design B) */}
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillVal}>{agent.turns_taken}</Text>
          <Text style={styles.pillLbl}>TURNS</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillVal}>{agent.days_survived}</Text>
          <Text style={styles.pillLbl}>DAYS</Text>
        </View>
      </View>

      {/* Latest Activity Preview */}
      {recentLogs.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>LATEST ACTIVITY</Text>
            <TouchableOpacity>
              <Text style={styles.cardAction}>VIEW ALL {"›"}</Text>
            </TouchableOpacity>
          </View>
          {recentLogs.slice(0, 2).map((log) => {
            const accent =
              ACTION_COLORS[log.action_type] || colors.textMuted;
            return (
              <View key={log.log_id} style={styles.feedItem}>
                <View style={styles.feedTop}>
                  <View
                    style={[
                      styles.feedBadge,
                      { borderColor: accent + "55" },
                    ]}
                  >
                    <Text
                      style={[styles.feedBadgeText, { color: accent }]}
                    >
                      {log.action_type.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.feedTime}>
                    {timeAgo(log.created_at)} {"·"} T
                    {log.turn_number}
                  </Text>
                </View>
                <Text style={styles.feedText} numberOfLines={2}>
                  {log.action_detail}
                </Text>
                <View style={styles.feedChips}>
                  {log.energy_cost > 0 && (
                    <Text
                      style={[
                        styles.feedChip,
                        { color: colors.primary },
                      ]}
                    >
                      -{log.energy_cost} NRG
                    </Text>
                  )}
                  {log.health_change !== 0 && (
                    <Text
                      style={[
                        styles.feedChip,
                        {
                          color:
                            log.health_change > 0
                              ? colors.success
                              : colors.danger,
                        },
                      ]}
                    >
                      {log.health_change > 0 ? "+" : ""}
                      {log.health_change} HP
                    </Text>
                  )}
                  {log.shell_change !== 0 && (
                    <Text
                      style={[
                        styles.feedChip,
                        {
                          color:
                            log.shell_change > 0
                              ? colors.warning
                              : colors.danger,
                        },
                      ]}
                    >
                      {log.shell_change > 0 ? "+" : ""}
                      {log.shell_change} SHL
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Equipped Gear (Design C visual cards) */}
      {equippedItems.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>EQUIPPED GEAR</Text>
          </View>
          <View style={styles.gearGrid}>
            {equippedItems.map((item) => (
              <View key={item.inventory_id} style={styles.gearCard}>
                <Text style={{ fontSize: 22, marginBottom: 6 }}>
                  {itemTypeIcon(item.item_type)}
                </Text>
                <Text style={styles.gearName} numberOfLines={1}>
                  {item.item_name}
                </Text>
                <Text
                  style={[
                    styles.gearRarity,
                    { color: rarityColor(item.stats?.rarity) },
                  ]}
                >
                  {(item.stats?.rarity || item.item_type).toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Backpack (Design B list) */}
      {backpackItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            BACKPACK ({backpackItems.length})
          </Text>
          <View style={{ marginTop: 8 }}>
            {backpackItems.map((item) => (
              <View key={item.inventory_id} style={styles.invItem}>
                <View style={styles.invIcon}>
                  <Text style={{ fontSize: 16 }}>
                    {itemTypeIcon(item.item_type)}
                  </Text>
                </View>
                <View style={styles.invInfo}>
                  <Text style={styles.invName}>{item.item_name}</Text>
                  <Text style={styles.invMeta}>
                    {item.item_type} {"·"} x{item.quantity}
                  </Text>
                </View>
                {item.stats?.rarity && (
                  <View
                    style={[
                      styles.invBadge,
                      {
                        backgroundColor:
                          rarityColor(item.stats.rarity) + "20",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.invBadgeText,
                        { color: rarityColor(item.stats.rarity) },
                      ]}
                    >
                      {item.stats.rarity.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOutBtn}
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
        <Text style={styles.signOutBtnText}>DISCONNECT</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bgDeep,
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
    color: colors.textBright,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
  },
  noAgentSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  deployBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  deployBtnText: {
    color: colors.bgDeep,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },

  // Banner (Design C)
  banner: {
    backgroundColor: colors.bgBanner,
    paddingBottom: 20,
    position: "relative",
    overflow: "hidden",
  },
  bannerOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "60%",
    height: "100%",
    backgroundColor: "rgba(26,10,40,0.4)",
  },
  bannerGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 0,
    opacity: 0.06,
    backgroundColor: "transparent",
    // Simulate grid with border pattern
    borderTopWidth: 30,
    borderLeftWidth: 30,
    borderColor: "rgba(0,240,255,0.5)",
    borderStyle: "dotted",
  },
  bannerGlow: {
    position: "absolute",
    top: "10%",
    left: "30%",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(0,240,255,0.04)",
  },
  bannerContent: {
    position: "relative",
    zIndex: 1,
    paddingHorizontal: spacing.lg,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "600",
  },
  bannerName: {
    color: colors.textBright,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 1,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  archetypeTag: {
    backgroundColor: "rgba(0,240,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.25)",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  archetypeTagText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  bannerLoc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    letterSpacing: 0.5,
  },

  // Gauge Strip (Design C HUD)
  gaugeStrip: {
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  gauge: {
    flex: 1,
    backgroundColor: colors.bgCard,
    padding: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  gaugeFirst: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  gaugeLast: {
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  gaugeVal: {
    color: colors.textBright,
    fontSize: 20,
    fontWeight: "800",
  },
  gaugeBar: {
    width: "100%",
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 2,
  },
  gaugeLbl: {
    color: colors.textMuted,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 8,
  },

  // Stats Pills (Design B)
  pillRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillVal: {
    color: colors.textBright,
    fontSize: 15,
    fontWeight: "700",
  },
  pillLbl: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "600",
  },

  // Cards
  card: {
    margin: 12,
    marginBottom: 0,
    padding: 14,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
  },
  cardAction: {
    color: colors.primary,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "600",
  },

  // Feed Preview
  feedItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feedTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  feedBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  feedBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  feedTime: {
    color: colors.textMuted,
    fontSize: 9,
  },
  feedText: {
    color: "#bbb",
    fontSize: 12,
    lineHeight: 18,
  },
  feedChips: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  feedChip: {
    fontSize: 10,
    fontWeight: "700",
  },

  // Equipped Gear Grid (Design C)
  gearGrid: {
    flexDirection: "row",
    gap: 8,
  },
  gearCard: {
    flex: 1,
    backgroundColor: colors.bgCardLight,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  gearName: {
    color: "#eee",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  gearRarity: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 3,
  },

  // Backpack List (Design B)
  invItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    marginBottom: 6,
  },
  invIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.bgCardLight,
    alignItems: "center",
    justifyContent: "center",
  },
  invInfo: {
    flex: 1,
  },
  invName: {
    color: "#eee",
    fontSize: 13,
    fontWeight: "600",
  },
  invMeta: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  invBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  invBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // Sign Out
  signOutBtn: {
    margin: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger + "60",
    borderRadius: 8,
  },
  signOutBtnText: {
    color: colors.danger,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: "600",
    opacity: 0.7,
  },

  // Death Screen (Design C dramatic)
  deathContainer: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  deathContent: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  deathIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.danger + "44",
    backgroundColor: colors.danger + "08",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  deathLabel: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 4,
    marginBottom: 8,
  },
  deathName: {
    color: colors.textBright,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
  },
  deathSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  deathCauseBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
  },
  deathCauseText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  deathStats: {
    flexDirection: "row",
    gap: 16,
    marginTop: 24,
    width: "100%",
  },
  deathStatBox: {
    flex: 1,
    alignItems: "center",
    padding: 10,
    backgroundColor: colors.bgCard,
    borderRadius: 8,
  },
  deathStatVal: {
    color: colors.textBright,
    fontSize: 18,
    fontWeight: "800",
  },
  deathStatLbl: {
    color: colors.textMuted,
    fontSize: 7,
    letterSpacing: 2,
    marginTop: 3,
  },
  redeployBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginTop: 32,
  },
  redeployBtnText: {
    color: colors.bgDeep,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  vaultText: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 12,
  },
});
