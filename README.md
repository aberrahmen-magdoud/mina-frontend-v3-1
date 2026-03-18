# Mina Frontend

React 18 + TypeScript + Vite single-page application for Mina Editorial AI. Features AI-powered still image and video generation, real-time streaming, image editing (Fingertips), profile/history archive, and matcha credit billing.

---

## Directory Structure

```
├── index.html                # HTML entry point with SEO/Open Graph meta
├── package.json              # React 18.2, Supabase, TypeScript 5, Vite 5
├── vite.config.mts           # Vite + React plugin config
│
├── src/
│   ├── main.tsx              # Bootstrap — StrictMode + ErrorBoundary + global error handlers
│   ├── App.tsx               # AuthGate wrapper around MinaApp
│   ├── MinaApp.tsx           # Core orchestrator — all top-level state + handler wiring
│   ├── Profile.tsx           # Archive/history view — grid, filters, lightbox, batch delete
│   ├── StudioLeft.tsx        # Input panel — pills, brief, uploads, styles, create buttons
│   ├── StudioRight.tsx       # Output panel — still carousel, motion player, tweak bar, fingertips
│   ├── index.css             # Global resets, colour system, base styles
│   ├── Profile.css           # Profile grid + header styles
│   ├── StudioLeft.css        # Left panel styles
│   ├── StudioRight.css       # Right panel styles
│   │
│   ├── components/           # Reusable UI components
│   │   ├── AuthGate.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Collapse.tsx
│   │   ├── TopLoadingBar.tsx
│   │   ├── StillImage.tsx
│   │   ├── MatchaQtyModal.tsx
│   │   ├── SceneLibraryModal.tsx
│   │   ├── TutorialModal.tsx
│   │   └── WelcomeMatchaModal.tsx
│   │
│   ├── hooks/                # React hooks — extracted state logic
│   │   ├── useStudioLeftState.ts
│   │   ├── useFingertips.ts
│   │   ├── useDeleteFlow.ts
│   │   ├── useProfileDragSelect.ts
│   │   ├── useProfileLightbox.ts
│   │   ├── useMatchaCheckout.ts
│   │   ├── useMinaNotice.ts
│   │   ├── useInfiniteScroll.ts
│   │   ├── useHeaderContrast.ts
│   │   └── useVideoAutoplay.ts
│   │
│   ├── handlers/             # Business logic — deps-injected, testable
│   │   ├── minaDataFlow.ts
│   │   ├── minaGenerateFlow.ts
│   │   ├── minaTweakFlow.ts
│   │   ├── minaUiFlow.ts
│   │   ├── minaUploadFlow.ts
│   │   ├── minaCustomStyleFlow.ts
│   │   └── minaCdnFlow.ts
│   │
│   ├── lib/                  # Utilities, types, constants, API helpers
│   │   ├── minaTypes.ts
│   │   ├── minaConstants.ts
│   │   ├── minaHelpers.ts
│   │   ├── minaApi.ts
│   │   ├── minaCdn.ts
│   │   ├── mediaHelpers.ts
│   │   ├── mmaErrors.ts
│   │   ├── mmaSession.ts
│   │   ├── megaIdentity.ts
│   │   ├── supabaseClient.ts
│   │   ├── errorReporting.ts
│   │   ├── installGlobalErrorHandlers.ts
│   │   ├── adminConfig.ts
│   │   ├── minaDownload.ts
│   │   ├── sceneLibrary.ts
│   │   ├── cfInput1080.ts
│   │   ├── uploadProcessing.ts
│   │   ├── inboxHelpers.ts
│   │   ├── profileHelpers.ts
│   │   ├── profileItems.ts
│   │   ├── studioLeftHelpers.ts
│   │   ├── studioLeftTypes.ts
│   │   ├── studioRightHelpers.ts
│   │   └── useUndoRedo.ts
│   │
│   └── styles/
│       └── minaPanels.css    # Modal + panel shared styles
│
└── docs/                     # Internal documentation
    ├── init.md
    ├── MINAV3.md
    ├── mmaErrors.md
    └── routes.md
```

---

## Core Application Files

### `main.tsx`
Application bootstrap. Mounts the React app under `StrictMode`, wraps it in `ErrorBoundary`, installs global `window.onerror` and `unhandledrejection` handlers, and imports root stylesheets.

### `App.tsx`
Tiny wrapper that renders `AuthGate` around `MinaApp` — ensures authentication context is available before the studio loads.

### `MinaApp.tsx`
Central orchestrator (~780 lines). Owns **all top-level state**: studio/profile tabs, health/credits, still + motion generations, uploads, custom styles, fingertips, history, UI stage, and welcome modals. Delegates business logic to `handlers/*` modules. Maintains SSE streams for real-time MMA polling. Renders `StudioLeft`, `StudioRight`, `Profile`, header controls, and modals.

### `Profile.tsx`
Archive / history view (~977 lines). Displays past generations with feedback status. Features date / motion / aspect filtering, drag-select batch delete, lightbox viewer with zoom and swipe-close, infinite scroll pagination, matcha checkout modal, and recreation drafts. Uses `computeProfileItems()` for filtering and sorting.

### `StudioLeft.tsx`
Input panel (~997 lines). Renders pills (scene, logo, inspiration, style, aspect), brief textarea, upload panels with drag-and-drop, motion controls, style grids (still + motion), and the Create button. All state logic is extracted to the `useStudioLeftState` hook.

### `StudioRight.tsx`
Output / preview panel (~507 lines). Still image carousel (swipe, wheel, edge-click navigation), motion video display, tweak bar, fingertips toolbar (mask lasso, prompt, model dispatch), like / download / share buttons. Supports touch gestures and drag-to-zoom.

---

## `components/` — Reusable UI Components

### `AuthGate.tsx`
Authentication wrapper (~846 lines). Manages Pass ID initialisation, Supabase session detection, OAuth callback handling, and backend identity linking via `/me`. Provides `usePassId()` and `useAuthContext()` hooks. Handles email inbox routing helpers.

### `ErrorBoundary.tsx`
React error boundary. Catches uncaught render errors, sends them to the backend via `sendClientError()`, and shows a fallback "Something went wrong" message.

### `Collapse.tsx`
Animated reveal / hide component with `max-height` transitions. Keeps children mounted while toggling visibility. Uses `ResizeObserver` for dynamic content sizing.

### `TopLoadingBar.tsx`
Linear progress bar at the top of the page. Auto-ramps to 90% while busy, completes to 100% on finish, then fades away with exponential easing.

### `StillImage.tsx`
Image preloader. Uses `ImageDecoder` API (or canvas fallback) to fully decode images before display, ensuring smooth rendering without flicker.

### `MatchaQtyModal.tsx`
Matcha purchase modal. Preset packs (50 / 100 / 500 / 5000), slider or click-to-select quantity, price transparency display, and Shopify cart link.

### `SceneLibraryModal.tsx`
Commercial-friendly scene browser. Searchable grid (left 70%) + preview (right 30%). Parses scene data from `VITE_SCENE_LIBRARY` env var (JSON or pipe-delimited format).

### `TutorialModal.tsx`
Onboarding tutorial with video + 9-step checklist (upload, aspect, prompt, etc.). Responsive layout — side-by-side on desktop, stacked on mobile.

### `WelcomeMatchaModal.tsx`
First-time visitor welcome modal offering 5 free matcha lattes with a link to the Shopify store.

---

## `hooks/` — React Hooks (Extracted State Logic)

### `useStudioLeftState.ts`
Encapsulates all StudioLeft state (~738 lines). Handles pill visibility, popup states, drag-and-drop, render flag timing, mobile auto-cycle to 9:16 aspect. Returns ~80 computed values (styles, timings, costs, block reasons, handlers).

### `useFingertips.ts`
Fingertips toolbar state. Mask lasso drawing with smooth Catmull-Rom curves, marching ants animation, zoom/pan in mask mode, model selection, and prompt text.  
**Returns:** `ftMode`, `ftActiveModel`, `ftPrompt`, mask canvas refs, error state

### `useDeleteFlow.ts`
Profile batch delete state. Manages `confirmDeleteIds`, `deletingIds`, `removedIds` (ghost fade animation). Async deletion with error handling and undo support.

### `useProfileDragSelect.ts`
Drag-select rectangle on the profile grid. Long-press on touch (750 ms), drag threshold (5 px). Keyboard shortcuts: A = select all, Delete = delete confirmed.  
**Returns:** `dragRect`, `dragSelectedIds`, pointer handlers

### `useProfileLightbox.ts`
Lightbox state — open/close, zoom, prefetch. Swipe-to-close detection (70 px, < 900 ms). Click-to-zoom, double-click to download. Hint appears after 1 s hover.

### `useMatchaCheckout.ts`
Matcha quantity modal + Shopify cart URL builder. `clampQty()` and `buildMatchaCheckoutUrl()` helpers.

### `useMinaNotice.ts`
Mina "talking" personality. Cycles through thinking / filler phrases character-by-character while busy. Shows error / info messages on demand. Dismissible except when "thinking".

### `useInfiniteScroll.ts`
Dual-sentinel `IntersectionObserver`. First sentinel loads more items into the DOM buffer (+24). Second sentinel triggers a server fetch when `hasMore` is true. Respects scroll parent.

### `useHeaderContrast.ts`
Detects header colour (dark / light) by sampling the top-right 64×64 px of an image. Computes weighted luma for Profile header text contrast. CORS-aware.

### `useVideoAutoplay.ts`
Grid video autoplay logic. Muted by default, unmutes on hover. `IntersectionObserver` with 35% visibility threshold. Pauses when tab is hidden.

---

## `handlers/` — Business Logic (Deps-Injected, Testable)

All handlers accept a `deps` object instead of using React hooks directly, making them unit-testable outside of component context.

### `minaDataFlow.ts`
Data + credits + session handlers. Fetches credits, applies credit changes from responses, ensures sessions, checks backend health, fetches generation history (initial + paginated), dispatches Fingertips generate calls, and handles like/unlike.  
**Exports:** `fetchCredits()`, `applyCreditsFromResponse()`, `ensureSession()`, `handleCheckHealth()`, `fetchHistory()`, `fetchHistoryMore()`, `handleFingertipsGenerate()`, `handleLikeCurrent()`

### `minaGenerateFlow.ts`
Still + motion generation flow. Builds MMA motion request body, applies motion control rules (duration, aspect, audio), manages SSE polling, deducts credits, and translates provider errors to user-facing messages.  
**Exports:** `buildMmaMotionBody()`, `applyMotionControlRules()`, `handleGenerateStill()`, `handleGenerateMotion()`, `handleTypeForMe()`

### `minaTweakFlow.ts`
Feedback (tweaking) handler. Builds MMA tweak request with current state, polls SSE for result, and updates the generation list.

### `minaUiFlow.ts`
UI interactions: cycle aspect ratio, toggle animate mode, handle brief text changes, download current asset, set scene from viewer, apply recreate drafts, sign out, and set up global drag-and-drop file listener.  
**Exports:** `handleCycleAspect()`, `handleToggleAnimateMode()`, `handleBriefChange()`, `handleDownloadCurrent()`, `handleSetSceneFromViewer()`, `applyRecreateDraft()`, `handleSignOut()`, `setupGlobalDragDrop()`

### `minaUploadFlow.ts`
Upload CRUD. Signed PUT to R2, copy remote → R2, add files/URLs to panels, remove/move/patch items. Validates MIME types, file sizes, and duration. Panel caps: product 1–2, logo 1, inspiration 8.  
**Exports:** `uploadFileToR2()`, `storeRemoteToR2()`, `addFilesToPanel()`, `addUrlToPanel()`, `removeUploadItem()`, `moveUploadItem()`, `patchUploadItem()`

### `minaCustomStyleFlow.ts`
Custom style training modal. Uploads 3–10 images, trains a model, creates `CustomStylePreset`, handles hero selection, file input, rename, and delete.  
**Exports:** `handleTrainCustomStyle()`, `handleSelectCustomStyleHero()`, `handleCustomStyleFiles()`, `deleteCustomStyle()`, `handleRenameCustomPreset()`, `handleDeleteCustomPreset()`

### `minaCdnFlow.ts`
Wrapper around CDN + R2 helpers. Creates CDN optimiser, stores remote assets to R2, creates MMA runner instances, creates stop-all-MMA function, and ensures asset URLs.  
**Exports:** `createCdnOptimizer()`, `storeRemoteToR2()`, `createMmaRunner()`, `createStopAllMma()`, `ensureAssetsUrl()`

---

## `lib/` — Utilities, Types, Constants, API Helpers

### `minaTypes.ts`
TypeScript type definitions: `HealthState`, `CreditsState`, `GenerationRecord`, `FeedbackRecord`, `StillItem`, `MotionItem`, `UploadItem`, `AspectKey`, `CustomStylePreset`, `MmaCreateResponse`, `MmaGenerationResponse`, `FingertipsResult`, and more.

### `minaConstants.ts`
App constants: API URLs, localStorage keys, storage limits (uploads 25 MB, max dims 3840 px), matcha URLs, aspect options, style presets, animation timings, Fingertips error phrases.

### `minaHelpers.ts`
Pure utilities: `classNames`, `padEditorialNumber`, `stripSignedQuery`, `isHttpUrl`, `aspectRatioToNumber`, `fileToDataUrl`, `preloadImage`, `saveCustomStyles` / `loadCustomStyles`, `scheduleIdle`, `swapAspectRatio`, `normalizeNonExpiringUrl`, `getFileExt`.

### `minaApi.ts`
MMA API helpers: `deepPickHttpUrl()` (recursive URL extraction from nested responses), `buildMmaActionKey()` (idempotency), `attachIdempotencyKey()`, `makeIdempotencyKey()`, `pickMmaImageUrl()`, `pickMmaVideoUrl()`, `mmaWaitForFinal()`, SSE event parsing.

### `minaCdn.ts`
CDN optimisation manager. `createCdnOptimizer()` returns stateful functions for building and caching Cloudflare resize URLs. One-shot probe to detect if CDN resizing is supported.

### `mediaHelpers.ts`
Media detection: `isVideoUrl`, `isAudioUrl`, `isAssetsUrl`, `isMinaGeneratedAssetsUrl`, `inferMediaTypeFromFile` / `inferMediaTypeFromUrl`, `probeMediaUrl` (with timeout), `getMediaDurationSec`.

### `cfInput1080.ts`
Cloudflare image transformation builder. Resizes `assets.faltastudio.com` images to 1080 px (or custom width) with quality/format control (JPEG for product/inspiration, PNG for logos).

### `errorReporting.ts`
Client error logger. Sends crashes and unhandled rejections to the backend `/api/log-error` with stack, URL, user agent, and optional Pass ID / email.

### `installGlobalErrorHandlers.ts`
Installs `window` listeners for `error` and `unhandledrejection` events, forwarding them to `errorReporting`.

### `adminConfig.ts`
Admin configuration in localStorage. Shape: pricing (imageCost, motionCost), AI personality (thinking / filler phrases), style presets. Helpers: `loadAdminConfig()`, `saveAdminConfig()`, `isAdmin()`.

### `mmaErrors.ts`
Centralised MMA error handling. Extracts error text from nested responses. Maps to user-friendly `UI_ERROR_MESSAGES`.  
**Exports:** `extractMmaErrorTextFromResult()`, `humanizeMmaError()`, `humanizeUploadError()`, `isTimeoutLikeStatus()`

### `mmaSession.ts`
MMA SSE streaming infrastructure. `createIdempotencyManager()`, `createMmaRunner()` (SSE event listening + final result assembly), `mmaWaitForFinal()` promise wrapper.

### `megaIdentity.ts`
Pass ID generation + persistence. Crockford Base32 encoding for ULID-like IDs.  
**Exports:** `generatePassId()`, `readStoredPassId()`, `persistPassId()`. Types: `MegaCustomerRow`, `EnsurePassResult`.

### `minaDownload.ts`
Robust asset download for images + videos. Desktop: fetch → blob → `<a download>`. iOS: uses `navigator.share` to save to gallery. Content-Type detection from headers.

### `supabaseClient.ts`
Supabase client factory. Persistent sessions, auto token refresh, PKCE flow.  
**Exports:** `getSupabaseJwt()`, `withSupabaseAuthHeaders()`

### `sceneLibrary.ts`
Scene library parser. Supports JSON and pipe-delimited formats from `VITE_SCENE_LIBRARY`.  
**Type:** `SceneLibraryItem` (id, title, url, keywords)

### `inboxHelpers.ts`
Email provider inbox URL lookup. Maps 80+ domains to direct inbox links (Gmail, Outlook, Yahoo, ProtonMail, etc.). Mobile detection fallback.

### `profileHelpers.ts`
Profile utilities: string safety wrappers, Cloudflare CDN thumbnails (`cfThumb`, `cfInput2048`), JSON parsing, media URL detection, date formatting, download wrapper, aspect normalisation, `AUDIO_THUMB_URL`, `canonicalAssetUrl`.

### `profileItems.ts`
`computeProfileItems()` pure function. Filters generations by date range / motion / aspect. Marks items as deleted / ghosting. Computes `ProfileItem` metadata (sizeClass, likedStatus, recreateDraft).

### `studioLeftHelpers.ts`
StudioLeft constants: `AUDIO_THUMB_URL`, `TYPE_FOR_ME_ICON`, `MOTION_STYLES` array (Expand, Melt, Drop, Satisfying, Slow Motion, Still Camera, Perfect Loop). `inferMediaTypeFromItem()` helper.

### `studioLeftTypes.ts`
`StudioLeftProps` interface — defines all props passed into the StudioLeft component.

### `studioRightHelpers.ts`
StudioRight constants: `MASK_MODELS` (eraser, flux_fill), `PROMPT_MODELS` (flux_fill). Fingertips timing: `FT_INITIAL_DELAY` (260 ms), `FT_STAGGER` (90 ms).

### `uploadProcessing.ts`
Image normalisation pipeline. `decodeToBitmap()`, `canvasToBlob()`, `normalizeImageForUpload()` (HEIC → JPEG conversion, downsampling to max bytes / dimension).

### `useUndoRedo.ts`
Global undo/redo system. Maintains stacks (max 50 entries). Listens for Cmd+Z / Ctrl+Z (undo) and Shift variants (redo). Shows toast notifications.

---

## `styles/`

### `minaPanels.css`
Shared modal and panel styles. `.mina-modal-backdrop` (fixed overlay with blur), `.mina-modal` (centred card with shadow), header / body / footer layout, primary and secondary button styles, fade-in animations.

---

## `docs/` — Internal Documentation

| File | Topic |
|------|-------|
| `init.md` | Project initialisation notes |
| `MINAV3.md` | Backend API spec — routes, identity rules, headers, matcha pricing, session/credits endpoints |
| `mmaErrors.md` | Error handling philosophy — centralised extraction and user-facing messaging |
| `routes.md` | Detailed route map — all backend endpoints with caller, conditions, headers, request/response shapes |

---

## Key Architecture Patterns

- **State extraction to handlers** — Business logic lives in `handlers/*` with deps-injection for testability, keeping components thin
- **Custom hook extraction** — Heavy state logic moves to `hooks/*` (e.g. `useStudioLeftState` owns ~80 values for StudioLeft)
- **Type-safe data flow** — TypeScript interfaces (`StudioLeftProps`, `CreditsDeps`, `GenerateDeps`) enforce compile-time safety
- **Idempotency + SSE** — MMA generation uses idempotency keys to prevent duplicates; results stream via Server-Sent Events
- **CDN optimisation** — Cloudflare transforms (width, quality, format) applied on the fly; one-shot probe detects support
- **localStorage caching** — Likes, custom styles, draft recreations persist locally to minimise API calls
- **Error centralisation** — All MMA error shapes normalised in `mmaErrors.ts` for consistent user messaging
- **Undo/redo system** — Global hook with 50-entry stack, Cmd+Z / Ctrl+Z shortcuts, toast feedback
- **Responsive design** — Mobile auto-cycles aspect to 9:16; fingertips + StudioRight support swipe/gesture
- **Gesture handling** — Swipe carousel, drag-select, lasso masks, zoom-pan across StudioRight, Profile lightbox, and Fingertips
