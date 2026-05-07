import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import type { Agent, InventoryItem, ActivityLog } from "../../lib/types";
import { useAppRefresh } from "../../lib/useAppRefresh";

const CARD_NAMES = ["STATUS", "GEAR", "ACTIVITY", "STATS"] as const;

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
  const { width: screenWidth } = useWindowDimensions();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

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
          .limit(10),
      ]);

      setInventory(items || []);
      setRecentLogs(logs || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgent();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) {
        setAgent(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchAgent]);

  useEffect(() => {
    if (!agent?.agent_id) return;

    const channel = supabase
      .channel("agent-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          if (payload.new.agent_id === agent.agent_id) {
            setAgent(payload.new as Agent);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agent?.agent_id]);

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

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>LOADING AGENT DATA...</Text>
      </View>
    );
  }

  // ── No Agent ──
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

  // ── Death Screen ──
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

  // ── Main Dashboard ──
  const equippedItems = inventory.filter((i) => i.is_equipped);
  const backpackItems = inventory.filter((i) => !i.is_equipped);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setActiveCard(Math.max(0, Math.min(CARD_NAMES.length - 1, idx)));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Compact Banner ── */}
      <View style={styles.banner}>
        <View style={styles.bannerGlow} />
        <View style={styles.bannerInner}>
          <View style={{ flex: 1 }}>
            <View style={styles.statusRow}>
              <View style={styles.activeDot} />
              <Text style={styles.statusText}>ACTIVE</Text>
            </View>
            <Text style={styles.agentName}>{agent.agent_name}</Text>
            <View style={styles.archetypeTag}>
              <Text style={styles.archetypeTagText}>
                {agent.archetype.toUpperCase().replace(/-/g, " ")}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.refreshIcon}>{"↻"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Swipe Cards ── */}
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={styles.cardScroll}
      >
        {/* ── STATUS CARD ── */}
        <View style={{ width: screenWidth, paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={[styles.card, { flex: 1 }]}>
            <ScrollView contentContainerStyle={styles.cardPad} showsVerticalScrollIndicator={false}>
              <Text style={styles.cardTitle}>STATUS</Text>

              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.primary }]}>
                    {agent.energy}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, agent.energy)}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.statLbl}>ENERGY</Text>
                </View>

                <View style={styles.statCell}>
                  <Text
                    style={[
                      styles.statNum,
                      {
                        color:
                          agent.health > 30 ? colors.success : colors.danger,
                      },
                    ]}
                  >
                    {agent.health}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, agent.health)}%`,
                          backgroundColor:
                            agent.health > 30 ? colors.success : colors.danger,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.statLbl}>HEALTH</Text>
                </View>

                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.warning }]}>
                    {agent.karma}
                  </Text>
                  <Text style={styles.statLbl}>KARMA</Text>
                </View>

                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: "#ffdd57" }]}>
                    {agent.shell_balance}
                  </Text>
                  <Text style={styles.statLbl}>SHELLS</Text>
                </View>
              </View>

              <View style={styles.sep} />

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaNum}>{agent.turns_taken}</Text>
                  <Text style={styles.metaLbl}>TURNS</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItem}>
                  <Text style={styles.metaNum}>{agent.days_survived}</Text>
                  <Text style={styles.metaLbl}>DAYS</Text>
                </View>
              </View>

              <View style={styles.sep} />

              <View style={styles.locRow}>
                <Text style={styles.locHex}>{"⬡"}</Text>
                <View>
                  <Text style={styles.locName}>{agent.location}</Text>
                  {agent.location_detail && (
                    <Text style={styles.locDetail}>
                      {agent.location_detail}
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* ── GEAR CARD ── */}
        <View style={{ width: screenWidth, paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={[styles.card, { flex: 1 }]}>
            <ScrollView
              contentContainerStyle={styles.cardPad}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardTitle}>GEAR</Text>

              {equippedItems.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>EQUIPPED</Text>
                  <View style={styles.gearGrid}>
                    {equippedItems.map((item) => (
                      <View key={item.inventory_id} style={styles.gearSlot}>
                        <Text style={{ fontSize: 24 }}>
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
                          {(
                            item.stats?.rarity || item.item_type
                          ).toUpperCase()}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyIcon}>{"⚔️"}</Text>
                  <Text style={styles.emptyText}>No gear equipped</Text>
                  <Text style={styles.emptySub}>
                    Items found during exploration will appear here
                  </Text>
                </View>
              )}

              {backpackItems.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                    BACKPACK ({backpackItems.length})
                  </Text>
                  {backpackItems.map((item) => (
                    <View key={item.inventory_id} style={styles.invRow}>
                      <View style={styles.invIconBox}>
                        <Text style={{ fontSize: 16 }}>
                          {itemTypeIcon(item.item_type)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
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
                </>
              )}
            </ScrollView>
          </View>
        </View>

        {/* ── ACTIVITY CARD ── */}
        <View style={{ width: screenWidth, paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={[styles.card, { flex: 1 }]}>
            <ScrollView
              contentContainerStyle={styles.cardPad}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardTitle}>ACTIVITY</Text>

              {recentLogs.length > 0 ? (
                recentLogs.map((log, i) => {
                  const accent =
                    ACTION_COLORS[log.action_type] || colors.textMuted;
                  return (
                    <View
                      key={log.log_id}
                      style={[
                        styles.logEntry,
                        i < recentLogs.length - 1 && styles.logBorder,
                      ]}
                    >
                      <View style={styles.logTop}>
                        <View
                          style={[
                            styles.logBadge,
                            { borderColor: accent + "55" },
                          ]}
                        >
                          <Text
                            style={[styles.logBadgeText, { color: accent }]}
                          >
                            {log.action_type.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.logTime}>
                          {timeAgo(log.created_at)} {"·"} T{log.turn_number}
                        </Text>
                      </View>
                      <Text style={styles.logDetail} numberOfLines={2}>
                        {log.action_detail}
                      </Text>
                      <View style={styles.logChips}>
                        {log.energy_cost > 0 && (
                          <Text
                            style={[
                              styles.logChip,
                              { color: colors.primary },
                            ]}
                          >
                            -{log.energy_cost} NRG
                          </Text>
                        )}
                        {log.health_change !== 0 && (
                          <Text
                            style={[
                              styles.logChip,
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
                              styles.logChip,
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
                })
              ) : (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyIcon}>{"📡"}</Text>
                  <Text style={styles.emptyText}>No activity yet</Text>
                  <Text style={styles.emptySub}>
                    Your agent's actions will appear here as the simulation runs
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>

        {/* ── STATS CARD ── */}
        <View style={{ width: screenWidth, paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={[styles.card, { flex: 1 }]}>
            <ScrollView
              contentContainerStyle={styles.cardPad}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardTitle}>STATS</Text>

              {agent.stats ? (
                <>
                  <Text style={styles.sectionLabel}>COMBAT</Text>
                  {Object.entries(agent.stats).map(([key, val]) => (
                    <View key={key} style={styles.traitRow}>
                      <Text style={styles.traitKey}>
                        {key.slice(0, 3).toUpperCase()}
                      </Text>
                      <View style={styles.traitBarTrack}>
                        <View
                          style={[
                            styles.traitBarFill,
                            {
                              width: `${Math.min(100, val as number)}%`,
                              backgroundColor: colors.primary,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.traitVal}>{val as number}</Text>
                    </View>
                  ))}
                </>
              ) : null}

              {agent.traits ? (
                <>
                  <Text
                    style={[
                      styles.sectionLabel,
                      agent.stats ? { marginTop: 24 } : null,
                    ]}
                  >
                    TRAITS
                  </Text>
                  {Object.entries(agent.traits).map(([key, val]) => (
                    <View key={key} style={styles.traitRow}>
                      <Text style={styles.traitKey}>
                        {key.slice(0, 3).toUpperCase()}
                      </Text>
                      <View style={styles.traitBarTrack}>
                        <View
                          style={[
                            styles.traitBarFill,
                            {
                              width: `${((val as number) / 10) * 100}%`,
                              backgroundColor: colors.tertiary,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.traitVal}>
                        {val as number}/10
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {!agent.stats && !agent.traits && (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyIcon}>{"📊"}</Text>
                  <Text style={styles.emptyText}>No stats available</Text>
                  <Text style={styles.emptySub}>
                    Combat stats and traits will show here
                  </Text>
                </View>
              )}

              <View style={styles.sep} />

              <View style={styles.archBlock}>
                <Text style={styles.archLabel}>ARCHETYPE</Text>
                <Text style={styles.archName}>
                  {agent.archetype.toUpperCase().replace(/-/g, " ")}
                </Text>
                <Text style={styles.archCluster}>
                  {"⬡"} {agent.location}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Animated.ScrollView>

      {/* ── Card Indicator ── */}
      <View style={styles.indicator}>
        <View style={styles.dotsRow}>
          {CARD_NAMES.map((_, i) => {
            const dotOpacity = scrollX.interpolate({
              inputRange: [
                (i - 1) * screenWidth,
                i * screenWidth,
                (i + 1) * screenWidth,
              ],
              outputRange: [0.3, 1, 0.3],
              extrapolate: "clamp",
            });
            const dotWidth = scrollX.interpolate({
              inputRange: [
                (i - 1) * screenWidth,
                i * screenWidth,
                (i + 1) * screenWidth,
              ],
              outputRange: [6, 24, 6],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { opacity: dotOpacity, width: dotWidth },
                ]}
              />
            );
          })}
        </View>
        <Text style={styles.cardLabelText}>{CARD_NAMES[activeCard]}</Text>
      </View>

      {/* ── Disconnect ── */}
      <TouchableOpacity
        style={[styles.disconnectBtn, { marginBottom: Math.max(insets.bottom, 8) }]}
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
        <Text style={styles.disconnectBtnText}>DISCONNECT</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Base ──
  root: {
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
    marginTop: 16,
  },

  // ── Banner ──
  banner: {
    backgroundColor: colors.bgBanner,
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bannerGlow: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(0,240,255,0.03)",
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
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
  agentName: {
    color: colors.textBright,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 1,
  },
  archetypeTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,240,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.25)",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  archetypeTagText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshIcon: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "600",
  },

  // ── Swipe Cards ──
  cardScroll: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPad: {
    padding: 20,
  },
  cardTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 4,
    marginBottom: 20,
  },

  // ── Status Card ──
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCell: {
    width: "47%" as unknown as number,
    backgroundColor: colors.bgCardLight,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  statNum: {
    fontSize: 36,
    fontWeight: "800",
  },
  barTrack: {
    width: "100%",
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
  statLbl: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 8,
  },
  sep: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  metaItem: {
    alignItems: "center",
  },
  metaNum: {
    color: colors.textBright,
    fontSize: 22,
    fontWeight: "800",
  },
  metaLbl: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 2,
    marginTop: 4,
  },
  metaDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  locHex: {
    color: colors.primary,
    fontSize: 20,
  },
  locName: {
    color: colors.textBright,
    fontSize: 14,
    fontWeight: "600",
  },
  locDetail: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // ── Gear Card ──
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  gearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gearSlot: {
    width: "47%" as unknown as number,
    backgroundColor: colors.bgCardLight,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  gearName: {
    color: "#eee",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  gearRarity: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
  },
  invRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  invIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.bgCardLight,
    alignItems: "center",
    justifyContent: "center",
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

  // ── Activity Card ──
  logEntry: {
    paddingVertical: 12,
  },
  logBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  logBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  logBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  logTime: {
    color: colors.textMuted,
    fontSize: 9,
  },
  logDetail: {
    color: "#bbb",
    fontSize: 12,
    lineHeight: 18,
  },
  logChips: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  logChip: {
    fontSize: 10,
    fontWeight: "700",
  },

  // ── Stats Card ──
  traitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  traitKey: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    width: 32,
  },
  traitBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  traitBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  traitVal: {
    color: colors.textBright,
    fontSize: 11,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },
  archBlock: {
    alignItems: "center",
    paddingVertical: 8,
  },
  archLabel: {
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 3,
    fontWeight: "600",
  },
  archName: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 6,
  },
  archCluster: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  // ── Empty States ──
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
    opacity: 0.6,
    paddingHorizontal: 20,
  },

  // ── Indicator ──
  indicator: {
    alignItems: "center",
    paddingVertical: 10,
    gap: 6,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  cardLabelText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
  },

  // ── Disconnect ──
  disconnectBtn: {
    marginHorizontal: 16,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger + "40",
    borderRadius: 8,
  },
  disconnectBtnText: {
    color: colors.danger,
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: "600",
    opacity: 0.6,
  },

  // ── No Agent ──
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

  // ── Death Screen ──
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

  // ── Sign Out (shared) ──
  signOutBtn: {
    marginTop: 16,
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
});
