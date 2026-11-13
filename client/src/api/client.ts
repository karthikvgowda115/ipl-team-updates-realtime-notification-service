import axios from 'axios';

const TOKEN_KEY = 'ipl.token';

// Backend origin, e.g. https://ipl-team-updates-realtime-notification.onrender.com
// (set via VITE_API_URL at build time). Trailing "/" or "/api" is tolerated and stripped.
// Empty → same origin: Vite (dev) or nginx (Docker) forwards /api to Express.
export const API_ORIGIN = ((import.meta.env.VITE_API_URL as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  timeout: 10000,
});

// ---------- token storage ----------
// localStorage keeps the user logged in across reloads/tabs. Wrapped in try/catch because
// storage can be unavailable (private mode, blocked site data).
export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// When an authenticated request comes back 401 (expired/invalid token), notify the app
// so it can log the user out. Login failures (no token sent) are left to the caller.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401 && err.config?.headers?.Authorization) {
      onUnauthorized?.();
    }
    return Promise.reject(err);
  },
);

export interface HealthResponse {
  status: string;
  service: string;
  database: string;
  uptime: number;
  timestamp: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}
