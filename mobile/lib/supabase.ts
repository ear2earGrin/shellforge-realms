import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

const SUPABASE_URL: string =
  extra.supabaseUrl || "https://wtzrxscdlqdgdiefsmru.supabase.co";
const SUPABASE_ANON: string =
  extra.supabaseAnonKey ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0enJ4c2NkbHFkZ2RpZWZzbXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTI4MjcsImV4cCI6MjA4OTI2ODgyN30.dLheIKz9anuM58O3Ebsr2rVCOGA-xBGRD9voiXNvIcg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
