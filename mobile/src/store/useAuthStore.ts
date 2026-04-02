import { create } from 'zustand';
import { storage } from '../lib/storage';

interface AuthState {
  token: string | null;
  staffId: string | null;
  loading: boolean;
  login: (staffId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  staffId: null,
  loading: false,

  login: async (staffId: string, pin: string) => {
    set({ loading: true });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const BFF = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:8765';
      const response = await fetch(`${BFF}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ staffId, pin }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Login failed');

      const data = await response.json();
      await storage.setItem('authToken', data.token);
      set({ token: data.token, staffId });
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('Cannot reach server — check your network or BFF URL');
      }
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    await storage.deleteItem('authToken');
    set({ token: null, staffId: null });
  },

  restoreSession: async () => {
    try {
      const token = await storage.getItem('authToken');
      if (token) {
        set({ token });
      }
    } catch (e) {
      console.log('Failed to restore session');
    }
  },

  setToken: (token: string) => set({ token }),
}));
