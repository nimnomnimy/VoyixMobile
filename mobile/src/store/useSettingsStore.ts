import { create } from 'zustand';
import { storage } from '../lib/storage';

const STORAGE_KEY = 'settings';

interface SettingsState {
  surchargesEnabled: boolean;
  setSurchargesEnabled: (enabled: boolean) => void;
  restoreSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  surchargesEnabled: true,

  setSurchargesEnabled: async (enabled) => {
    set({ surchargesEnabled: enabled });
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify({ surchargesEnabled: enabled }));
    } catch { /* non-fatal */ }
  },

  restoreSettings: async () => {
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({ surchargesEnabled: saved.surchargesEnabled ?? true });
      }
    } catch { /* use defaults */ }
  },
}));
