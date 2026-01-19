# MMA Error Handling

This project centralizes MMA + front-end error parsing and user-facing messaging in `src/lib/mmaErrors.ts`.

## Why

We want a single source of truth for:

- Extracting error text from MMA responses (which can have many shapes).
- Mapping raw backend errors into short, friendly messages in the UI.
- Keeping upload/runtime UI errors consistent (same phrasing everywhere).

Keeping this in one module avoids scattered string checks and keeps Mina UI messages consistent.

## What lives in `mmaErrors.ts`

- `extractMmaErrorTextFromResult(result)`
  - Pulls the best available error string from MMA results.
  - Supports nested shapes like `error`, `mg_error`, `mma_vars.error`, etc.

- `isTimeoutLikeStatus(status)`
  - Detects timeout-ish statuses.

- `humanizeMmaError(err)`
  - Converts raw errors into friendly, user-facing text.
  - This includes the standard “That was too complicated, try simpler task.” fallback for pipeline/no-URL errors.

- `humanizeUploadError(reason)`
  - Converts upload error reasons into user-facing strings.

- `UI_ERROR_MESSAGES`
  - Shared message strings for frontend validations (missing API base, pass ID, tweak errors, etc.).

## Adding new errors

Add or update mappings in `humanizeMmaError` so every UI surface stays in sync.
