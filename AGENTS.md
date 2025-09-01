# AGENTS.md

## Dev Environment Tips
- Backend (FastAPI + uv): `cd application && uv sync` to install deps. Run with `uv run uvicorn main:app --reload` and open `http://localhost:8000/docs`.
- Frontend (Next.js + npm): `cd frontend && npm ci && npm run dev` to start the app at `http://localhost:3000`.
- Environment files: copy from examples. Create `application/.env` and `frontend/.env.local`. See `README.md:44` for required keys.
- VS Code tasks: use `npm run dev` (frontend) and `uv run backend` (backend) from `.vscode/tasks.json` for quick starts. Format with "Format Backend (ruff)" and "Format Frontend (prettier)" tasks.
- Docker (backend): from `application/` run `docker build -t assessment_api .` then `docker run --rm -p 8000:8000 assessment_api`.

## Coding Conventions
- Backend/Python: Ruff formats code (`line-length = 120`), Flake8 max line length 120. Python `>=3.11`. Keep FastAPI routers under `application/routes/**` and shared helpers in `application/utils/**`.
- Frontend/TypeScript: ESLint (flat config) + Prettier. Next.js 15, React 19. Use TypeScript and keep components under `frontend/src/**`.
- Secrets: never commit `.env`, `.env.local`, or service account keys. Use the provided `*.example` files.

## Testing Instructions
- CI: see `.github/workflows/ci.yml` and `auto-format.yml`. CI builds the frontend (`npm run build`) and syncs backend deps (`uv sync`).
- Local checks:
  - Backend: `cd application && uv sync --dev && uv run ruff format .` (use `--check` locally if preferred).
  - Frontend: `cd frontend && npm run lint && npx prettier --check . && npm run build`.
- Note: No test suite is configured yet. If you add tests, keep them package-local and wire them into CI.

## PR Instructions
- Title format: `[application] <Title>` or `[frontend] <Title>` (or `[repo] <Title>` for cross-cutting changes).
- Before pushing: run backend formatter and frontend lint/build as listed above; ensure no unstaged changes remain after formatters.
- Keep changes focused; update docs when touching env, scripts, or routes. Avoid committing env/secrets or build artifacts.
