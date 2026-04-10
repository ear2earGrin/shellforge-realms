import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ScrollView,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { colors, spacing } from "../../lib/theme";
import { LOCATIONS } from "../../lib/types";
import type { Agent } from "../../lib/types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const MAP_SIZE = SCREEN_WIDTH - spacing.md * 2;

// Map world coords (5000-15000 range) to screen coords (0-MAP_SIZE)
function worldToScreen(wx: number, wy: number) {
  const minW = 5000;
  const maxW = 15000;
  const range = maxW - minW;
  return {
    x: ((wx - minW) / range) * MAP_SIZE,
    y: ((wy - minW) / range) * MAP_SIZE,
  };
}

const DANGER_COLORS: Record<string, string> = {
  safe: colors.success,
  moderate: colors.warning,
  dangerous: colors.danger,
  extreme: colors.secondary,
  lethal: "#ff0000",
};

export default function MapScreen() {
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
      .select("agent_id, agent_name, location, position_x, position_y, is_alive, user_id")
      .eq("is_alive", true);

    if (agents) {
      setAllAgents(agents as Agent[]);
      const mine = agents.find((a) => a.user_id === user.id);
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
      {/* Map Canvas */}
      <View style={styles.mapContainer}>
        <View style={styles.mapCanvas}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <View key={`h-${frac}`}>
              <View
                style={[
                  styles.gridLineH,
                  { top: MAP_SIZE * frac },
                ]}
              />
              <View
                style={[
                  styles.gridLineV,
                  { left: MAP_SIZE * frac },
                ]}
              />
            </View>
          ))}

          {/* Location markers */}
          {Object.entries(LOCATIONS).map(([key, loc]) => {
            const pos = worldToScreen(loc.x, loc.y);
            const dangerColor = DANGER_COLORS[loc.danger] || colors.textMuted;
            return (
              <View
                key={key}
                style={[
                  styles.locationMarker,
                  {
                    left: pos.x - 20,
                    top: pos.y - 20,
                  },
                ]}
              >
                <View
                  style={[
                    styles.locationDot,
                    { backgroundColor: dangerColor },
                  ]}
                />
                <Text
                  style={[styles.locationName, { color: dangerColor }]}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
              </View>
            );
          })}

          {/* Other agents */}
          {allAgents
            .filter((a) => a.agent_id !== agent?.agent_id)
            .map((a) => {
              const pos = worldToScreen(a.position_x, a.position_y);
              return (
                <View
                  key={a.agent_id}
                  style={[
                    styles.agentDot,
                    {
                      left: pos.x - 3,
                      top: pos.y - 3,
                      backgroundColor: colors.textMuted,
                    },
                  ]}
                />
              );
            })}

          {/* Player's agent (highlighted) */}
          {agent && (
            <View
              style={[
                styles.playerMarker,
                {
                  left: worldToScreen(agent.position_x, agent.position_y).x - 8,
                  top: worldToScreen(agent.position_x, agent.position_y).y - 8,
                },
              ]}
            >
              <View style={styles.playerDot} />
              <View style={styles.playerPulse} />
            </View>
          )}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
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

      {/* Agent Position Info */}
      {agent && (
        <View style={styles.positionCard}>
          <Text style={styles.positionTitle}>YOUR AGENT</Text>
          <Text style={styles.positionName}>{agent.agent_name}</Text>
          <Text style={styles.positionLoc}>
            {agent.location} ({Math.round(agent.position_x)},{" "}
            {Math.round(agent.position_y)})
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapContainer: {
    padding: spacing.md,
  },
  mapCanvas: {
    width: MAP_SIZE,
    height: MAP_SIZE,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    position: "relative",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  locationMarker: {
    position: "absolute",
    alignItems: "center",
    width: 40,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationName: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: "center",
  },
  agentDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.6,
  },
  playerMarker: {
    position: "absolute",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  playerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    zIndex: 2,
  },
  playerPulse: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0.4,
  },
  legend: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendTitle: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 8,
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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  positionCard: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryDim,
  },
  positionTitle: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 3,
  },
  positionName: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  positionLoc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
