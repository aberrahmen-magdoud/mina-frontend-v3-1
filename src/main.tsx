// src/main.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React runtime, root renderer, AuthGate + MinaApp, base styles.
// 2) Bootstrap: attach global error handlers and mount the app under StrictMode
//    + ErrorBoundary wrapper.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import React from "react";
import ReactDOM from "react-dom/client";
import MinaApp from "./MinaApp";
import "./styles.css";
import { ErrorBoundary } from "./ui";
import { installGlobalErrorHandlers } from "./services";
import { AuthGate } from "./AuthGate";

// [PART 2] Application bootstrap
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <MinaApp />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
