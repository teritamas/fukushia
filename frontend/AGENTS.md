# AGENTS.md (frontend)

## Dev Environment Tips

- Install deps: `npm ci` (Node 20–24 in CI). Start dev server with `npm run dev` (Turbopack) at `http://localhost:3000`.
- Env vars: create `frontend/.env.local` from `.env.example` (public Firebase keys prefixed with `NEXT_PUBLIC_`). Do not commit it.
- Lint/Format: `npm run lint` (ESLint flat config). Format with Prettier: `npx prettier --write .`.
- Config: Next.js 15 with TypeScript; see `eslint.config.mjs`, `tsconfig.json`.

## Coding Conventions

- TypeScript-first: keep components, hooks, and utils under `src/**`; prefer named exports from index files per folder.
- ESLint rules come from Next.js config; use Prettier for consistent formatting.
- Comments: All comments should be in Japanese.
- Avoid using secret runtime values on the client—only `NEXT_PUBLIC_*` variables are exposed.

## Testing Instructions

- CI builds with `npm run build` (see `.github/workflows/ci.yml`).
- Local checks: `npm run lint && npx prettier --check . && npm run build`.
- No unit test setup yet; add Vitest/RTL later if needed and wire into CI.

## PR Instructions

- Title: `[frontend] <Title>`.
- Before pushing: `npm run lint`, `npx prettier --write .`, and ensure `npm run build` passes.
- Keep `.env.local` out of commits; document any new envs in `.env.example`.
