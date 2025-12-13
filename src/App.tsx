// src/App.tsx
import React from "react";
import { AuthGate } from "./components/AuthGate";
import MinaApp from "./MinaApp";
import AdminDashboard from "./AdminDashboard";

function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  return (
    <AuthGate>
      {pathname === "/admin" ? <AdminDashboard /> : <MinaApp />}
    </AuthGate>
  );
}

export default App;
