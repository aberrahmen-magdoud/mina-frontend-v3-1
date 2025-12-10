// src/components/AuthGate.tsx
import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

function openInboxFor(email: string | null) {
  if (typeof window === "undefined") return;

  if (!email) {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  const domain = parts[1].toLowerCase();

  if (domain === "gmail.com") {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) {
    window.open("https://outlook.live.com", "_blank");
    return;
  }

  if (domain === "yahoo.com") {
    window.open("https://mail.yahoo.com", "_blank");
    return;
  }

  window.open(`mailto:${email}`, "_blank");
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bypassForNow] = useState(false);

  // load session
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setInitializing(false);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === "SIGNED_OUT") {
        setEmail("");
        setOtpSent(false);
        setSentTo(null);
        setError(null);
        setEmailMode(false);
      }

      if (event === "SIGNED_IN" && newSession?.user?.email) {
        try {
          window.localStorage.setItem(
            "minaCustomerId",
            newSession.user.email
          );
        } catch {
          // ignore
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    try {
      const { error: supaError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (supaError) throw supaError;

      setOtpSent(true);
      setSentTo(trimmed);

      try {
        window.localStorage.setItem("minaCustomerId", trimmed);
      } catch {
        // ignore
      }
    } catch (err: any) {
      setError(err?.message || "failed to send login link.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: supaError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (supaError) throw supaError;
    } catch (err: any) {
      setError(err?.message || "failed to start google login.");
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-left">
          <div className="mina-auth-card">
            <div className="mina-auth-logo">mina editorial ai</div>
            <h1 className="mina-auth-title">loading</h1>
            <p className="mina-auth-text">just a moment…</p>
          </div>
        </div>
        <div className="mina-auth-right" />
      </div>
    );
  }

  if (session || bypassForNow) {
    return <>{children}</>;
  }

  const hasEmail = email.trim().length > 0;
  const targetEmail = sentTo || (hasEmail ? email.trim() : null);

  return (
    <div className="mina-auth-shell">
      <div className="mina-auth-left">
        <div className="mina-auth-card">
          <div className="mina-auth-logo">mina editorial ai</div>

          {!otpSent ? (
            <>
              <h1 className="mina-auth-title">sign in</h1>
              <p className="mina-auth-text">
                use your google account or email to work with mina.
              </p>

              <div className="mina-auth-actions">
                {/* main button: bold, underlined text */}
                <button
                  type="button"
                  className="mina-auth-link primary"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  {loading && !emailMode ? "opening google…" : "login with google"}
                </button>

                {/* secondary trigger: use email instead */}
                <div className={emailMode ? "fade-block hidden" : "fade-block"}>
                  <button
                    type="button"
                    className="mina-auth-link secondary"
                    onClick={() => setEmailMode(true)}
                    disabled={loading}
                  >
                    use email instead
                  </button>
                </div>

                {/* email mode: fades in, pushes content */}
                <div className={emailMode ? "fade-block" : "fade-block hidden"}>
                  <form onSubmit={handleEmailLogin} className="mina-auth-form">
                    <label className="mina-auth-label">
                      <input
                        className="mina-auth-input"
                        type="email"
                        placeholder="type email here"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>

                    <div
                      className={
                        hasEmail ? "fade-block" : "fade-block hidden"
                      }
                    >
                      <button
                        type="submit"
                        className="mina-auth-link primary"
                        disabled={loading || !hasEmail}
                      >
                        {loading ? "sending link…" : "sign in"}
                      </button>
                    </div>
                  </form>

                  <p className="mina-auth-hint">
                    we’ll email you a one-time link. if this address is new,
                    that email will also confirm your account.
                  </p>
                </div>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}
            </>
          ) : (
            <>
              <h1 className="mina-auth-title">check your email</h1>
              <p className="mina-auth-text">
                we’ve sent a sign-in link to{" "}
                {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}.
                open it to continue with mina.
              </p>

              <div className="mina-auth-actions">
                <button
                  type="button"
                  className="mina-auth-link primary"
                  onClick={() => openInboxFor(targetEmail)}
                >
                  open email app
                </button>

                <button
                  type="button"
                  className="mina-auth-link secondary"
                  onClick={() => {
                    setOtpSent(false);
                    setSentTo(null);
                    setError(null);
                    setEmailMode(true);
                  }}
                >
                  use a different email
                </button>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}

              <p className="mina-auth-hint">
                if you can’t see the message, check spam or promotions.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mina-auth-right" />
    </div>
  );
}
