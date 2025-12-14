import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Shows an "Admin" link only if the current user is in the allowlist table.
 *
 * IMPORTANT:
 * - Table name assumed: public.admin_allowlist
 * - Column assumed: email (text) UNIQUE
 * If your table is named differently, change TABLE below.
 */
const TABLE = "admin_allowlist";

export default function AdminLink() {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = (data.user?.email || "").toLowerCase();
        if (!email) {
          if (!alive) return;
          setIsAdmin(false);
          setReady(true);
          return;
        }

        // If user is not admin, RLS might block read — treat as not admin.
        const { data: row, error } = await supabase
          .from(TABLE)
          .select("email")
          .eq("email", email)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          setIsAdmin(false);
        } else {
          setIsAdmin(!!row?.email);
        }

        setReady(true);
      } catch {
        if (!alive) return;
        setIsAdmin(false);
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!ready || !isAdmin) return null;

  // Your app uses pathname switching, so a normal <a href="/admin"> works.
  return (
    <a
      href="/admin"
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        color: "rgba(8,10,0,0.9)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      Admin
    </a>
  );
}
