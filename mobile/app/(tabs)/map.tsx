import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import { LOCATIONS } from "../../lib/types";
import type { Agent } from "../../lib/types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const MAP_SIZE = SCREEN_WIDTH;

const DANGER_COLORS: Record<string, string> = {
  safe: colors.success,
  low: colors.success,
  medium: colors.warning,
  high: colors.danger,
  extreme: colors.tertiary,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: agents } = await supabase
      .from("agents")
      .select(
        "agent_id, agent_name, location, visual_x, visual_y, is_alive, user_id"
      )
      .eq("is_alive", true);

    if (agents) {
      setAllAgents(agents as Agent[]);
      const mine = agents.find((a: any) => a.user_id === user.id);
      if (mine) setAgent(mine as Agent);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

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
      {/* Full-bleed Map Canvas */}
      <View style={[styles.mapCanvas, { paddingTop: insets.top }]}>
        {/* Atmospheric grid overlay */}
        <View style={styles.gridOverlay} />

        {/* Location markers with glow */}
        {Object.entries(LOCATIONS).map(([key, loc]) => {
          const dangerColor = DANGER_COLORS[loc.danger] || colors.textMuted;
          const isPlayerHere = agent?.location === key;
          return (
            <View
              key={key}
              style={[
                styles.locationMarker,
                {
                  left: loc.x * MAP_SIZE - 24,
                  top: insets.top + loc.y * MAP_SIZE * 0.85 - 12,
                },
              ]}
            >
              <View
                style={[
                  styles.locationDot,
                  {
                    backgroundColor: dangerColor,
                    width: isPlayerHere ? 14 : 10,
                    height: isPlayerHere ? 14 : 10,
                    borderRadius: isPlayerHere ? 7 : 5,
                    ...(Platform.OS === "ios"
                      ? {
                          shadowColor: dangerColor,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 6,
                        }
                      : {}),
                  },
                ]}
              />
              <Text
                style={[
                  styles.locationName,
                  {
                    color: dangerColor,
                    fontSize: isPlayerHere ? 8 : 7,
                    fontWeight: isPlayerHere ? "800" : "700",
                  },
                ]}
                numberOfLines={1}
              >
                {loc.name.toUpperCase()}
              </Text>
            </View>
          );
        })}

        {/* Other agent dots */}
        {allAgents
          .filter((a) => a.agent_id !== agent?.agent_id && a.visual_x && a.visual_y)
          .map((a) => (
            <View
              key={a.agent_id}
              style={[
                styles.otherAgent,
                {
                  left: (a.visual_x ?? 0.5) * MAP_SIZE - 3,
                  top: insets.top + (a.visual_y ?? 0.5) * MAP_SIZE * 0.85 - 3,
                },
              ]}
            />
          ))}

        {/* Player agent marker (pulsing ring) */}
        {agent && agent.visual_x != null && agent.visual_y != null && (
          <View
            style={[
              styles.playerMarker,
              {
                left: agent.visual_x * MAP_SIZE - 10,
                top: insets.top + agent.visual_y * MAP_SIZE * 0.85 - 10,
              },
            ]}
          >
            <View style={styles.playerRing} />
            <View style={styles.playerDot} />
          </View>
        )}
      </View>

      {/* Threat Levels Legend */}
      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>THREAT LEVELS</Text>
        <View style={styles.legendRow}>
          {Object.entries(DANGER_COLORS).map(([level, color]) => (
            <View key={level} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: color }]}
              />
              <Text style={styles.legendLabel}>
                {level.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Agent Position Card */}
      {agent && (
        <View style={styles.agentCard}>
          <Text style={styles.agentCardLabel}>YOUR AGENT</Text>
          <Text style={styles.agentCardName}>{agent.agent_name}</Text>
          <Text style={styles.agentCardLoc}>{agent.location}</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  mapCanvas: {
    width: MAP_SIZE,
    height: MAP_SIZE * 0.85 + 60,
    backgroundColor: colors.bgBanner,
    position: "relative",
    overflow: "hidden",
  },
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.04,
    borderWidth: 0,
    borderTopWidth: 40,
    borderLeftWidth: 40,
    borderColor: colors.primary,
    borderStyle: "dotted",
  },
  locationMarker: {
    position: "absolute",
    alignItems: "center",
    width: 48,
  },
  locationDot: {
    marginBottom: 3,
  },
  locationName: {
    letterSpacing: 0.5,
    textAlign: "center",
  },
  otherAgent: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  playerMarker: {
    position: "absolute",
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playerRing: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0.4,
  },
  playerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 6,
        }
      : {}),
  },
  legendCard: {
    margin: 12,
    padding: 14,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendTitle: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: "600",
  },
  agentCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  agentCardLabel: {
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 3,
    fontWeight: "600",
  },
  agentCardName: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  agentCardLoc: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
