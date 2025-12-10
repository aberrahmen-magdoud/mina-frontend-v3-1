// src/components/AuthGate.tsx
import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      setLoading(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return (
      <div className="mina-root">
        <main className="mina-main">
          <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
        </main>
      </div>
    );
  }

  // Not logged in → show Supabase Auth UI
  if (!session) {
    return (
      <div className="mina-root">
        <main className="mina-main">
          <div style={{ maxWidth: 460, margin: "40px auto" }}>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>Welcome to Mina</h1>
            <p style={{ marginBottom: 24 }}>
              Sign in with Google or email. We’ll keep you logged in for a
              smooth, Pinterest-style experience.
            </p>
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: "#22c55e",
                      brandAccent: "#16a34a",
                    },
                  },
                },
              }}
              providers={["google"]}
              redirectTo={window.location.origin}
            />
          </div>
        </main>
      </div>
    );
  }

  // Logged in → show Mina UI with a small header + sign out
  return (
    <div className="mina-root">
      <header className="mina-header">
        <div className="mina-logo">MINA · Editorial AI</div>
        <div className="mina-header-right">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span
              style={{
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.user.email}
            </span>
            <button
              type="button"
              className="link-button subtle"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mina-main">{children}</main>
    </div>
  );
};
