import { View, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

interface StatBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

export function StatBar({ label, value, max, color }: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>
          {value}/{max}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${pct}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
  },
  value: {
    fontSize: 12,
    fontWeight: "700",
  },
  track: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});
