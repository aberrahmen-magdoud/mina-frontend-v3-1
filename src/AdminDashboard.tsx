import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./admin.css";

/**
 * LIVE Admin Dashboard (Supabase-backed)
 * Tables:
 *  - public.mina_admin_config   (id='singleton', config jsonb)
 *  - public.mina_admin_secrets  (provider text pk, secret text, masked text)
 */

type TabKey =
  | "ai"
  | "pricing"
  | "styles"
  | "generations"
  | "clients"
  | "logs"
  | "architecture"
  | "assets";

const TAB_LABELS: Record<TabKey, string> = {
  ai: "AI Settings",
  pricing: "Credits & Pricing",
  styles: "Styles",
  generations: "Generations",
  clients: "Clients",
  logs: "Logs",
  architecture: "Architecture",
  assets: "Assets",
};

type KVRow = { key: string; value: string };

type AdminStyleAsset = {
  id: string;
  name: string;
  heroImage?: string;
  images: string[];
  trainingText: string;
  status: "draft" | "published";
};

type GenerationRecord = {
  id: string;
  url?: string;
  prompt: string;
  user: string;
  model: string;
  status: string;
  cost?: number;
  liked?: boolean;
  createdAt: string;
  params?: Record<string, any>;
};

type AdminConfig = {
  ai: {
    providerKeys: Array<{
      provider: string;
      // secret is only held in UI draft until Save; we do NOT store it in mina_admin_config
      secret?: string;
      masked?: string;
    }>;
    defaultProvider: string;
    defaultModel: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    context: string;
    providerParams: KVRow[];
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
    records: GenerationRecord[];
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

const ADMIN_CONFIG_TABLE = "mina_admin_config";
const ADMIN_SECRETS_TABLE = "mina_admin_secrets";
const ADMIN_CONFIG_ID = "singleton";

const DEFAULT_CONFIG: AdminConfig = {
  ai: {
    providerKeys: [{ provider: "replicate", masked: "" }],
    defaultProvider: "replicate",
    defaultModel: "",
    temperature: 0.7,
    topP: 1,
    maxTokens: 1024,
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
    fontFamily: "system-ui",
    logo: "",
    otherAssets: [],
  },
};

function maskSecret(secret?: string) {
  if (!secret) return "";
  const s = String(secret);
  if (s.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

function normalizeConfig(input: any): AdminConfig {
  const cfg = input && typeof input === "object" ? input : {};

  const ai = cfg.ai && typeof cfg.ai === "object" ? cfg.ai : {};
  const pricing = cfg.pricing && typeof cfg.pricing === "object" ? cfg.pricing : {};
  const styles = cfg.styles && typeof cfg.styles === "object" ? cfg.styles : {};
  const generations = cfg.generations && typeof cfg.generations === "object" ? cfg.generations : {};
  const assets = cfg.assets && typeof cfg.assets === "object" ? cfg.assets : {};

  return {
    ai: {
      providerKeys: Array.isArray(ai.providerKeys) ? ai.providerKeys : DEFAULT_CONFIG.ai.providerKeys,
      defaultProvider: typeof ai.defaultProvider === "string" ? ai.defaultProvider : DEFAULT_CONFIG.ai.defaultProvider,
      defaultModel: typeof ai.defaultModel === "string" ? ai.defaultModel : DEFAULT_CONFIG.ai.defaultModel,
      temperature: typeof ai.temperature === "number" ? ai.temperature : DEFAULT_CONFIG.ai.temperature,
      topP: typeof ai.topP === "number" ? ai.topP : DEFAULT_CONFIG.ai.topP,
      maxTokens: typeof ai.maxTokens === "number" ? ai.maxTokens : DEFAULT_CONFIG.ai.maxTokens,
      context: typeof ai.context === "string" ? ai.context : DEFAULT_CONFIG.ai.context,
      providerParams: Array.isArray(ai.providerParams) ? ai.providerParams : DEFAULT_CONFIG.ai.providerParams,
      futureReplicateNotes:
        typeof ai.futureReplicateNotes === "string" ? ai.futureReplicateNotes : DEFAULT_CONFIG.ai.futureReplicateNotes,
    },
    pricing: {
      defaultCredits: typeof pricing.defaultCredits === "number" ? pricing.defaultCredits : DEFAULT_CONFIG.pricing.defaultCredits,
      expirationDays: typeof pricing.expirationDays === "number" ? pricing.expirationDays : DEFAULT_CONFIG.pricing.expirationDays,
      imageCost: typeof pricing.imageCost === "number" ? pricing.imageCost : DEFAULT_CONFIG.pricing.imageCost,
      motionCost: typeof pricing.motionCost === "number" ? pricing.motionCost : DEFAULT_CONFIG.pricing.motionCost,
    },
    styles: {
      presets: Array.isArray(styles.presets) ? styles.presets : DEFAULT_CONFIG.styles.presets,
      movementKeywords: Array.isArray(styles.movementKeywords) ? styles.movementKeywords : DEFAULT_CONFIG.styles.movementKeywords,
    },
    generations: {
      records: Array.isArray(generations.records) ? generations.records : DEFAULT_CONFIG.generations.records,
      filters:
        generations.filters && typeof generations.filters === "object"
          ? {
              status: typeof generations.filters.status === "string" ? generations.filters.status : "",
              model: typeof generations.filters.model === "string" ? generations.filters.model : "",
              query: typeof generations.filters.query === "string" ? generations.filters.query : "",
            }
          : { ...DEFAULT_CONFIG.generations.filters },
    },
    clients: Array.isArray(cfg.clients) ? cfg.clients : DEFAULT_CONFIG.clients,
    logs: Array.isArray(cfg.logs) ? cfg.logs : DEFAULT_CONFIG.logs,
    architecture: typeof cfg.architecture === "string" ? cfg.architecture : DEFAULT_CONFIG.architecture,
    assets: {
      primaryColor: typeof assets.primaryColor === "string" ? assets.primaryColor : DEFAULT_CONFIG.assets.primaryColor,
      secondaryColor: typeof assets.secondaryColor === "string" ? assets.secondaryColor : DEFAULT_CONFIG.assets.secondaryColor,
      fontFamily: typeof assets.fontFamily === "string" ? assets.fontFamily : DEFAULT_CONFIG.assets.fontFamily,
      logo: typeof assets.logo === "string" ? assets.logo : DEFAULT_CONFIG.assets.logo,
      otherAssets: Array.isArray(assets.otherAssets) ? assets.otherAssets : DEFAULT_CONFIG.assets.otherAssets,
    },
  };
}

function stripSecretsFromConfig(cfg: AdminConfig): AdminConfig {
  return {
    ...cfg,
    ai: {
      ...cfg.ai,
      providerKeys: cfg.ai.providerKeys.map((k) => ({
        provider: k.provider,
        masked: k.masked || "",
      })),
    },
  };
}

function AdminHeader({
  onSave,
  onReload,
  saving,
  status,
}: {
  onSave: () => void;
  onReload: () => void;
  saving: boolean;
  status: string;
}) {
  return (
    <header className="admin-header">
      <div>
        <div className="admin-title">Mina Admin</div>
        <div className="admin-subtitle">Editorial dashboard (LIVE via Supabase)</div>
        {status ? <div className="admin-subtitle" style={{ opacity: 0.85 }}>{status}</div> : null}
      </div>
      <div className="admin-actions">
        <button className="admin-button ghost" onClick={onReload} disabled={saving}>
          Reload
        </button>
        <button className="admin-button" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </header>
  );
}

function Section({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="admin-section">
      <header>
        <div className="admin-section-title">{title}</div>
        {description && <p className="admin-section-desc">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Table({ headers, children }: React.PropsWithChildren<{ headers: string[] }>) {
  return (
    <div className="admin-table">
      <div className="admin-table-head">
        {headers.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      <div className="admin-table-body">{children}</div>
    </div>
  );
}

function StickyTabs({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="admin-tabs">
      {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
        <button
          key={key}
          className={`admin-tab ${active === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {TAB_LABELS[key]}
        </button>
      ))}
    </nav>
  );
}

function EditableKeyValue({
  params,
  onChange,
}: {
  params: { key: string; value: string }[];
  onChange: (next: { key: string; value: string }[]) => void;
}) {
  return (
    <div className="admin-kv-list">
      {params.map((row, idx) => (
        <div className="admin-kv-row" key={`${row.key}-${idx}`}>
          <input
            value={row.key}
            onChange={(e) => {
              const next = [...params];
              next[idx] = { ...row, key: e.target.value };
              onChange(next);
            }}
            placeholder="key"
          />
          <input
            value={row.value}
            onChange={(e) => {
              const next = [...params];
              next[idx] = { ...row, value: e.target.value };
              onChange(next);
            }}
            placeholder="value"
          />
          <button className="admin-button ghost" type="button" onClick={() => onChange(params.filter((_, i) => i !== idx))}>
            Remove
          </button>
        </div>
      ))}
      <button className="admin-button ghost" type="button" onClick={() => onChange([...params, { key: "", value: "" }])}>
        Add param
      </button>
    </div>
  );
}

function AISettingsTab({
  config,
  setConfig,
  markSecretDirty,
}: {
  config: AdminConfig;
  setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void;
  markSecretDirty: (provider: string, secret: string) => void;
}) {
  const ai = config.ai;

  return (
    <div className="admin-grid">
      <Section title="Providers" description="Swap keys, providers and models without code.">
        <Table headers={["Provider", "Model", "Key (masked)", "Actions"]}>
          {ai.providerKeys.map((row, idx) => (
            <div className="admin-table-row" key={`${row.provider}-${idx}`}>
              <div>
                <input
                  value={row.provider}
                  onChange={(e) => {
                    const next = [...ai.providerKeys];
                    next[idx] = { ...row, provider: e.target.value };
                    setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                  }}
                />
              </div>
              <div>
                <input
                  value={ai.defaultModel}
                  onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })}
                  placeholder="model"
                />
              </div>
              <div className="admin-masked">{row.masked || maskSecret(row.secret) || "—"}</div>
              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={() => {
                    const replacement = window.prompt(`Replace secret for "${row.provider}" (stored in Supabase)`, "");
                    if (replacement !== null) {
                      const secret = replacement.trim();
                      const nextMasked = maskSecret(secret);
                      const next = [...ai.providerKeys];
                      next[idx] = { ...row, secret, masked: nextMasked };
                      setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                      markSecretDirty(row.provider, secret);
                    }
                  }}
                >
                  Replace
                </button>
              </div>
            </div>
          ))}
        </Table>

        <div className="admin-inline">
          <label>
            <strong>Default provider</strong>
            <input value={ai.defaultProvider} onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultProvider: e.target.value } })} />
          </label>
          <label>
            <strong>Default model</strong>
            <input value={ai.defaultModel} onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })} />
          </label>
          <label>
            <strong>Temperature</strong>
            <input
              type="number"
              step="0.1"
              value={ai.temperature}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, temperature: parseFloat(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>top_p</strong>
            <input
              type="number"
              step="0.05"
              value={ai.topP}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, topP: parseFloat(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>Max tokens</strong>
            <input
              type="number"
              value={ai.maxTokens}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, maxTokens: Number(e.target.value) || 0 } })}
            />
          </label>
        </div>
      </Section>

      <Section title="Context" description="Overrides the baked system prompt across pipelines.">
        <textarea className="admin-textarea" value={ai.context} onChange={(e) => setConfig({ ...config, ai: { ...ai, context: e.target.value } })} />
      </Section>

      <Section title="Provider parameters" description="Expose low-level flags (e.g. seedream params)">
        <EditableKeyValue params={ai.providerParams} onChange={(next) => setConfig({ ...config, ai: { ...ai, providerParams: next } })} />
      </Section>

      <Section title="Future models" description="Drop replicate snippets for SVG/audio ahead of time.">
        <textarea
          className="admin-textarea"
          value={ai.futureReplicateNotes}
          onChange={(e) => setConfig({ ...config, ai: { ...ai, futureReplicateNotes: e.target.value } })}
          placeholder="Copy/paste replicate code blocks"
        />
      </Section>
    </div>
  );
}

function PricingTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const pricing = config.pricing;
  return (
    <div className="admin-grid">
      <Section title="Credits" description="Free credits, expiry and unit cost">
        <div className="admin-inline">
          <label>
            <strong>Default free credits</strong>
            <input
              type="number"
              value={pricing.defaultCredits}
              onChange={(e) => setConfig({ ...config, pricing: { ...pricing, defaultCredits: Number(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>Expiration (days)</strong>
            <input
              type="number"
              value={pricing.expirationDays}
              onChange={(e) => setConfig({ ...config, pricing: { ...pricing, expirationDays: Number(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>Still cost (Matchas)</strong>
            <input type="number" value={pricing.imageCost} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, imageCost: Number(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>Motion cost (Matchas)</strong>
            <input type="number" value={pricing.motionCost} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, motionCost: Number(e.target.value) || 0 } })} />
          </label>
        </div>
      </Section>
    </div>
  );
}

function StylesTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const [draftStyle, setDraftStyle] = useState<AdminStyleAsset>({
    id: String(Date.now()),
    name: "Untitled",
    images: [],
    trainingText: "",
    status: "draft",
  });

  const styles = config.styles;

  const updatePreset = (index: number, next: AdminStyleAsset) => {
    const presets = [...styles.presets];
    presets[index] = next;
    setConfig({ ...config, styles: { ...styles, presets } });
  };

  const handleUpload = (files: FileList | null, cb: (url: string) => void) => {
    if (!files?.length) return;
    const file = files[0];
    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File too large (max 3MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="admin-grid">
      <Section title="Predefined styles" description="Draft/publish presets shown to users.">
        <Table headers={["Name", "Training text", "Hero", "Images", "Status", "Actions"]}>
          {styles.presets.map((preset, idx) => (
            <div className="admin-table-row" key={preset.id}>
              <div>
                <input value={preset.name} onChange={(e) => updatePreset(idx, { ...preset, name: e.target.value })} />
              </div>
              <div>
                <textarea className="admin-textarea" value={preset.trainingText} onChange={(e) => updatePreset(idx, { ...preset, trainingText: e.target.value })} />
              </div>
              <div className="admin-thumb-col">
                {preset.heroImage ? <img src={preset.heroImage} alt="hero" /> : <span>—</span>}
                <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => updatePreset(idx, { ...preset, heroImage: url }))} />
              </div>
              <div>
                <div className="admin-image-grid">
                  {preset.images.slice(0, 10).map((img, i) => (
                    <img key={`${preset.id}-${i}`} src={img} alt="style" />
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    handleUpload(e.target.files, (url) => {
                      const merged = [...preset.images, url].slice(-10);
                      updatePreset(idx, { ...preset, images: merged });
                    })
                  }
                />
              </div>
              <div>
                <select value={preset.status} onChange={(e) => updatePreset(idx, { ...preset, status: e.target.value as AdminStyleAsset["status"] })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  onClick={() => {
                    const presets = styles.presets.filter((_, i) => i !== idx);
                    setConfig({ ...config, styles: { ...styles, presets } });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Table>

        <div className="admin-inline">
          <label>
            <strong>Movement keywords</strong>
            <input
              value={styles.movementKeywords.join(", ")}
              onChange={(e) =>
                setConfig({
                  ...config,
                  styles: { ...styles, movementKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) },
                })
              }
            />
          </label>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Add style</div>
          <div className="admin-inline">
            <label>
              <strong>Name</strong>
              <input value={draftStyle.name} onChange={(e) => setDraftStyle({ ...draftStyle, name: e.target.value })} />
            </label>
            <label>
              <strong>Status</strong>
              <select value={draftStyle.status} onChange={(e) => setDraftStyle({ ...draftStyle, status: e.target.value as AdminStyleAsset["status"] })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>
          <label>
            <strong>Training text</strong>
            <textarea className="admin-textarea" value={draftStyle.trainingText} onChange={(e) => setDraftStyle({ ...draftStyle, trainingText: e.target.value })} />
          </label>
          <div className="admin-inline">
            <div>
              <strong>Hero image</strong>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, heroImage: url }))} />
            </div>
            <div>
              <strong>Gallery</strong>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, images: [...draftStyle.images, url].slice(-10) }))
                }
              />
            </div>
          </div>
          <button
            className="admin-button"
            type="button"
            onClick={() => {
              setConfig({ ...config, styles: { ...styles, presets: [draftStyle, ...styles.presets].slice(0, 20) } });
              setDraftStyle({ id: String(Date.now()), name: "Untitled", images: [], trainingText: "", status: "draft" });
            }}
          >
            Add style
          </button>
        </div>
      </Section>
    </div>
  );
}

function GenerationsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const [page, setPage] = useState(0);
  const pageSize = 28;
  const { records, filters } = config.generations;

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchStatus = !filters.status || r.status === filters.status;
      const matchModel = !filters.model || r.model === filters.model;
      const matchQuery = !filters.query || `${r.prompt} ${r.user}`.toLowerCase().includes(filters.query.toLowerCase());
      return matchStatus && matchModel && matchQuery;
    });
  }, [records, filters]);

  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const [selected, setSelected] = useState<GenerationRecord | null>(null);

  useEffect(() => {
    if (selected && !filtered.some((x) => x.id === selected.id)) setSelected(null);
  }, [filtered, selected]);

  return (
    <div className="admin-grid admin-split">
      <Section title="Generations" description="7-column grid with detail panel">
        <div className="admin-inline">
          <input
            placeholder="Search prompt/user"
            value={filters.query}
            onChange={(e) =>
              setConfig({ ...config, generations: { ...config.generations, filters: { ...filters, query: e.target.value } } })
            }
          />
          <input
            placeholder="Model"
            value={filters.model}
            onChange={(e) =>
              setConfig({ ...config, generations: { ...config.generations, filters: { ...filters, model: e.target.value } } })
            }
          />
          <input
            placeholder="Status"
            value={filters.status}
            onChange={(e) =>
              setConfig({ ...config, generations: { ...config.generations, filters: { ...filters, status: e.target.value } } })
            }
          />
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => setConfig({ ...config, generations: { ...config.generations, filters: { status: "", model: "", query: "" } } })}
          >
            Clear filters
          </button>
        </div>

        <div className="admin-grid-gallery">
          {visible.map((g) => (
            <button
              key={g.id}
              className={`admin-grid-card ${selected?.id === g.id ? "active" : ""}`}
              onClick={() => setSelected(g)}
            >
              {g.url ? <img src={g.url} alt={g.prompt} loading="lazy" /> : <div className="admin-placeholder">no image</div>}
              <div className="admin-grid-meta">
                <div className="admin-grid-prompt">{g.prompt}</div>
                <div className="admin-grid-sub">{g.model}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="admin-pagination">
          <span>
            Page {page + 1} / {Math.max(1, Math.ceil(filtered.length / pageSize))}
          </span>
          <div>
            <button className="admin-button ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </button>
            <button
              className="admin-button ghost"
              disabled={(page + 1) * pageSize >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </Section>

      <Section title="Details" description="Metadata surface">
        {selected ? (
          <div className="admin-detail">
            <div className="admin-detail-row">
              <strong>Prompt</strong>
              <span>{selected.prompt}</span>
            </div>
            <div className="admin-detail-row">
              <strong>User</strong>
              <span>{selected.user}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Model</strong>
              <span>{selected.model}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Status</strong>
              <span>{selected.status}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Cost</strong>
              <span>{selected.cost ?? "—"}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Liked</strong>
              <span>{selected.liked ? "Yes" : "No"}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Created</strong>
              <span>{selected.createdAt}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Params</strong>
              <pre>{JSON.stringify(selected.params ?? {}, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <p className="admin-muted">Select a generation to inspect.</p>
        )}
      </Section>
    </div>
  );
}

function ClientsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const clients = config.clients;
  return (
    <div className="admin-grid">
      <Section title="Clients" description="Edit credits and disable accounts (stored in config jsonb)">
        <Table headers={["Client", "Credits", "Expires", "Last active", "Status", "Actions"]}>
          {clients.map((c, idx) => (
            <div className="admin-table-row" key={c.id}>
              <div>{c.email}</div>
              <div>
                <input
                  type="number"
                  value={c.credits}
                  onChange={(e) => {
                    const next = [...clients];
                    next[idx] = { ...c, credits: Number(e.target.value) || 0 };
                    setConfig({ ...config, clients: next });
                  }}
                />
              </div>
              <div>
                <input
                  type="date"
                  value={c.expiresAt?.slice(0, 10) || ""}
                  onChange={(e) => {
                    const next = [...clients];
                    next[idx] = { ...c, expiresAt: e.target.value };
                    setConfig({ ...config, clients: next });
                  }}
                />
              </div>
              <div>{c.lastActive || "—"}</div>
              <div>{c.disabled ? "Disabled" : "Active"}</div>
              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  onClick={() => {
                    const next = [...clients];
                    next[idx] = { ...c, disabled: !c.disabled };
                    setConfig({ ...config, clients: next });
                  }}
                >
                  {c.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  className="admin-button ghost"
                  onClick={() => {
                    const ok = window.confirm("Delete client record?");
                    if (ok) setConfig({ ...config, clients: clients.filter((_, i) => i !== idx) });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Table>
        <button
          className="admin-button"
          type="button"
          onClick={() =>
            setConfig({
              ...config,
              clients: [
                ...clients,
                {
                  id: String(Date.now()),
                  email: "new@client.com",
                  credits: config.pricing.defaultCredits,
                  lastActive: new Date().toISOString(),
                },
              ],
            })
          }
        >
          Add client
        </button>
      </Section>
    </div>
  );
}

function LogsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    const id = window.setInterval(() => {
      setConfig((prev) => {
        const nextLog = {
          id: String(Date.now()),
          level: "info" as const,
          message: "Heartbeat",
          at: new Date().toISOString(),
          source: "client-poll",
        };
        return { ...prev, logs: [...prev.logs.slice(-200), nextLog] };
      });
    }, 6000);
    return () => window.clearInterval(id);
  }, [setConfig]);

  return (
    <div className="admin-grid">
      <Section title="Realtime-ish logs" description="This demo log stream is stored in config jsonb when you Save.">
        <div className="admin-inline">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button className="admin-button ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(config.logs, null, 2))}>
            Copy JSON
          </button>
        </div>
        <div className="admin-log-shell">
          {config.logs
            .filter((l) => !filter || l.level === filter)
            .slice(-300)
            .reverse()
            .map((log) => (
              <div key={log.id} className={`admin-log-row level-${log.level}`}>
                <div className="admin-log-meta">
                  <span>{log.level.toUpperCase()}</span>
                  <span>{log.at}</span>
                  <span>{log.source}</span>
                </div>
                <div>{log.message}</div>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

function ArchitectureTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  return (
    <div className="admin-grid">
      <Section title="Architecture map" description="Editable description of the pipeline (stored in config jsonb)">
        <textarea className="admin-textarea" value={config.architecture} onChange={(e) => setConfig({ ...config, architecture: e.target.value })} />
        <ol className="admin-steps">
          {config.architecture
            .split(/\n|\d\)/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
        </ol>
      </Section>
    </div>
  );
}

function AssetsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => void }) {
  const assets = config.assets;

  const handleUpload = (files: FileList | null, cb: (url: string) => void) => {
    if (!files?.length) return;
    const file = files[0];
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Too large (2MB max)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="admin-grid">
      <Section title="Brand assets" description="Colors, fonts, logo and misc images (stored in config jsonb)">
        <div className="admin-inline">
          <label>
            <strong>Primary color</strong>
            <input value={assets.primaryColor} onChange={(e) => setConfig({ ...config, assets: { ...assets, primaryColor: e.target.value } })} />
          </label>
          <label>
            <strong>Secondary color</strong>
            <input value={assets.secondaryColor} onChange={(e) => setConfig({ ...config, assets: { ...assets, secondaryColor: e.target.value } })} />
          </label>
          <label>
            <strong>Font</strong>
            <input value={assets.fontFamily} onChange={(e) => setConfig({ ...config, assets: { ...assets, fontFamily: e.target.value } })} />
          </label>
        </div>

        <div className="admin-inline">
          <div>
            <strong>Logo</strong>
            {assets.logo && <img className="admin-logo" src={assets.logo} alt="logo" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files, (url) => setConfig({ ...config, assets: { ...assets, logo: url } }))}
            />
          </div>

          <div>
            <strong>Other assets</strong>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                handleUpload(e.target.files, (url) =>
                  setConfig({
                    ...config,
                    assets: {
                      ...assets,
                      otherAssets: [...assets.otherAssets, { id: String(Date.now()), name: `asset-${assets.otherAssets.length + 1}`, url }],
                    },
                  })
                )
              }
            />
            <div className="admin-image-grid">
              {assets.otherAssets.map((a) => (
                <div key={a.id} className="admin-thumb-col">
                  <img src={a.url} alt={a.name} />
                  <div className="admin-grid-sub">{a.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabKey>("ai");
  const [draft, setDraft] = useState<AdminConfig>(DEFAULT_CONFIG);
  const [boot, setBoot] = useState<"loading" | "ready" | "denied">("loading");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [dirtySecrets, setDirtySecrets] = useState<Record<string, string>>({});

  const setConfig = useCallback((next: AdminConfig | ((prev: AdminConfig) => AdminConfig)) => {
    setDraft((prev) => (typeof next === "function" ? (next as any)(prev) : next));
  }, []);

  const markSecretDirty = useCallback((provider: string, secret: string) => {
    setDirtySecrets((prev) => ({ ...prev, [provider]: secret }));
  }, []);

  const mergeMaskedSecretsIntoConfig = useCallback((cfg: AdminConfig, secrets: Array<{ provider: string; masked: string }>) => {
    const secretMap = new Map(secrets.map((s) => [s.provider, s.masked]));

    // ensure providers from secrets exist in config list
    const providersInCfg = new Set(cfg.ai.providerKeys.map((k) => k.provider));
    const missingProviders = secrets.filter((s) => !providersInCfg.has(s.provider)).map((s) => ({ provider: s.provider, masked: s.masked }));

    const mergedKeys = [...cfg.ai.providerKeys, ...missingProviders].map((k) => ({
      provider: k.provider,
      // never persist plaintext in config
      secret: k.secret || "",
      masked: secretMap.get(k.provider) ?? k.masked ?? "",
    }));

    return {
      ...cfg,
      ai: { ...cfg.ai, providerKeys: mergedKeys },
    };
  }, []);

  const loadFromSupabase = useCallback(async () => {
    setStatus("Loading from Supabase...");
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      setBoot("denied");
      window.location.replace("/");
      return;
    }

    // 1) Load config row
    const cfgRes = await supabase
      .from(ADMIN_CONFIG_TABLE)
      .select("config")
      .eq("id", ADMIN_CONFIG_ID)
      .maybeSingle();

    // If not allowed by RLS, you typically get "no rows" (filtered out) or an error.
    if (cfgRes.error) {
      console.error(cfgRes.error);
      setBoot("denied");
      window.location.replace("/");
      return;
    }

    // If row doesn't exist yet, try to create it (admins only)
    if (!cfgRes.data) {
      const up = await supabase.from(ADMIN_CONFIG_TABLE).upsert(
        {
          id: ADMIN_CONFIG_ID,
          config: stripSecretsFromConfig(DEFAULT_CONFIG),
          updated_by: (userRes.user.email || "").toLowerCase(),
        } as any,
        { onConflict: "id" }
      );

      if (up.error) {
        console.error(up.error);
        setBoot("denied");
        window.location.replace("/");
        return;
      }
    }

    const rawConfig = cfgRes.data?.config ?? DEFAULT_CONFIG;
    let cfg = normalizeConfig(rawConfig);

    // 2) Load masked secrets
    const secretsRes = await supabase.from(ADMIN_SECRETS_TABLE).select("provider, masked").order("provider");
    if (secretsRes.error) {
      console.error(secretsRes.error);
      // still allow UI with config
      cfg = mergeMaskedSecretsIntoConfig(cfg, []);
    } else {
      cfg = mergeMaskedSecretsIntoConfig(cfg, (secretsRes.data as any[]) || []);
    }

    // clear plaintext secrets in UI on load
    cfg = {
      ...cfg,
      ai: { ...cfg.ai, providerKeys: cfg.ai.providerKeys.map((k) => ({ provider: k.provider, masked: k.masked || "" })) },
    };

    setDraft(cfg);
    setDirtySecrets({});
    setBoot("ready");
    setStatus("Loaded ✅");
  }, [mergeMaskedSecretsIntoConfig]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setStatus("Saving to Supabase...");

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        setStatus("Not logged in");
        window.location.replace("/");
        return;
      }

      const email = (userRes.user.email || "").toLowerCase();

      // 1) Save config (WITHOUT secrets)
      const cleaned = stripSecretsFromConfig(draft);
      const cfgUp = await supabase.from(ADMIN_CONFIG_TABLE).upsert(
        {
          id: ADMIN_CONFIG_ID,
          config: cleaned,
          updated_by: email,
        } as any,
        { onConflict: "id" }
      );

      if (cfgUp.error) throw cfgUp.error;

      // 2) Save secrets (only what changed)
      const secretEntries = Object.entries(dirtySecrets);
      if (secretEntries.length) {
        const upserts = secretEntries.map(([provider, secret]) => ({
          provider,
          secret,
          masked: maskSecret(secret),
          updated_by: email,
        }));

        const secUp = await supabase.from(ADMIN_SECRETS_TABLE).upsert(upserts as any, { onConflict: "provider" });
        if (secUp.error) throw secUp.error;
      }

      setStatus("Saved ✅");
      // reload to reflect DB-masked secrets
      await loadFromSupabase();
    } catch (e: any) {
      console.error(e);
      alert(`Save failed: ${e?.message || "Unknown error"}`);
      setStatus("Save failed ❌");
    } finally {
      setSaving(false);
    }
  }, [draft, dirtySecrets, loadFromSupabase]);

  useEffect(() => {
    void loadFromSupabase();
  }, [loadFromSupabase]);

  if (boot === "loading") return <div className="admin-shell"><div style={{ padding: 24 }}>Loading…</div></div>;
  if (boot === "denied") return null;

  return (
    <div className="admin-shell">
      <AdminHeader onSave={handleSave} onReload={loadFromSupabase} saving={saving} status={status} />
      <StickyTabs active={tab} onChange={setTab} />

      <div className="admin-content">
        {tab === "ai" && <AISettingsTab config={draft} setConfig={setConfig} markSecretDirty={markSecretDirty} />}
        {tab === "pricing" && <PricingTab config={draft} setConfig={setConfig} />}
        {tab === "styles" && <StylesTab config={draft} setConfig={setConfig} />}
        {tab === "generations" && <GenerationsTab config={draft} setConfig={setConfig} />}
        {tab === "clients" && <ClientsTab config={draft} setConfig={setConfig} />}
        {tab === "logs" && <LogsTab config={draft} setConfig={setConfig} />}
        {tab === "architecture" && <ArchitectureTab config={draft} setConfig={setConfig} />}
        {tab === "assets" && <AssetsTab config={draft} setConfig={setConfig} />}
      </div>

      <div className="admin-footer">
        Live config is stored in <code>public.mina_admin_config</code>. Secrets are stored in <code>public.mina_admin_secrets</code>.
      </div>
    </div>
  );
}
