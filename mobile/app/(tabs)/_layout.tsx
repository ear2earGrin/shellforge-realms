import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";

function TabIcon({
  label,
  icon,
  focused,
}: {
  label: string;
  icon: string;
  focused: boolean;
}) {
  return (
    <View style={styles.tabIcon}>
      <Text
        style={[
          styles.tabEmoji,
          { opacity: focused ? 1 : 0.5 },
        ]}
      >
        {icon}
      </Text>
      <Text
        style={[
          styles.tabLabel,
          {
            color: focused ? colors.primary : colors.textMuted,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        } as any,
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: 16,
          letterSpacing: 1,
        },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "AGENT",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="AGENT" icon={"\u{1F916}"} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "FEED",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="FEED" icon={"\u{1F4DC}"} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "MAP",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="MAP" icon={"\u{1F5FA}"} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="whisper"
        options={{
          title: "WHISPER",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="WHISPER" icon={"\u{1F4AC}"} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabEmoji: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
});
