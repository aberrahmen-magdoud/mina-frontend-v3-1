import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  AdminConfig,
  AdminStyleAsset,
  isAdmin,
  maskSecret,
  upsertAdminSecret,
  useAdminConfigState,
} from "./lib/adminConfig";
import "./admin.css";

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

function AdminHeader({ onSave }: { onSave: () => Promise<void> }) {
  return (
    <header className="admin-header">
      <div>
        <div className="admin-title">Mina Admin</div>
        <div className="admin-subtitle">Editorial dashboard (Supabase live config)</div>
      </div>
      <div className="admin-actions">
        <button className="admin-button" onClick={() => void onSave()}>
          Save
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

function useAdminGuard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email?.toLowerCase() || "";

        if (!email) {
          // Not logged in → send to Profile (adjust if your login route is different)
          window.location.replace("/profile");
          return;
        }

        const ok = await isAdmin();
        if (!mounted) return;

        setAllowed(ok);
        if (!ok) window.location.replace("/");
      } catch {
        if (mounted) setAllowed(false);
        window.location.replace("/");
      }
    };

    void check();
    return () => {
      mounted = false;
    };
  }, []);

  return allowed;
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
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => onChange(params.filter((_, i) => i !== idx))}
          >
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

function AISettingsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const ai = config.ai;

  return (
    <div className="admin-grid">
      <Section title="Providers" description="Keys are stored in Supabase (mina_admin_secrets).">
        <Table headers={["Provider", "Model", "Key", "Actions"]}>
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

              <div className="admin-masked">{row.masked ? row.masked : <span className="admin-muted">not set</span>}</div>

              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={() => {
                    const next = [...ai.providerKeys];
                    next.splice(idx, 1);
                    setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                  }}
                >
                  Remove
                </button>

                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={async () => {
                    const replacement = window.prompt(`Paste new secret for "${row.provider}" (stored in Supabase)`);
                    if (replacement === null) return;

                    try {
                      const masked = await upsertAdminSecret(row.provider, replacement);

                      const next = [...ai.providerKeys];
                      next[idx] = { ...row, masked, secret: undefined };
                      setConfig({ ...config, ai: { ...ai, providerKeys: next } });

                      alert(`Saved secret for ${row.provider}: ${masked}`);
                    } catch (e: any) {
                      alert(e?.message ?? "Failed to save secret");
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
            <input
              value={ai.defaultProvider}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultProvider: e.target.value } })}
            />
          </label>
          <label>
            <strong>Default model</strong>
            <input
              value={ai.defaultModel}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })}
            />
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
        <textarea
          className="admin-textarea"
          value={ai.context}
          onChange={(e) => setConfig({ ...config, ai: { ...ai, context: e.target.value } })}
        />
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

/* --- the rest of your tabs are unchanged (pricing/styles/generations/clients/logs/architecture/assets) --- */
/* Paste your existing implementations below this line without changes */
function PricingTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
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
            <input
              type="number"
              value={pricing.imageCost}
              onChange={(e) => setConfig({ ...config, pricing: { ...pricing, imageCost: Number(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>Motion cost (Matchas)</strong>
            <input
              type="number"
              value={pricing.motionCost}
              onChange={(e) => setConfig({ ...config, pricing: { ...pricing, motionCost: Number(e.target.value) || 0 } })}
            />
          </label>
        </div>
      </Section>
    </div>
  );
}

/* Keep your existing StylesTab/GenerationsTab/ClientsTab/LogsTab/ArchitectureTab/AssetsTab exactly as-is */
function StylesTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
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
                <textarea
                  className="admin-textarea"
                  value={preset.trainingText}
                  onChange={(e) => updatePreset(idx, { ...preset, trainingText: e.target.value })}
                />
              </div>
              <div className="admin-thumb-col">
                {preset.heroImage ? <img src={preset.heroImage} alt="hero" /> : <span>—</span>}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files, (url) => updatePreset(idx, { ...preset, heroImage: url }))}
                />
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
                <select
                  value={preset.status}
                  onChange={(e) => updatePreset(idx, { ...preset, status: e.target.value as AdminStyleAsset["status"] })}
                >
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
                  styles: {
                    ...styles,
                    movementKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
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
              <select
                value={draftStyle.status}
                onChange={(e) => setDraftStyle({ ...draftStyle, status: e.target.value as AdminStyleAsset["status"] })}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>

          <label>
            <strong>Training text</strong>
            <textarea
              className="admin-textarea"
              value={draftStyle.trainingText}
              onChange={(e) => setDraftStyle({ ...draftStyle, trainingText: e.target.value })}
            />
          </label>

          <div className="admin-inline">
            <div>
              <strong>Hero image</strong>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, heroImage: url }))}
              />
            </div>
            <div>
              <strong>Gallery</strong>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  handleUpload(e.target.files, (url) =>
                    setDraftStyle({ ...draftStyle, images: [...draftStyle.images, url].slice(-10) })
                  )
                }
              />
            </div>
          </div>

          <button
            className="admin-button"
            type="button"
            onClick={() => {
              setConfig({
                ...config,
                styles: { ...styles, presets: [draftStyle, ...styles.presets].slice(0, 20) },
              });
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

/* Keep your existing GenerationsTab/ClientsTab/LogsTab/ArchitectureTab/AssetsTab from your current file */
function GenerationsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
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
  const [selected, setSelected] = useState<typeof records[0] | null>(null);

  useEffect(() => {
    if (selected && !filtered.includes(selected)) setSelected(null);
  }, [filtered, selected]);

  return (
    <div className="admin-grid admin-split">
      <Section title="Generations" description="7-column grid with detail panel">
        <div className="admin-inline">
          <input
            placeholder="Search prompt/user"
            value={filters.query}
            onChange={(e) =>
              setConfig({
                ...config,
                generations: { ...config.generations, filters: { ...filters, query: e.target.value } },
              })
            }
          />
          <input
            placeholder="Model"
            value={filters.model}
            onChange={(e) =>
              setConfig({
                ...config,
                generations: { ...config.generations, filters: { ...filters, model: e.target.value } },
              })
            }
          />
          <input
            placeholder="Status"
            value={filters.status}
            onChange={(e) =>
              setConfig({
                ...config,
                generations: { ...config.generations, filters: { ...filters, status: e.target.value } },
              })
            }
          />
          <button
            className="admin-button ghost"
            type="button"
            onClick={() =>
              setConfig({
                ...config,
                generations: { ...config.generations, filters: { status: "", model: "", query: "" } },
              })
            }
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

function ClientsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const clients = config.clients;
  return (
    <div className="admin-grid">
      <Section title="Clients" description="Edit credits and disable accounts">
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
      </Section>
    </div>
  );
}

function LogsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    const id = window.setInterval(() => {
      setConfig({
        ...config,
        logs: [
          ...config.logs.slice(-200),
          {
            id: String(Date.now()),
            level: "info" as const,
            message: "Heartbeat",
            at: new Date().toISOString(),
            source: "client-poll",
          },
        ],
      });
    }, 6000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-grid">
      <Section title="Realtime-ish logs" description="This tab is still local/polling.">
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

function ArchitectureTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  return (
    <div className="admin-grid">
      <Section title="Architecture map" description="Editable description of the pipeline">
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

function AssetsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
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
      <Section title="Brand assets" description="Colors, fonts, logo and misc images">
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
            <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => setConfig({ ...config, assets: { ...assets, logo: url } }))} />
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
  const allowed = useAdminGuard();
  const { config, updateConfig, loading, error } = useAdminConfigState();
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<TabKey>("ai");

  useEffect(() => {
    if (!loading) setDraft(config);
  }, [loading, config]);

  if (allowed === null || loading || !draft) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  const setConfig = (next: AdminConfig) => setDraft(next);

  const handleSave = async () => {
    try {
      await updateConfig(draft);
      alert("Saved ✅");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  };

  return (
    <div className="admin-shell">
      <AdminHeader onSave={handleSave} />
      <StickyTabs active={tab} onChange={setTab} />

      {error && <div style={{ padding: 12, color: "crimson" }}>{error}</div>}

      <div className="admin-content">
        {tab === "ai" && <AISettingsTab config={draft} setConfig={setConfig} />}
        {tab === "pricing" && <PricingTab config={draft} setConfig={setConfig} />}
        {tab === "styles" && <StylesTab config={draft} setConfig={setConfig} />}
        {tab === "generations" && <GenerationsTab config={draft} setConfig={setConfig} />}
        {tab === "clients" && <ClientsTab config={draft} setConfig={setConfig} />}
        {tab === "logs" && <LogsTab config={draft} setConfig={setConfig} />}
        {tab === "architecture" && <ArchitectureTab config={draft} setConfig={setConfig} />}
        {tab === "assets" && <AssetsTab config={draft} setConfig={setConfig} />}
      </div>

      <div className="admin-footer">Saved in Supabase: mina_admin_config + mina_admin_secrets</div>
    </div>
  );
}
