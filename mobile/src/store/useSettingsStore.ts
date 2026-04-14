import { create } from 'zustand';
import { storage } from '../lib/storage';

const STORAGE_KEY = 'settings';

interface SettingsState {
  surchargesEnabled: boolean;
  setSurchargesEnabled: (enabled: boolean) => void;
  // Email receipt settings
  emailReceiptsEnabled: boolean;
  setEmailReceiptsEnabled: (enabled: boolean) => void;
  storeName: string;
  setStoreName: (name: string) => void;
  restoreSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  surchargesEnabled: true,
  emailReceiptsEnabled: false,
  storeName: 'Kmart',

  setSurchargesEnabled: async (enabled) => {
    set({ surchargesEnabled: enabled });
    await persistSettings({ ...get(), surchargesEnabled: enabled });
  },

  setEmailReceiptsEnabled: async (enabled) => {
    set({ emailReceiptsEnabled: enabled });
    await persistSettings({ ...get(), emailReceiptsEnabled: enabled });
  },

  setStoreName: async (name) => {
    set({ storeName: name });
    await persistSettings({ ...get(), storeName: name });
  },

  restoreSettings: async () => {
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({
          surchargesEnabled:    saved.surchargesEnabled    ?? true,
          emailReceiptsEnabled: saved.emailReceiptsEnabled ?? false,
          storeName:            saved.storeName            ?? 'Kmart',
        });
      }
    } catch { /* use defaults */ }
  },
}));

async function persistSettings(state: SettingsState) {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify({
      surchargesEnabled:    state.surchargesEnabled,
      emailReceiptsEnabled: state.emailReceiptsEnabled,
      storeName:            state.storeName,
    }));
  } catch { /* non-fatal */ }
}
