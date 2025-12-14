// src/App.tsx
import React from "react";
import { AuthGate } from "./components/AuthGate";
import MinaApp from "./MinaApp";
import AdminDashboard from "./AdminDashboard";

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  // support /admin and /admin/anything
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  return <AuthGate>{isAdminPath ? <AdminDashboard /> : <MinaApp />}</AuthGate>;
}
