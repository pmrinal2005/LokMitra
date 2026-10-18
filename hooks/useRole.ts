"use client";
import { useCallback, useEffect, useState } from "react";
import { adminToken } from "@/lib/client";

export interface RoleState {
  role: "operator" | "citizen";
  is_admin: boolean;
  admin_required: boolean;
  view: "operator" | "citizen";
}

const EVT = "lm-role-change";
let cache: RoleState | null = null;

async function load(): Promise<RoleState> {
  const t = adminToken();
  const r = await fetch("/api/lokmitra/role", { cache: "no-store", headers: t ? { "x-admin-token": t } : {} });
  const j = (await r.json()) as RoleState;
  cache = j;
  return j;
}

/**
 * Shared role hook (citizen vs operator). Gates Settings, the nav Wallet pill and the
 * sidebar wallet footer. `switchTo("operator")` fails with a message when the operator token is missing.
 */
export function useRole() {
  const [state, setState] = useState<RoleState | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setState(s)).catch(() => null);
    const on = () => load().then((s) => alive && setState(s)).catch(() => null);
    window.addEventListener(EVT, on);
    return () => {
      alive = false;
      window.removeEventListener(EVT, on);
    };
  }, []);

  const switchTo = useCallback(async (view: "operator" | "citizen") => {
    setError(null);
    const t = adminToken();
    const r = await fetch("/api/lokmitra/role", { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { "x-admin-token": t } : {}) }, body: JSON.stringify({ view }) });
    const j = await r.json();
    if (!r.ok) {
      setError(j?.error?.message ?? `HTTP ${r.status}`);
      return false;
    }
    cache = j;
    setState(j);
    window.dispatchEvent(new Event(EVT));
    return true;
  }, []);

  return { role: state?.role ?? "citizen", ready: !!state, isOperator: state?.role === "operator", state, error, switchTo, refresh: () => window.dispatchEvent(new Event(EVT)) };
}
