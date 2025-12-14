import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export type AdminStyleAsset = {
  id: string;
  name: string;
  trainingText: string;
  images: string[];
  heroImage?: string;
  status: "draft" | "published";
};

export type AdminProviderKey = {
  provider: string;
  masked?: string;
  // IMPORTANT: we do NOT persist secret in the config JSON.
  // It's only used transiently in the UI when user pastes it.
  secret?: string;
};

export type AdminConfig = {
  ai: {
    providerKeys: AdminProviderKey[];
    defaultProvider: string;
    defaultModel: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    context: string;
    providerParams: { key: string; value: string }[];
    futureReplicateNotes: string;
  };
  pricing: {
    defaultCredits: number;
    expirationDays: number;
    imageCost: number;
    motionCost: number;
  };
  styles: {
    presets: AdminStyleAsset[];
    movementKeywords: string[];
  };
  generations: {
    records: Array<{
      id: string;
      prompt: string;
      user: string;
      model: string;
      status: string;
      url?: string;
      cost?: number;
      liked?: boolean;
      createdAt?: string;
      params?: any;
    }>;
    filters: { status: string; model: string; query: string };
  };
  clients: Array<{
    id: string;
    email: string;
    credits: number;
    expiresAt?: string;
    lastActive?: string;
    disabled?: boolean;
  }>;
  logs: Array<{
    id: string;
    level: "info" | "warn" | "error";
    message: string;
    at: string;
    source: string;
  }>;
  architecture: string;
  assets: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    logo: string;
    otherAssets: Array<{ id: string; name: string; url: string }>;
  };
};

const CONFIG_TABLE = "mina_admin_config";
const SECRETS_TABLE = "mina_admin_secrets";
const SINGLETON_ID = "singleton";

function deepMerge<T>(base: T, patch: any): T {
  if (patch == null || typeof patch !== "object") return base;
  if (Array.isArray(base)) return (patch as any) ?? (base as any);

  const out: any = { ...(base as any) };
  for (const k of Object.keys(patch)) {
    const bv = (base as any)[k];
    const pv = patch[k];
    if (bv && typeof bv === "object" && !Array.isArray(bv)) out[k] = deepMerge(bv, pv);
    else out[k] = pv;
  }
  return out;
}

export function createDefaultAdminConfig(): AdminConfig {
  return {
    ai: {
      providerKeys: [{ provider: "replicate", masked: "" }],
      defaultProvider: "replicate",
      defaultModel: "",
      temperature: 0.7,
      topP: 1,
      maxTokens: 2048,
      context: "",
      providerParams: [],
      futureReplicateNotes: "",
    },
    pricing: {
      defaultCredits: 50,
      expirationDays: 30,
      imageCost: 1,
      motionCost: 2,
    },
    styles: {
      presets: [],
      movementKeywords: [],
    },
    generations: {
      records: [],
      filters: { status: "", model: "", query: "" },
    },
    clients: [],
    logs: [],
    architecture: "",
    assets: {
      primaryColor: "#000000",
      secondaryColor: "#ffffff",
      fontFamily: "Inter, system-ui, Arial",
      logo: "",
      otherAssets: [],
    },
  };
}

export function loadAdminConfig(): AdminConfig {
  return createDefaultAdminConfig();
}

function sanitizeConfigForSave(cfg: AdminConfig): AdminConfig {
  const copy: AdminConfig = JSON.parse(JSON.stringify(cfg));

  // never persist secrets inside the config json
  copy.ai.providerKeys = (copy.ai.providerKeys || []).map((k) => ({
    provider: String(k.provider || "").trim(),
    masked: k.masked || "",
  }));

  // remove empty provider params
  copy.ai.providerParams = (copy.ai.providerParams || [])
    .map((p) => ({ key: String(p.key || "").trim(), value: String(p.value || "") }))
    .filter((p) => p.key.length > 0);

  return copy;
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_mina_admin");
  if (error) return false;
  return Boolean(data);
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, secret.length - 4))}${secret.slice(-4)}`;
}

export async function upsertAdminSecret(provider: string, secret: string): Promise<string> {
  const email = (await supabase.auth.getUser()).data.user?.email ?? null;
  const masked = maskSecret(secret);

  const { error } = await supabase
    .from(SECRETS_TABLE)
    .upsert(
      {
        provider,
        secret,
        masked,
        updated_at: new Date().toISOString(),
        updated_by: email,
      },
      { onConflict: "provider" }
    );

  if (error) throw error;
  return masked;
}

async function fetchMaskedSecrets(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from(SECRETS_TABLE).select("provider, masked");
  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.provider] = row.masked;
  return map;
}

export async function fetchAdminConfig(): Promise<AdminConfig> {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select("config")
    .eq("id", SINGLETON_ID)
    .maybeSingle();

  if (error) throw error;

  const base = createDefaultAdminConfig();
  const merged = deepMerge(base, (data?.config as any) ?? {});
  const maskedSecrets = await fetchMaskedSecrets();

  merged.ai.providerKeys = (merged.ai.providerKeys || []).map((k: any) => ({
    provider: k.provider,
    masked: maskedSecrets[k.provider] ?? k.masked ?? "",
  }));

  // ensure there is at least one provider row
  if (!merged.ai.providerKeys.length) merged.ai.providerKeys = [{ provider: "replicate", masked: maskedSecrets["replicate"] ?? "" }];

  return merged;
}

export async function saveAdminConfig(next: AdminConfig): Promise<void> {
  const email = (await supabase.auth.getUser()).data.user?.email ?? null;
  const sanitized = sanitizeConfigForSave(next);

  const { error } = await supabase
    .from(CONFIG_TABLE)
    .upsert(
      {
        id: SINGLETON_ID,
        config: sanitized,
        updated_at: new Date().toISOString(),
        updated_by: email,
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

export function useAdminConfigState() {
  const [config, setConfig] = useState<AdminConfig>(createDefaultAdminConfig());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchAdminConfig();
      setConfig(cfg);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load admin config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateConfig = useCallback(async (next: AdminConfig) => {
    setError(null);
    await saveAdminConfig(next);
    setConfig(next);
  }, []);

  const memo = useMemo(
    () => ({ config, setConfig, updateConfig, refresh, loading, error }),
    [config, updateConfig, refresh, loading, error]
  );

  return memo;
}
