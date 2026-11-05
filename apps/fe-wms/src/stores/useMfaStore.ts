import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MFA_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function isIdle(lastActiveTime: number, now: number) {
  return (
    !Number.isFinite(lastActiveTime) ||
    now - lastActiveTime >= MFA_IDLE_TIMEOUT_MS
  );
}

interface MfaStore {
  isLocked: boolean;
  lastActiveTime: number;
  lockScreen: () => void;
  unlockScreen: () => void;
  updateActivity: () => void;
  checkIdleTimeout: () => void;
}

export const useMfaStore = create<MfaStore>()(
  persist(
    (set, get) => ({
      isLocked: false,
      lastActiveTime: Date.now(),
      lockScreen: () => set({ isLocked: true }),
      unlockScreen: () => set({ isLocked: false, lastActiveTime: Date.now() }),
      // Check the old deadline before recording the first event after sleep.
      // Activity on the lock screen must never extend the unlocked session.
      updateActivity: () => {
        const state = get();
        if (state.isLocked) return;
        const now = Date.now();
        if (isIdle(state.lastActiveTime, now)) {
          set({ isLocked: true });
          return;
        }
        // Avoid writing persisted state for every pointer event.
        if (now - state.lastActiveTime >= 1000) set({ lastActiveTime: now });
      },
      checkIdleTimeout: () => {
        const state = get();
        if (!state.isLocked && isIdle(state.lastActiveTime, Date.now())) {
          set({ isLocked: true });
        }
      },
    }),
    {
      name: "mfa-storage",
    },
  ),
);
