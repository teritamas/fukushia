import os
from pathlib import Path
from dotenv import load_dotenv


# Load .env once at import
load_dotenv(dotenv_path=Path(__file__).parent / ".env")


def _require(name: str) -> str:
    v = os.getenv(name)
    if v is None or v == "":
        raise RuntimeError(f"Required environment variable '{name}' is not set")
    return v


# Required credentials / IDs
GEMINI_API_KEY: str = _require("GEMINI_API_KEY")
GOOGLE_CSE_ID: str = _require("GOOGLE_CSE_ID")
FIREBASE_SERVICE_ACCOUNT: str = _require("FIREBASE_SERVICE_ACCOUNT")
TARGET_FIREBASE_APP_ID: str = _require("TARGET_FIREBASE_APP_ID")
TARGET_FIREBASE_USER_ID: str = _require("TARGET_FIREBASE_USER_ID")

# Optional or with sensible defaults
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
EMBED_MODEL: str = os.getenv("EMBED_MODEL", "models/text-embedding-004")
GOOGLE_APPLICATION_CREDENTIALS: str | None = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

# Project detection (optional; ADC may provide project implicitly)
FIREBASE_PROJECT_ID: str | None = (
    os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
)

# --- RAG Engine (Vertex RAG Store) ---
# Required for RAG-backed tools
RAG_PROJECT_ID: str = _require("RAG_PROJECT_ID")
RAG_CORPUS_RESOURCE: str = _require("RAG_CORPUS_RESOURCE")  # projects/{project}/locations/{location}/ragCorpora/{id}

# Optional
RAG_LOCATION: str = os.getenv("RAG_LOCATION", "global")
RAG_MODEL: str = os.getenv("RAG_MODEL", "gemini-2.5-flash-lite-lite")
