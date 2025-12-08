import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  (import.meta.env.VITE_MINA_API_BASE_URL as string | undefined) ?? "";

// ------------- Types -------------

type View = "login" | "studio" | "profile" | "control";

type MinaUser = {
  customerId: string;
  email?: string;
  name?: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;
};

type CreditsState = {
  balance: number;
  meta: CreditsMeta;
  loading: boolean;
  error: string | null;
};

type GenerationKind = "image" | "motion";

type Generation = {
  id: string;
  kind: GenerationKind;
  imageUrl?: string | null;
  videoUrl?: string | null;
  prompt: string;
  createdAt: string;
};

// ------------- Storage helpers -------------

const STORAGE_USER_KEY = "mina:user";

function loadUserFromStorage(): MinaUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MinaUser;
  } catch {
    return null;
  }
}

function saveUserToStorage(user: MinaUser | null) {
  try {
    if (!user) {
      window.localStorage.removeItem(STORAGE_USER_KEY);
    } else {
      window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore
  }
}

// ------------- Main App -------------

const App: React.FC = () => {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [apiServerTime, setApiServerTime] = useState<string | null>(null);

  const [user, setUser] = useState<MinaUser | null>(() => {
    if (typeof window === "undefined") return null;
    return loadUserFromStorage();
  });

  const [view, setView] = useState<View>(() =>
    typeof window === "undefined" ? "login" : loadUserFromStorage() ? "studio" : "login"
  );

  const [credits, setCredits] = useState<CreditsState>({
    balance: 0,
    meta: { imageCost: 1, motionCost: 5 },
    loading: false,
    error: null,
  });

  const [generations, setGenerations] = useState<Generation[]>([]);

  // ---- Health check on mount ----
  useEffect(() => {
    if (!API_BASE_URL) {
      setApiOnline(false);
      return;
    }

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        const data = await res.json();
        setApiOnline(res.ok && data.ok === true);
        if (data.time) setApiServerTime(data.time);
      } catch {
        setApiOnline(false);
      }
    };
    check();
  }, []);

  // ---- Credits ----
  const refreshCredits = async (customerId?: string) => {
    if (!API_BASE_URL || !customerId) return;

    setCredits((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          customerId
        )}`
      );
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Failed to load credits");
      }

      const meta: CreditsMeta = {
        imageCost: Number(data.meta?.imageCost ?? 1),
        motionCost: Number(data.meta?.motionCost ?? 5),
      };

      setCredits({
        balance: Number(data.balance ?? 0),
        meta,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setCredits((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Error loading credits",
      }));
    }
  };

  // Refresh credits whenever we have a user
  useEffect(() => {
    if (user?.customerId) {
      refreshCredits(user.customerId);
    }
  }, [user?.customerId]);

  // ---- User login / logout ----
  const handleLogin = (u: MinaUser, balanceOverride?: number) => {
    setUser(u);
    saveUserToStorage(u);
    if (typeof balanceOverride === "number") {
      setCredits((prev) => ({ ...prev, balance: balanceOverride }));
    } else {
      refreshCredits(u.customerId);
    }
    setView("studio");
  };

  const handleLogout = () => {
    setUser(null);
    saveUserToStorage(null);
    setView("login");
    setGenerations([]);
  };

  const handleAddGeneration = (gen: Generation) => {
    setGenerations((prev) => [gen, ...prev]);
  };

  const lastImageGeneration = useMemo(
    () =>
      generations.find((g) => g.kind === "image" && g.imageUrl) ||
      null,
    [generations]
  );

  // ---- Render ----

  return (
    <div className="mina-app-root">
      {/* Top bar */}
      <header className="mina-header">
        <div className="mina-header-left">
          <div className="mina-logo-dot" />
          <div>
            <div className="mina-heading">Mina Editorial AI</div>
            <div className="mina-subheading">Falta Studio · Beta</div>
          </div>
        </div>

        <div className="mina-header-center">
          <nav className="mina-nav">
            {user ? (
              <>
                <button
                  className={view === "studio" ? "nav-item active" : "nav-item"}
                  onClick={() => setView("studio")}
                >
                  Studio
                </button>
                <button
                  className={view === "profile" ? "nav-item active" : "nav-item"}
                  onClick={() => setView("profile")}
                >
                  Profile
                </button>
                <button
                  className={view === "control" ? "nav-item active" : "nav-item"}
                  onClick={() => setView("control")}
                >
                  Control room
                </button>
              </>
            ) : (
              <button
                className={view === "login" ? "nav-item active" : "nav-item"}
                onClick={() => setView("login")}
              >
                Login
              </button>
            )}
          </nav>
        </div>

        <div className="mina-header-right">
          <ApiStatusBadge online={apiOnline} time={apiServerTime} />
          {user && (
            <>
              <CreditsBadge credits={credits} />
              <button className="nav-item subtle" onClick={handleLogout}>
                Log out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      {!user && view !== "control" && (
        <LoginView
          online={apiOnline}
          onLogin={handleLogin}
          credits={credits}
        />
      )}

      {user && view === "studio" && (
        <StudioView
          user={user}
          credits={credits}
          onRefreshCredits={() => refreshCredits(user.customerId)}
          onAddGeneration={handleAddGeneration}
          lastImage={lastImageGeneration}
        />
      )}

      {user && view === "profile" && (
        <ProfileView user={user} generations={generations} />
      )}

      {view === "control" && (
        <ControlRoom
          apiBaseUrl={API_BASE_URL}
          healthOnline={apiOnline}
          healthTime={apiServerTime}
        />
      )}

      {!user && view === "control" && (
        <div className="mina-control-hint">
          Tip: control room is mostly for you (admin) to debug API + credits.
        </div>
      )}
    </div>
  );
};

export default App;

// ------------- Small components -------------

const ApiStatusBadge: React.FC<{
  online: boolean | null;
  time: string | null;
}> = ({ online, time }) => {
  const label =
    online === null ? "Checking…" : online ? "Online" : "Offline";

  return (
    <div className="pill pill-outline">
      <span
        className={`status-dot ${online ? "ok" : online === null ? "idle" : "bad"}`}
      />
      <span>API: {label}</span>
      {online && time && <span className="pill-meta">{time}</span>}
    </div>
  );
};

const CreditsBadge: React.FC<{ credits: CreditsState }> = ({ credits }) => {
  return (
    <div className="pill pill-solid">
      <span className="pill-title">Credits</span>
      {credits.loading ? (
        <span>…</span>
      ) : (
        <span>{credits.balance}</span>
      )}
      <span className="pill-meta">
        img {credits.meta.imageCost} · motion {credits.meta.motionCost}
      </span>
    </div>
  );
};

// ------------- Login view -------------

type LoginProps = {
  online: boolean | null;
  onLogin: (user: MinaUser, balanceOverride?: number) => void;
  credits: CreditsState;
};

const LoginView: React.FC<LoginProps> = ({ online, onLogin, credits }) => {
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim()) {
      setError("Paste your Shopify customer.id");
      return;
    }
    if (!API_BASE_URL) {
      setError("Missing VITE_MINA_API_BASE_URL in frontend.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          customerId.trim()
        )}`
      );
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(
          data.message || "Could not check credits for this customer."
        );
      }
      const balance = Number(data.balance ?? 0);
      const user: MinaUser = {
        customerId: customerId.trim(),
        email: email.trim() || undefined,
        name: name.trim() || undefined,
      };
      onLogin(user, balance);
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mina-main login-main">
      <section className="mina-login-card">
        <h1 className="title-lg">Welcome to Mina studio</h1>
        <p className="body-sm">
          Paste your <strong>Shopify customer.id</strong> to connect your
          Machta credits. For now this is a lightweight login just for you.
        </p>

        <form onSubmit={handleSubmit} className="field-stack">
          <label className="field-label">
            Shopify customer.id
            <input
              className="field-input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="e.g. 8766256447571"
            />
          </label>

          <label className="field-label">
            Email (optional)
            <input
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Used for later profile."
            />
          </label>

          <label className="field-label">
            Name (optional)
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How Mina should call you."
            />
          </label>

          {error && <div className="error-text">{error}</div>}

          <button
            type="submit"
            className="text-button primary"
            disabled={loading || !customerId.trim()}
          >
            {loading ? "Checking credits…" : "Enter Mina studio"}
          </button>
        </form>

        <div className="login-meta">
          <div>
            API status:{" "}
            {online === null
              ? "Checking…"
              : online
              ? "Online"
              : "Offline – check backend"}
          </div>
          <div>
            Current img cost: {credits.meta.imageCost} · motion cost:{" "}
            {credits.meta.motionCost}
          </div>
        </div>
      </section>
    </main>
  );
};

// ------------- Studio view (50/50 layout) -------------

type StudioProps = {
  user: MinaUser;
  credits: CreditsState;
  onRefreshCredits: () => void;
  onAddGeneration: (gen: Generation) => void;
  lastImage: Generation | null;
};

const StudioView: React.FC<StudioProps> = ({
  user,
  credits,
  onRefreshCredits,
  onAddGeneration,
  lastImage,
}) => {
  const [mode, setMode] = useState<"still" | "motion">("still");

  // Still
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleRefs, setStyleRefs] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "instagram" | "youtube">(
    "tiktok"
  );
  const [minaVision, setMinaVision] = useState(true);
  const [stillLoading, setStillLoading] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [stillUrl, setStillUrl] = useState<string | null>(null);

  // Motion
  const [motionText, setMotionText] = useState("");
  const [motionLoading, setMotionLoading] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [motionUrl, setMotionUrl] = useState<string | null>(null);

  const styleImageUrls = useMemo(
    () =>
      styleRefs
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [styleRefs]
  );

  const handleGenerateStill = async () => {
    if (!API_BASE_URL) return;
    if (!brief && !productImageUrl) {
      setStillError("Give Mina at least a product image or a short brief.");
      return;
    }
    setStillError(null);
    setStillLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: user.customerId,
          productImageUrl: productImageUrl || undefined,
          styleImageUrls,
          brief,
          tone,
          platform,
          minaVisionEnabled: minaVision,
          stylePresetKey: null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Generation failed");
      }

      const url: string | null = data.imageUrl || null;
      setStillUrl(url);

      const gen: Generation = {
        id: data.generationId || `gen_${Date.now()}`,
        kind: "image",
        imageUrl: url,
        videoUrl: null,
        prompt: data.prompt || brief || "",
        createdAt: new Date().toISOString(),
      };
      onAddGeneration(gen);
      onRefreshCredits();
    } catch (err: any) {
      setStillError(err?.message || "Error generating still");
    } finally {
      setStillLoading(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (!API_BASE_URL) return;
    const reference = lastImage?.imageUrl || stillUrl;
    if (!reference) {
      setMotionError("Mina needs a still image first.");
      return;
    }
    if (!motionText.trim()) {
      setMotionError("Describe the motion or use the suggest button (later).");
      return;
    }

    setMotionError(null);
    setMotionLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: user.customerId,
          lastImageUrl: reference,
          motionDescription: motionText,
          tone,
          platform,
          minaVisionEnabled: minaVision,
          stylePresetKey: null,
          durationSeconds: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Motion generation failed");
      }

      const url: string | null = data.videoUrl || null;
      setMotionUrl(url);

      const gen: Generation = {
        id: data.generationId || `motion_${Date.now()}`,
        kind: "motion",
        imageUrl: reference,
        videoUrl: url,
        prompt: data.prompt || motionText,
        createdAt: new Date().toISOString(),
      };
      onAddGeneration(gen);
      onRefreshCredits();
    } catch (err: any) {
      setMotionError(err?.message || "Error generating motion");
    } finally {
      setMotionLoading(false);
    }
  };

  const rightBgClass = mode === "still" ? "mina-right still" : "mina-right motion";

  return (
    <main className="mina-main studio-main">
      <div className="studio-shell">
        {/* LEFT – controls */}
        <section className="mina-left">
          <div className="left-inner">
            <div className="mode-tabs">
              <button
                className={mode === "still" ? "tab active" : "tab"}
                onClick={() => setMode("still")}
              >
                Still
              </button>
              <button
                className={mode === "motion" ? "tab active" : "tab"}
                onClick={() => setMode("motion")}
              >
                Motion
              </button>
            </div>

            <div className="user-line">
              <span className="body-xs">
                Signed in as{" "}
                <strong>{user.name || user.email || user.customerId}</strong>
              </span>
            </div>

            {mode === "still" && (
              <>
                <h2 className="title-md">Editorial still</h2>
                <p className="body-sm">
                  Product image, 1–3 references, a short brief. Mina takes care
                  of the composition.
                </p>

                <div className="field-stack">
                  <label className="field-label">
                    Product image URL
                    <input
                      className="field-input subtle"
                      value={productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                      placeholder="https://… (drag & drop later)"
                    />
                  </label>

                  <label className="field-label">
                    Reference image URLs (one per line or comma)
                    <textarea
                      className="field-input subtle textarea"
                      value={styleRefs}
                      onChange={(e) => setStyleRefs(e.target.value)}
                      placeholder="Mood, surface, light…"
                      rows={3}
                    />
                  </label>

                  <label className="field-label">
                    Brief
                    <textarea
                      className="field-input textarea"
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="Soft desert ritual, warm light, minimal props…"
                      rows={3}
                    />
                  </label>

                  <div className="inline-fields">
                    <label className="field-label narrow">
                      Tone
                      <input
                        className="field-input subtle"
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        placeholder="Calm, sensual, clinical…"
                      />
                    </label>

                    <label className="field-label narrow">
                      Format
                      <select
                        className="field-input subtle"
                        value={platform}
                        onChange={(e) =>
                          setPlatform(e.target.value as typeof platform)
                        }
                      >
                        <option value="tiktok">TikTok / Reels 9:16</option>
                        <option value="instagram">Instagram 4:5</option>
                        <option value="youtube">YouTube 16:9</option>
                      </select>
                    </label>
                  </div>

                  <label className="toggle-line">
                    <input
                      type="checkbox"
                      checked={minaVision}
                      onChange={(e) => setMinaVision(e.target.checked)}
                    />
                    <span className={minaVision ? "toggle-label on" : "toggle-label off"}>
                      Mina Vision intelligence
                    </span>
                  </label>

                  {stillError && <div className="error-text">{stillError}</div>}

                  <button
                    type="button"
                    className="text-button primary"
                    disabled={stillLoading}
                    onClick={handleGenerateStill}
                  >
                    {stillLoading ? "Creating still…" : "Create still"}
                  </button>
                </div>
              </>
            )}

            {mode === "motion" && (
              <>
                <h2 className="title-md">Motion from still</h2>
                <p className="body-sm">
                  Mina reads your last still and turns it into a short ASMR loop.
                </p>

                <div className="motion-ref">
                  <span className="body-xs">Reference still</span>
                  {lastImage?.imageUrl || stillUrl ? (
                    <img
                      src={lastImage?.imageUrl || stillUrl || ""}
                      alt="Reference"
                      className="motion-ref-thumb"
                    />
                  ) : (
                    <span className="body-xs dim">
                      No still yet – generate one first.
                    </span>
                  )}
                </div>

                <div className="field-stack">
                  <label className="field-label">
                    Motion idea
                    <textarea
                      className="field-input textarea"
                      value={motionText}
                      onChange={(e) => setMotionText(e.target.value)}
                      placeholder="Slow camera drift, soft steam breathing around the product…"
                      rows={3}
                    />
                  </label>

                  {motionError && <div className="error-text">{motionError}</div>}

                  <button
                    type="button"
                    className="text-button primary"
                    disabled={motionLoading}
                    onClick={handleGenerateMotion}
                  >
                    {motionLoading ? "Animating…" : "Create motion"}
                  </button>
                </div>
              </>
            )}

            <div className="credits-note body-xs">
              Balance: {credits.balance} Machta credits · img{" "}
              {credits.meta.imageCost}, motion {credits.meta.motionCost}.
            </div>
          </div>
        </section>

        {/* RIGHT – output */}
        <section className={rightBgClass}>
          <div className="right-inner">
            {mode === "still" ? (
              <>
                <div className="right-label body-xs">Latest still</div>
                {stillUrl ? (
                  <div className="still-frame">
                    <img src={stillUrl} alt="Mina still" className="still-img" />
                  </div>
                ) : (
                  <div className="empty-state body-sm">
                    When you create a still, it will appear here in a full-bleed
                    editorial frame.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="right-label body-xs">Latest motion</div>
                {motionUrl ? (
                  <div className="still-frame">
                    <video
                      src={motionUrl}
                      className="still-img"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  </div>
                ) : (
                  <div className="empty-state body-sm">
                    Once Mina animates your still, the video will play here.
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

// ------------- Profile view (grid) -------------

type ProfileProps = {
  user: MinaUser;
  generations: Generation[];
};

const ProfileView: React.FC<ProfileProps> = ({ user, generations }) => {
  return (
    <main className="mina-main profile-main">
      <section className="profile-header">
        <h1 className="title-md">
          {user.name ? `${user.name}'s profile` : "Your profile"}
        </h1>
        <p className="body-sm">
          Simple history of this browser session. Later we’ll plug this into a
          real DB + Mina Vision log.
        </p>
      </section>

      <section className="profile-grid">
        {generations.length === 0 && (
          <div className="body-sm dim">
            No generations yet in this session. Create a still or motion in the
            Studio first.
          </div>
        )}

        {generations.map((g) => (
          <article key={g.id} className="profile-tile">
            <div className="tile-media">
              {g.kind === "motion" && g.videoUrl ? (
                <video
                  src={g.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="tile-media-el"
                />
              ) : g.imageUrl ? (
                <img
                  src={g.imageUrl}
                  alt={g.kind}
                  className="tile-media-el"
                />
              ) : (
                <div className="tile-placeholder body-xs dim">
                  Missing media
                </div>
              )}
            </div>
            <div className="tile-meta body-xs">
              <span>{g.kind === "motion" ? "Motion" : "Still"}</span>
              <span className="tile-date">
                {new Date(g.createdAt).toLocaleString()}
              </span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
};

// ------------- Control room (existing idea) -------------

type ControlProps = {
  apiBaseUrl: string;
  healthOnline: boolean | null;
  healthTime: string | null;
};

const ControlRoom: React.FC<ControlProps> = ({
  apiBaseUrl,
  healthOnline,
  healthTime,
}) => {
  const [customerId, setCustomerId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!apiBaseUrl || !customerId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/credits/balance?customerId=${encodeURIComponent(
          customerId.trim()
        )}`
      );
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResult(err?.message || "Error checking credits");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mina-main control-main">
      <section className="control-card">
        <h1 className="title-md">Mina control room</h1>
        <p className="body-sm">
          Quick way to talk to your Mina API before we ship the full admin
          dashboard.
        </p>

        <div className="control-row">
          <div className="body-xs dim">API base URL</div>
          <div className="body-xs mono">{apiBaseUrl || "not set"}</div>
        </div>

        <div className="control-row">
          <div className="body-xs dim">Health</div>
          <div className="body-xs">
            {healthOnline === null
              ? "checking…"
              : healthOnline
              ? `✅ online (${healthTime || "no time"})`
              : "❌ offline"}
          </div>
        </div>

        <div className="control-divider" />

        <label className="field-label">
          Check credits for customer.id
          <input
            className="field-input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Paste Shopify customer.id"
          />
        </label>

        <button
          className="text-button primary"
          onClick={handleCheck}
          disabled={loading || !customerId.trim()}
        >
          {loading ? "Checking…" : "Check credits"}
        </button>

        {result && (
          <pre className="control-output body-xs mono">{result}</pre>
        )}
      </section>

      <section className="control-notes body-xs">
        <h2 className="body-sm">What’s wired now</h2>
        <ul>
          <li>Health endpoint</li>
          <li>Credits balance</li>
          <li>
            Frontend points to API via{" "}
            <code>VITE_MINA_API_BASE_URL</code>.
          </li>
        </ul>
      </section>
    </main>
  );
};
