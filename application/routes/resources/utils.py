import logging


logger = logging.getLogger(__name__)
from config import EMBED_MODEL as EMBED_MODEL_NAME


def cosine(a: list[float], b: list[float]) -> float:
    import math

    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-9
    nb = math.sqrt(sum(y * y for y in b)) or 1e-9
    return dot / (na * nb)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    try:
        import google.generativeai as genai  # type: ignore

        from config import GEMINI_API_KEY as api_key
        if api_key:
            try:
                genai.configure(api_key=api_key)
            except Exception as ce:
                logger.warning(f"genai configure failed: {ce}")
        vecs: list[list[float]] = []
        for t in texts:
            truncated = (t or "")[:8000]
            if not truncated.strip():
                vecs.append([])
                continue
            try:
                resp = genai.embed_content(model=EMBED_MODEL_NAME, content=truncated)
                if isinstance(resp, dict):
                    emb = resp.get("embedding", [])
                else:
                    emb = getattr(resp, "embedding", [])
                if not isinstance(emb, list):
                    emb = []
                vecs.append(emb)
            except Exception as e:
                logger.warning(f"embedding failure: {e}")
                vecs.append([])
        return vecs
    except ImportError as ie:
        logger.error(f"Embedding API import error: {ie}")
    except Exception as e:
        logger.error(f"Embedding API error: {e}")
    return [[] for _ in texts]
