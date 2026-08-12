import { apiFetch } from "./client";

export interface MeResult {
  authenticated: boolean;
}

export async function login(password: string): Promise<void> {
  await apiFetch("/login", { method: "POST", body: JSON.stringify({ password }) });
}
export async function logout(): Promise<void> {
  await apiFetch("/logout", { method: "POST" });
}
export async function me(): Promise<MeResult> {
  return apiFetch<MeResult>("/me");
}
