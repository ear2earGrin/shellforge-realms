import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Shellforge Realms",
  slug: "shellforge-realms",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  scheme: "shellforge",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0f",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.shellforge.realms",
    infoPlist: {
      NSFaceIDUsageDescription: "Use Face ID to unlock Shellforge Realms",
    },
    usesAppleSignIn: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0a0a0f",
    },
    edgeToEdgeEnabled: true,
    package: "com.shellforge.realms",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-local-authentication",
    "expo-apple-authentication",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#00f0ff",
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "https://wtzrxscdlqdgdiefsmru.supabase.co",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0enJ4c2NkbHFkZ2RpZWZzbXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMzNzc1MzIsImV4cCI6MjA1ODk1MzUzMn0.QLpJxAZiJR8b8p0xMFHQ8OLExVsEzmKRKW39mMO-I1E",
    minAppVersion: "1.0.0",
    eas: {
      projectId: "your-eas-project-id",
    },
  },
});
