import { API_URL } from "./config";

export type User = {
  user_id: string;
  full_name: string;
  mobile_number?: string;
  email?: string | null;
  created_at?: string;
};

export type PublicUser = {
  user_id: string;
  full_name: string;
  profile_picture_url?: string | null;
  preferred_language?: string | null;
  country?: string | null;
};

export type CallHistory = {
  call_id: string;
  caller_user_id: string;
  receiver_user_id: string;
  call_type: "voice" | "video";
  status: string;
  created_at: string;
  duration_seconds: number;
};

export async function apiRequest<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Request failed. Please try again.");
  }
  return data as T;
}

export function getSocketUrl() {
  return API_URL;
}
