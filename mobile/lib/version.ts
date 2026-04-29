import Constants from "expo-constants";
import { supabase } from "./supabase";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function checkMinVersion(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "min_app_version")
      .single();

    if (!data?.value) return true;
    return compareVersions(APP_VERSION, data.value) >= 0;
  } catch {
    return true;
  }
}
