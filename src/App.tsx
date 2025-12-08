import React, { useEffect, useState } from "react";

// ---------------------------
// Types
// ---------------------------

type HealthPayload = {
ok: boolean;
service: string;
time: string;
};

type CreditsBalancePayload = {
ok: boolean;
requestId?: string;
customerId: string;
balance: number;
historyLength?: number;
meta?: {
imageCost?: number;
motionCost?: number;
};
};

// ---------------------------
// Config
// ---------------------------

// This should match the env var on Render
// (Settings → Environment → VITE_MINA_API_BASE_URL)
const API_BASE_URL =
import.meta.env.VITE_MINA_API_BASE_URL ||
"[https://mina-editorial-ai-api.onrender.com](https://mina-editorial-ai-api.onrender.com)";

// ---------------------------
// App component
// ---------------------------

const App: React.FC = () => {
const [checkingHealth, setCheckingHealth] = useState(false);
const [healthError, setHealthError] = useState<string | null>(null);
const [health, setHealth] = useState<HealthPayload | null>(null);

const [customerIdInput, setCustomerIdInput] = useState("");
const [checkingCredits, setCheckingCredits] = useState(false);
const [creditsError, setCreditsError] = useState<string | null>(null);
const [credits, setCredits] = useState<CreditsBalancePayload | null>(null);

// -------------------------
// Helpers
// -------------------------

async function handleCheckHealth() {
try {
setCheckingHealth(true);
setHealthError(null);

```
  const res = await fetch(API_BASE_URL + "/health");
  if (!res.ok) {
    throw new Error("Health endpoint returned " + res.status);
  }

  const data = (await res.json()) as HealthPayload;
  setHealth(data);
} catch (err: any) {
  setHealthError(err?.message || "Unexpected error");
  setHealth(null);
} finally {
  setCheckingHealth(false);
}
```

}

async function handleCheckCredits() {
const trimmedId = customerIdInput.trim();
if (!trimmedId) {
setCreditsError("Paste a Shopify customer.id first.");
setCredits(null);
return;
}

```
try {
  setCheckingCredits(true);
  setCreditsError(null);

  const url =
    API_BASE_URL +
    "/credits/balance?customerId=" +
    encodeURIComponent(trimmedId);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Credits endpoint returned " + res.status);
  }

  const data = (await res.json()) as CreditsBalancePayload;
  if (!data.ok) {
    throw new Error(
      data as unknown as string || "API replied with ok = false"
    );
  }

  setCredits(data);
} catch (err: any) {
  setCreditsError(err?.message || "Unexpected error");
  setCredits(null);
} finally {
  setCheckingCredits(false);
}
```

}

// Ping backend automatically on first load
useEffect(() => {
handleCheckHealth();
}, []);

// -------------------------
// Render
// -------------------------

return (
<div
style={{
minHeight: "100vh",
background: "radial-gradient(circle at top, #0f172a 0%, #020617 55%)",
color: "#e5e7eb",
fontFamily:
"-apple-system, BlinkMacSystemFont, system-ui, -system-ui, sans-serif",
padding: "32px 24px",
}}
>
{/* Top bar */}
<header
style={{
display: "flex",
alignItems: "center",
justifyContent: "space-between",
marginBottom: 32,
}}
>
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
<span
style={{
width: 9,
height: 9,
borderRadius: "999px",
backgroundColor: "#22c55e",
boxShadow: "0 0 10px rgba(34,197,94,0.7)",
}}
/>
<span
style={{
fontSize: 15,
letterSpacing: 0.08,
textTransform: "uppercase",
color: "#e5e7eb",
}}
>
Mina Editorial AI · Beta </span> </div>

```
    <div
      style={{
        fontSize: 13,
        opacity: 0.8,
      }}
    >
      API base URL:&nbsp;
      <code style={{ opacity: 0.9 }}>{API_BASE_URL}</code>
    </div>
  </header>

  {/* Layout: left (credits) / right (info) */}
  <main
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
      gap: 28,
      maxWidth: 1100,
      margin: "0 auto",
    }}
  >
    {/* Left card */}
    <section
      style={{
        borderRadius: 24,
        border: "1px solid rgba(148,163,184,0.3)",
        background:
          "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(15,23,42,0.6))",
        boxShadow:
          "0 18px 60px rgba(15,23,42,0.85), 0 0 0 1px rgba(148,163,184,0.15)",
        padding: 28,
      }}
    >
      <h1
        style={{
          fontSize: 24,
          letterSpacing: 0.08,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Mina control room
      </h1>
      <p
        style={{
          fontSize: 14,
          opacity: 0.7,
          marginBottom: 24,
          maxWidth: 520,
        }}
      >
        Simple panel to talk to your Mina API, check credits, and verify the
        backend is alive before we build the full studio UI.
      </p>

      {/* Health status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 999,
          backgroundColor: "rgba(15,23,42,0.9)",
          border: "1px solid rgba(148,163,184,0.35)",
          marginBottom: 22,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "999px",
            backgroundColor: healthError ? "#f97373" : "#22c55e",
            boxShadow: healthError
              ? "0 0 10px rgba(248,113,113,0.9)"
              : "0 0 10px rgba(34,197,94,0.9)",
          }}
        />
        <span style={{ opacity: 0.85 }}>
          API:&nbsp;
          {checkingHealth
            ? "Checking…"
            : healthError
            ? "Error (see message below)."
            : health?.ok
            ? "Online"
            : "Offline"}
        </span>
        {health?.time && (
          <span style={{ opacity: 0.6 }}>
            • Server time:&nbsp;
            {new Date(health.time).toLocaleString()}
          </span>
        )}
        <button
          onClick={handleCheckHealth}
          style={{
            marginLeft: "auto",
            fontSize: 13,
            border: "none",
            background: "transparent",
            color: "#a5b4fc",
            cursor: "pointer",
          }}
        >
          Re-check
        </button>
      </div>

      {healthError && (
        <div
          style={{
            marginBottom: 20,
            fontSize: 12,
            color: "#fecaca",
          }}
        >
          Health error: {healthError}
        </div>
      )}

      {/* Credits checker */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 14,
          borderTop: "1px solid rgba(148,163,184,0.4)",
        }}
      >
        <h2
          style={{
            fontSize: 16,
            marginBottom: 6,
          }}
        >
          Check a customer’s Mina credits
        </h2>
        <p
          style={{
            fontSize: 13,
            opacity: 0.75,
            marginBottom: 16,
          }}
        >
          Paste a Shopify <code>customer.id</code> and Mina will show how
          many credits they have in the in-memory store on the API.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <input
            value={customerIdInput}
            onChange={(e) => setCustomerIdInput(e.target.value)}
            placeholder="8766256447571"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.5)",
              backgroundColor: "rgba(15,23,42,0.9)",
              color: "#e5e7eb",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={handleCheckCredits}
            disabled={checkingCredits}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              background:
                "linear-gradient(135deg, #4f46e5, #a855f7)",
              color: "#e5e7eb",
              opacity: checkingCredits ? 0.7 : 1,
            }}
          >
            {checkingCredits ? "Checking…" : "Check credits"}
          </button>
        </div>

        {creditsError && (
          <div
            style={{
              fontSize: 12,
              color: "#fecaca",
              marginBottom: 8,
            }}
          >
            {creditsError}
          </div>
        )}

        {credits && (
          <div
            style={{
              marginTop: 10,
              padding: 14,
              borderRadius: 18,
              background:
                "radial-gradient(circle at top, rgba(34,197,94,0.12), rgba(15,23,42,0.95))",
              border: "1px solid rgba(34,197,94,0.45)",
              fontSize: 13,
            }}
          >
            <div style={{ marginBottom: 4 }}>
              Customer:{" "}
              <span style={{ fontWeight: 600 }}>{credits.customerId}</span>
            </div>
            <div>
              Balance:{" "}
              <span style={{ fontWeight: 600 }}>
                {credits.balance ?? 0}
              </span>{" "}
              Machta credits
            </div>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Image cost: {credits.meta?.imageCost ?? 1} credits · Motion
              cost: {credits.meta?.motionCost ?? 5} credits
            </div>
          </div>
        )}
      </div>
    </section>

    {/* Right column: info + roadmap */}
    <section
      style={{
        borderRadius: 24,
        border: "1px solid rgba(148,163,184,0.35)",
        background:
          "radial-gradient(circle at top left, rgba(56,189,248,0.12), rgba(15,23,42,0.96))",
        padding: 24,
        boxShadow: "0 22px 70px rgba(15,23,42,0.95)",
        fontSize: 13,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          marginBottom: 12,
        }}
      >
        What’s wired right now
      </h2>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 20px 0",
          display: "grid",
          gap: 8,
        }}
      >
        <li>✅ /health → shows if the Mina API is alive.</li>
        <li>
          ✅ /credits/balance → reads credits from the in-memory store
          (including Shopify Machta top-ups).
        </li>
        <li>
          ✅ Frontend reads{" "}
          <code style={{ opacity: 0.85 }}>VITE_MINA_API_BASE_URL</code>{" "}
          from Render env, so you can point it to prod or staging just by
          changing that value.
        </li>
      </ul>

      <h3
        style={{
          fontSize: 14,
          marginBottom: 10,
        }}
      >
        Next steps for Mina Studio
      </h3>
      <ol
        style={{
          paddingLeft: 18,
          margin: 0,
          display: "grid",
          gap: 6,
          opacity: 0.9,
        }}
      >
        <li>
          Login + basic profile (customer sees their sessions plus credits).
        </li>
        <li>
          Full editorial generator UI (product image, style, brief, Mina
          Vision toggle).
        </li>
        <li>
          Motion step with auto-suggested ASMR motion text from GPT.
        </li>
        <li>Separate admin dashboard (tweaking costs, presets, logs).</li>
      </ol>
    </section>
  </main>
</div>
```

);
};

export default App;
