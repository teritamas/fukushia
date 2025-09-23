# AGENTS.md (application)

## Dev Environment Tips

- Install deps: `uv sync` (Python >= 3.11; uses `pyproject.toml`).
- Run API (dev): `uv run uvicorn main:app --reload` and open `http://localhost:8000/docs`.
- Env vars: create `application/.env` from `.env.example` (Firebase key, `GEMINI_API_KEY`, `GOOGLE_CSE_ID`).
- VS Code: use tasks `uv run backend`, `uv ruff format` from `.vscode/tasks.json`.
- Docker: `docker build -t fukushia_api .` then `docker run --rm -p 8000:8000 fukushia_api`.

## Coding Conventions

- Formatter/Lint: Ruff formats code; `line-length = 120` (Ruff + Flake8). Keep imports and files tidy; prefer module-level `__all__` only when needed.
- Structure: FastAPI routers under `routes/**`, agents/tools under `agent/**`, helpers under `utils/**`, configuration in `config.py`.
- Comments: All comments should be in Japanese.
- Dependencies: managed via `uv` with `pyproject.toml` and `dependency-groups.dev` for tooling.

## Testing Instructions

- CI syncs dependencies; no backend tests are configured yet.
- Local checks: `uv sync --dev && uv run ruff format .` (use `uv run ruff format --check .` for CI-like verification).
- Manual smoke: start the server and verify `/docs` loads and basic routes respond.

## PR Instructions

- Title: `[application] <Title>`.
- Pre-push: `uv sync --dev`, `uv run ruff format --check .` (or run formatter and commit), ensure server starts locally.
- Include updates to `README.md` or sample `.env` if you add/change configuration.
