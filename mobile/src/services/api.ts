import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BFF_URL = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:3001';

let api: AxiosInstance;

export async function initializeApi() {
  api = axios.create({
    baseURL: BFF_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth token to all requests
  api.interceptors.request.use(async (config) => {
    const token = await SecureStore.getItemAsync('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return api;
}

export const apiClient = {
  // Auth
  login: (staffId: string, pin: string) =>
    api.post('/api/auth/login', { staffId, pin }),

  // Catalog
  searchItems: (query: string) =>
    api.get('/api/catalog/search', { params: { q: query } }),

  getItemPrices: (itemIds: string[]) =>
    api.post('/api/catalog/prices', { itemIds }),

  // Cart
  createCart: () => api.post('/api/cart'),

  getCart: (cartId: string) => api.get(`/api/cart/${cartId}`),

  addToCart: (cartId: string, itemId: string, quantity: number) =>
    api.post(`/api/cart/${cartId}/items`, { itemId, quantity }),

  removeFromCart: (cartId: string, itemId: string) =>
    api.delete(`/api/cart/${cartId}/items/${itemId}`),

  // Order
  checkout: (cartId: string, paymentMethod: string) =>
    api.post(`/api/order/checkout`, { cartId, paymentMethod }),

  // Sites
  getCurrentSite: () => api.get('/api/sites/current'),
};
