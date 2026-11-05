import { useEffect } from "react";

import { useMfaStore } from "../stores/useMfaStore";

// Dashboard and lock screen share one monitor. Callbacks always read live state.
let monitorUsers = 0;
let stopMonitor: (() => void) | undefined;

function startMonitor() {
  const check = () => useMfaStore.getState().checkIdleTimeout();
  const handleActivity = () => useMfaStore.getState().updateActivity();
  const handleVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  const events = [
    "pointermove",
    "pointerdown",
    "keydown",
    "click",
    "touchstart",
    "scroll",
  ];
  check();
  const interval = window.setInterval(check, 1000);
  events.forEach((event) =>
    window.addEventListener(event, handleActivity, {
      capture: true,
      passive: true,
    }),
  );
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", handleVisible);
  return () => {
    window.clearInterval(interval);
    events.forEach((event) =>
      window.removeEventListener(event, handleActivity, true),
    );
    window.removeEventListener("focus", check);
    window.removeEventListener("pageshow", check);
    document.removeEventListener("visibilitychange", handleVisible);
  };
}

export const useMFA = () => {
  const isLocked = useMfaStore((state) => state.isLocked);
  const lockScreen = useMfaStore((state) => state.lockScreen);
  const unlockScreen = useMfaStore((state) => state.unlockScreen);

  useEffect(() => {
    if (monitorUsers++ === 0) stopMonitor = startMonitor();
    return () => {
      if (--monitorUsers === 0) {
        stopMonitor?.();
        stopMonitor = undefined;
      }
    };
  }, []);

  return { isLocked, lockScreen, unlockScreen };
};
