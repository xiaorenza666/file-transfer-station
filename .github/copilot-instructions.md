# Copilot Instructions for File Transfer Station

Purpose: Give AI agents the minimum, specific context to be productive immediately in this repo.

## Big Picture
- Full‑stack TypeScript app: React 19 + Vite (client) and Express + tRPC (server) in one package.
- Persistence via Drizzle ORM + MySQL, object storage via S3 (Manus built‑in).
- Auth via Manus OAuth; sessions in HttpOnly cookies.
- LLM abstraction posts to Manus Forge API; model is configurable via env.

## Key Directories
- `server/_core/`: platform services (env, oauth, trpc, llm, storage, image/voice, vite).
- `server/routers.ts`: single tRPC router composing domain subrouters (`auth`, `files`, `admin`, `system`).
- `server/db.ts`: DB operations used by routers; schemas in `drizzle/schema.ts` with migrations under `drizzle/`.
- `client/src/`: UI, pages, hooks; routing via `wouter`; TRPC client in `client/src/lib/trpc.ts`.
- `shared/`: shared constants/types.

## Run, Build, Test
- Dev: `pnpm dev` (starts Express + Vite middleware on first free port ≥ 3000).
- Build: `pnpm build` (Vite client build + esbuild server to `dist`).
- Start: `pnpm start` (serve static in prod; no Vite dev server).
- Test: `pnpm test` (Vitest; server unit tests in `server/*.test.ts`).
- DB: `pnpm db:push` (generate + migrate via drizzle‑kit) after updating schemas.

## Environment (server/_core/env.ts)
Set in `.env.local` or runtime env:
- `DATABASE_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`.
- Forge/LLM: `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`.
- Default model: `DEFAULT_LLM_MODEL` (overrides server `_core/llm.ts` payload model).
- Frontend branding: `VITE_APP_*` values (title, logo, app id).

## LLM Integration (server/_core/llm.ts)
- Single entry: `invokeLLM(params)`; normalizes messages, tools, and response format.
- Calls Forge Chat Completions at `BUILT_IN_FORGE_API_URL` (fallback `https://forge.manus.im/v1/chat/completions`).
- Model selection: `DEFAULT_LLM_MODEL` env if set; otherwise uses the in‑file fallback.
- To enable Claude Sonnet 4.5 for all clients, set: `DEFAULT_LLM_MODEL=claude-sonnet-4.5` and ensure `BUILT_IN_FORGE_API_KEY` is valid for that model.
- Client example: `client/src/components/AIChatBox.tsx` shows how to push messages and render responses.

## API Patterns (tRPC)
- Use `publicProcedure`, `protectedProcedure`, `adminProcedure` from `server/_core/trpc.ts`.
- Auth context: available as `ctx.user`; admin gate throws `TRPCError('FORBIDDEN')`.
- Add endpoints under `appRouter` in `server/routers.ts` and wire to `db.ts` and `_core` helpers.

## Files Domain (server/routers.ts + server/storage.ts)
- Upload path: base64 → `storagePut` (S3) → DB record → share token.
- Passwords hashed via `bcryptjs`; optional burn‑after‑read and expiration.
- Downloads validate expiration/password; logs access; increments counters;
  burn‑after‑read deletes file on first download.

## Frontend Conventions
- Routing: `wouter`. Pages under `client/src/pages/*`; layout/components under `client/src/components/*`.
- State: React Query (TanStack) + React Context; theme in `contexts/ThemeContext.tsx`.
- UI: shadcn/ui + Tailwind; use `cn` helper for classes.

## Non‑obvious Behaviors
- Dev server auto‑selects a free port if 3000 is busy; it logs the chosen port.
- Body limits for uploads set to 50MB in `_core/index.ts` (adjust if needed).
- TRPC transformer is `superjson`; prefer serializable data or dates handled by transformer.

## How to Add an AI Feature Quickly
1) Server: add `ai` router in `server/routers.ts` with a mutation that calls `invokeLLM({ messages, tools? })`.
2) Client: use `trpc.ai.yourMethod.useMutation()` and drop in `AIChatBox` with `onSendMessage` to trigger it.
3) Ensure env includes `BUILT_IN_FORGE_API_KEY` and (optionally) `DEFAULT_LLM_MODEL`.

## Deployment Notes
- Production serves static assets; configure reverse proxy (Nginx) to app port.
- DB and S3 endpoints are external; credentials come from env.

If anything here is unclear or incomplete (e.g., exact model id for Claude Sonnet 4.5 on Forge), please let me know and I’ll refine this file.
