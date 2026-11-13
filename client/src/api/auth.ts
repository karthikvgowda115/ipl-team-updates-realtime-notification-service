import axios from 'axios';
import { api } from './client';

export interface User {
  id: string;
  name: string;
  username?: string; // missing only on accounts created before usernames existed
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPayload {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  identifier: string; // username or email
  password: string;
}

export interface AuthResponse {
  message?: string;
  token: string;
  user: User;
}

/** Error shape returned by the API: a message plus optional per-field errors. */
export interface ApiError {
  message: string;
  errors?: Record<string, string>;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', payload);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}

/** Turns any Axios/network error into the API's { message, errors } shape. */
export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError<ApiError>(err)) {
    if (err.response?.data?.message) return err.response.data;
    if (!err.response) return { message: 'Cannot reach the server. Is the API running?' };
    return { message: `Request failed (${err.response.status})` };
  }
  return { message: 'Unexpected error' };
}
