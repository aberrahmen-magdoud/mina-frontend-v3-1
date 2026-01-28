# Mina Frontend

Minimal Vite + React client for the Mina Editorial AI studio. This repo is intentionally small: one `src/` folder and a single consolidated services module.

## How it runs
- `npm install`
- `npm run dev` (local dev)
- `npm run build` (production build)

## What this frontend does (reference)

### Core flow
1. **AuthGate** boots Supabase auth and resolves a stable `passId`.
2. **Studio UI** sends create/tweak requests to the backend (`/mma/...`).
3. **SSE stream** listens to `/mma/stream/:generationId` for live status.
4. **Media uploads** use backend presign (`/api/r2/presign`) then direct PUT to R2.
5. **History & credits** read from backend (`/history/...`, `/credits/...`).
6. **Downloads** fetch media directly (with optional backend proxy fallback).

### External communications
- **Supabase**: auth sessions and admin allowlist checks.
- **Mina API**: MMA generation, credits, history, feedback, shopify-sync, public stats.
- **R2**: media uploads via presigned PUT (from backend).

## Files and folders

### Root
- `.gitignore` - git ignore rules.
- `index.html` - Vite entry HTML.
- `package.json` - scripts and dependencies.
- `vite.config.mts` - Vite config.
- `README.md` - this file.

### src/
- `main.tsx` - bootstraps React, installs global error handlers.
- `AuthGate.tsx` - Supabase auth + passId management + login UI gate.
- `MinaApp.tsx` - primary app logic, MMA requests, SSE handling.
- `StudioLeft.tsx` - left panel UI (inputs, uploads, styles, actions).
- `StudioRight.tsx` - right panel UI (viewer + tweak).
- `Profile.tsx` - history, credits, session view.
- `ui.tsx` - shared UI components (loading bar, modals, error boundary).
- `services.ts` - Supabase client + admin config + error reporting + MMA helpers + downloads.
- `styles.css` - all global + component styles merged into one file.

## Required services
Supabase and the Mina backend are required. R2 is required for uploads. The backend handles OpenAI/Replicate.

## Environment overview (high level)
- `VITE_MINA_API_BASE_URL` / `VITE_BACKEND_URL` for API calls.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for auth.

See `src/services.ts` and `src/AuthGate.tsx` for exact usages.
