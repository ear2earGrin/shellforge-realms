import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import type { ActivityLog } from "../../lib/types";

const ACTION_COLORS: Record<string, string> = {
  move: colors.primary,
  explore: colors.tertiary,
  gather: colors.success,
  craft: colors.warning,
  trade: "#ffdd57",
  rest: "#88aacc",
  combat: colors.danger,
  quest: colors.secondary,
  church: "#ddbbff",
  arena: colors.danger,
  spawn: colors.primary,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function LogEntry({ item }: { item: ActivityLog }) {
  const accentColor = ACTION_COLORS[item.action_type] || colors.textMuted;

  return (
    <View style={styles.entry}>
      <View style={styles.entryHeader}>
        <View style={[styles.actionBadge, { borderColor: accentColor + "55" }]}>
          <Text style={[styles.actionType, { color: accentColor }]}>
            {item.action_type.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.turnNum}>T{item.turn_number}</Text>
        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
      </View>
      <Text style={styles.detail}>{item.action_detail}</Text>
      <View style={styles.statsRow}>
        {item.energy_cost > 0 && (
          <Text style={[styles.statChip, { color: colors.primary }]}>
            -{item.energy_cost} NRG
          </Text>
        )}
        {item.energy_gained > 0 && (
          <Text style={[styles.statChip, { color: colors.success }]}>
            +{item.energy_gained} NRG
          </Text>
        )}
        {item.shell_change !== 0 && (
          <Text
            style={[
              styles.statChip,
              {
                color:
                  item.shell_change > 0 ? colors.warning : colors.danger,
              },
            ]}
          >
            {item.shell_change > 0 ? "+" : ""}
            {item.shell_change} SHL
          </Text>
        )}
        {item.karma_change !== 0 && (
          <Text
            style={[
              styles.statChip,
              {
                color:
                  item.karma_change > 0 ? colors.tertiary : colors.danger,
              },
            ]}
          >
            {item.karma_change > 0 ? "+" : ""}
            {item.karma_change} KRM
          </Text>
        )}
        {item.health_change !== 0 && (
          <Text
            style={[
              styles.statChip,
              {
                color:
                  item.health_change > 0 ? colors.success : colors.danger,
              },
            ]}
          >
            {item.health_change > 0 ? "+" : ""}
            {item.health_change} HP
          </Text>
        )}
        {!item.success && (
          <Text style={[styles.statChip, { color: colors.danger }]}>
            FAILED
          </Text>
        )}
      </View>
      <Text style={styles.locationTag}>{item.location}</Text>
    </View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: agents } = await supabase
      .from("agents")
      .select("agent_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!agents || agents.length === 0) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("agent_id", agents[0].agent_id)
      .order("created_at", { ascending: false })
      .limit(50);

    setLogs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel("feed-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          setLogs((prev) => [payload.new as ActivityLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>LOADING FEED...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[
        logs.length === 0 ? { flex: 1 } : undefined,
        { paddingTop: insets.top },
      ]}
      data={logs}
      keyExtractor={(item) => item.log_id}
      renderItem={({ item }) => <LogEntry item={item} />}
      ListHeaderComponent={
        <View style={styles.feedHeader}>
          <Text style={styles.feedHeaderText}>FEED</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No activity yet</Text>
          <Text style={styles.emptySub}>
            Your agent's actions will appear here
          </Text>
        </View>
      }
    />
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
    fontFamily: "Courier",
  },
  feedHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feedHeaderText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 4,
    fontFamily: "Courier",
    textAlign: "center",
  },
  emptyText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  entry: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  actionBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionType: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: "Courier",
  },
  turnNum: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    fontFamily: "Courier",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: "auto",
    fontFamily: "Courier",
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  statChip: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: "Courier",
  },
  locationTag: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 8,
    textTransform: "uppercase",
    fontFamily: "Courier",
  },
});
