import { useEffect, useState } from "react";

// Base URL of your Mina API (from Render env var VITE_MINA_API_BASE_URL)
const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com";

type HealthResponse = {
  ok: boolean;
  service?: string;
  time?: string;
};

type CreditsResponse = {
  ok: boolean;
  customerId: string;
  balance: number;
  historyLength?: number;
  meta?: {
    imageCost?: number;
    motionCost?: number;
  };
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // --- Call /health once on load ---
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
        setHealthError(null);
      } catch (err: any) {
        setHealth(null);
        setHealthError(err?.message || "Failed to reach Mina API");
      }
    };

    fetchHealth();
  }, []);

  // --- Check credits for a customer ---
  const handleCheckCredits = async () => {
    if (!customerId.trim()) {
      setCreditsError("Enter a Shopify customer ID first.");
      return;
    }

    setLoadingCredits(true);
    setCreditsError(null);

    try {
      const url = `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
        customerId.trim()
      )}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as CreditsResponse;
      setCredits(data);
    } catch (err: any) {
      setCredits(null);
      setCreditsError(err?.message || "Failed to load credits.");
    } finally {
      setLoadingCredits(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #111827, #020617)",
        color: "white",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "2rem 1.5rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "960px" }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1.5rem",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.25rem 0.75rem",
                borderRadius: "999px",
                background:
                  "linear-gradient(90deg, rgba(244,244,245,0.12), rgba(148,163,184,0.08))",
                border: "1px solid rgba(148,163,184,0.3)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "999px",
                  backgroundColor: health?.ok ? "#22c55e" : "#f97316",
                }}
              />
              <span>Mina Editorial AI · Beta</span>
            </div>
            <h1
              style={{
                marginTop: "1rem",
                fontSize: "2.3rem",
                lineHeight: 1.1,
                fontWeight: 600,
              }}
            >
              Mina control room
            </h1>
            <p
              style={{
                marginTop: "0.75rem",
                maxWidth: "32rem",
                color: "#e5e7eb",
                fontSize: "0.95rem",
              }}
            >
              Simple panel to talk to your Mina API, check credits, and verify the backend
              is alive before we build the full studio UI.
            </p>
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "1rem",
              border: "1px solid rgba(148,163,184,0.4)",
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(15,23,42,0.6))",
              fontSize: "0.8rem",
              minWidth: "220px",
            }}
          >
            <div style={{ marginBottom: "0.25rem", color: "#9ca3af" }}>API base URL</div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                wordBreak: "break-all",
              }}
            >
              {API_BASE_URL}
            </div>
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.7rem",
                color: "#9ca3af",
              }}
            >
              Health:{" "}
              {health
                ? health.ok
                  ? "✅ Online"
                  : "⚠️ Responded but ok=false"
                : healthError
                ? "❌ Error"
                : "…"}
            </div>
            {health?.time && (
              <div style={{ marginTop: "0.25rem", fontSize: "0.7rem", color: "#9ca3af" }}>
                Server time:{" "}
                {new Date(health.time).toLocaleString("en-GB", {
                  hour12: false,
                })}
              </div>
            )}
            {healthError && (
              <div
                style={{
                  marginTop: "0.25rem",
                  fontSize: "0.7rem",
                  color: "#fecaca",
                }}
              >
                {healthError}
              </div>
            )}
          </div>
        </header>

        {/* Main grid */}
        <main
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 1.8fr)",
            gap: "1.75rem",
          }}
        >
          {/* Credits checker */}
          <section
            style={{
              padding: "1.5rem",
              borderRadius: "1.5rem",
              border: "1px solid rgba(148,163,184,0.35)",
              background:
                "radial-gradient(circle at top left, rgba(148,163,184,0.16), transparent 55%), rgba(15,23,42,0.9)",
              boxShadow: "0 18px 45px rgba(15,23,42,0.8)",
            }}
          >
            <h2
              style={{
                fontSize: "1.1rem",
                marginBottom: "0.75rem",
                fontWeight: 500,
              }}
            >
              Check a customer’s Mina credits
            </h2>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#9ca3af",
                marginBottom: "1rem",
              }}
            >
              Paste a Shopify <strong>customer.id</strong> and Mina will show how many
              credits they have in the in-memory store on the API.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <input
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="e.g. 8766256447571"
                style={{
                  flex: 1,
                  padding: "0.55rem 0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(148,163,184,0.5)",
                  backgroundColor: "rgba(15,23,42,0.8)",
                  color: "white",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
              <button
                onClick={handleCheckCredits}
                disabled={loadingCredits}
                style={{
                  padding: "0.55rem 0.9rem",
                  borderRadius: "0.9rem",
                  border: "none",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background:
                    "linear-gradient(135deg, #f97316, #fb7185, #a855f7)",
                  color: "white",
                  cursor: "pointer",
                  opacity: loadingCredits ? 0.7 : 1,
                }}
              >
                {loadingCredits ? "Checking…" : "Check credits"}
              </button>
            </div>

            {creditsError && (
              <div
                style={{
                  marginTop: "0.25rem",
                  fontSize: "0.8rem",
                  color: "#fecaca",
                }}
              >
                {creditsError}
              </div>
            )}

            {credits && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.9rem 0.9rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(52,211,153,0.35)",
                  background:
                    "linear-gradient(135deg, rgba(22,163,74,0.12), rgba(8,47,73,0.6))",
                  fontSize: "0.85rem",
                }}
              >
                <div style={{ marginBottom: "0.3rem", color: "#bbf7d0" }}>
                  Customer: <strong>{credits.customerId}</strong>
                </div>
                <div style={{ marginBottom: "0.3rem" }}>
                  Balance:{" "}
                  <strong style={{ color: "#4ade80" }}>{credits.balance}</strong>{" "}
                  Machta credits
                </div>
                {credits.meta && (
                  <div style={{ color: "#d1fae5" }}>
                    <div>
                      Image cost:{" "}
                      <strong>{credits.meta.imageCost ?? "?"}</strong> credits
                    </div>
                    <div>
                      Motion cost:{" "}
                      <strong>{credits.meta.motionCost ?? "?"}</strong> credits
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Right side: roadmap / info */}
          <section
            style={{
              padding: "1.5rem",
              borderRadius: "1.5rem",
              border: "1px solid rgba(148,163,184,0.35)",
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))",
            }}
          >
            <h2
              style={{
                fontSize: "1.05rem",
                marginBottom: "0.75rem",
                fontWeight: 500,
              }}
            >
              What’s wired right now
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                fontSize: "0.85rem",
                color: "#e5e7eb",
              }}
            >
              <li style={{ marginBottom: "0.5rem" }}>
                ✅ <strong>/health</strong> → shows if the Mina API is alive.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                ✅ <strong>/credits/balance</strong> → reads credits from the in-memory
                store (including Shopify Machta top-ups).
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                ✅ Wired to <code>VITE_MINA_API_BASE_URL</code>, so you can point this
                frontend to prod or staging just by changing that env var on Render.
              </li>
            </ul>

            <h3
              style={{
                marginTop: "1.25rem",
                fontSize: "0.95rem",
                marginBottom: "0.5rem",
                color: "#e5e7eb",
              }}
            >
              Next steps for Mina Studio
            </h3>
            <ol
              style={{
                paddingLeft: "1.1rem",
                margin: 0,
                fontSize: "0.8rem",
                color: "#9ca3af",
              }}
            >
              <li style={{ marginBottom: "0.35rem" }}>
                Add login & basic profile (customer sees their sessions + credits).
              </li>
              <li style={{ marginBottom: "0.35rem" }}>
                Build the full editorial generator UI (product image, style, brief,
                Mina Vision toggle).
              </li>
              <li style={{ marginBottom: "0.35rem" }}>
                Add motion step with auto-suggested ASMR motion text from GPT.
              </li>
              <li>
                Separate admin dashboard (tweaking costs, presets, inspecting logs).
              </li>
            </ol>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
