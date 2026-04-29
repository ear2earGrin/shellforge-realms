import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { clearCache } from "./cache";

export function useAppRefresh(onForeground: () => void) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        clearCache();
        onForeground();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [onForeground]);
}
