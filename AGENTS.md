# AGENTS.md

## Project overview

9Drive is a Cloudflare Access-protected, shared storage workspace. It connects Google Drive and S3-compatible accounts, streams uploads directly to providers, and stores object metadata, virtual folders, shares, routing policies, and provider credentials in MySQL.

Cloudflare Zero Trust is the only user-facing admission layer. The application has no local login, password, session, JWT, or browser bearer-token flow. `User` is retained as one internal workspace-owner record because existing storage relationships are scoped by `userId`.

## Repository structure

- `backend/`: Express 5 API, TypeScript, Prisma, MySQL, Google Drive and S3 integrations.
- `frontend/`: Next.js 16 UI served by the Express process.
- `README.md`: host-Nginx deployment and setup instructions.

The deployment uses host-managed Nginx to proxy one local Express port.

## Backend

Important files:

- `server.mjs`: root deployment entry point; serves the built Next app and compiled Express API.
- `backend/src/app.ts`: API routing and frontend fallback mounting.
- `backend/src/middleware/auth.middleware.ts`: establishes the internal shared workspace context; it does not authenticate requests.
- `backend/prisma/schema.prisma`: MySQL schema.
- `backend/src/modules/**`: API modules and provider services.

Rules:

- Keep provider credentials encrypted and never log tokens, keys, secrets, or raw share tokens.
- Uploaded objects must stream to the provider; never persist upload bytes to disk.
- Keep CORS restricted to `FRONTEND_URL`.
- Keep public share-token routes outside the workspace middleware and validate hash, status, and expiry before streaming.
- Schema changes require a Prisma migration, client generation, and a backend build.
- Do not reintroduce local authentication. If a future multi-workspace design is needed, validate Cloudflare Access identity at the backend and map it to workspace membership.

Commands:

- `npm run build`
- `npm run start`
- `npm run dev`
- `npm run db:migrate`
- `npm run db:generate`

## Frontend

The frontend is a Next.js 16 pages-router shell that hosts the existing React object-browser routes. Express serves it through Next's request handler, so it must be built before production startup.

Important files:

- `frontend/pages/[[...path]].tsx`: client app entry route.
- `frontend/src/App.tsx`: browser routes.
- `frontend/src/layouts/DriveLayout.tsx`: AWS S3-console-inspired shell.
- `frontend/src/lib/api.ts`: same-origin API helper; no token handling.

Rules:

- Keep the UI object-storage-oriented: objects, storage, access grants, and API access.
- Use same-origin requests because Express serves the dashboard and API together.
- Use `apiFetch` for JSON requests; raw `fetch` is appropriate for streaming/download/upload progress.

Commands:

- `npm run build`
- `npm --prefix frontend run typecheck`

## Verification

- `npm run db:generate && npm run build`
- Verify host Nginx proxies the protected hostname to the one local Express port.
- Verify Google OAuth callback matches the public `GOOGLE_REDIRECT_URI`.
