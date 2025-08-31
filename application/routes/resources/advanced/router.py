from fastapi import APIRouter, Request
from typing import List, Tuple

from ...common import resource_collection, logger
from ..service import resource_doc_to_model
from ..utils import embed_texts, cosine
from models.pydantic_models import ResourceSuggestRequest, ResourceSuggestResponse, SuggestedResource


router = APIRouter(prefix="/resources/advanced", tags=["resources"])


@router.post("/suggest", response_model=ResourceSuggestResponse)
async def suggest_resources(req: ResourceSuggestRequest, request: Request):
    assessment = req.assessment_data.get("assessment") if isinstance(req.assessment_data, dict) else None
    texts: list[str] = []
    if isinstance(assessment, dict):
        for form_val in assessment.values():
            if isinstance(form_val, dict):
                for cat_val in form_val.values():
                    if isinstance(cat_val, str):
                        texts.append(cat_val)
                    elif isinstance(cat_val, dict):
                        for sub_val in cat_val.values():
                            if isinstance(sub_val, str):
                                texts.append(sub_val)
    base_text = "\n".join(texts)[:20000]
    summary_text = base_text
    used_summary = False
    if logger.isEnabledFor(10):  # DEBUG
        logger.debug(f"[suggest_debug] raw_text_len={len(base_text)} snippets={len(texts)}")
    if req.use_llm_summary and base_text:
        try:
            gemini_agent = request.app.state.gemini_agent
            summary_text = gemini_agent.summarize_for_resource_match(base_text)
            used_summary = True
            if logger.isEnabledFor(10):
                logger.debug(
                    f"[suggest_debug] summarization used_summary={used_summary} summary_len={len(summary_text)}"
                )
        except Exception as e:
            logger.warning(f"summary failed fallback raw: {e}")
            summary_text = base_text
    import re

    tokens = [t.lower() for t in re.split(r"[\s、。,.；;:\n\r\t/()『』「」【】\[\]{}]+", summary_text) if len(t) > 1][
        :1000
    ]
    if logger.isEnabledFor(10):
        logger.debug(f"[suggest_debug] token_count={len(tokens)} first_tokens={tokens[:15]}")
    q_vec = embed_texts([summary_text])[0]
    scored: list[tuple[str, float, list[str], object]] = []
    debug_components: list[dict] = []
    try:
        docs = resource_collection().stream()
        for d in docs:
            try:
                res = resource_doc_to_model(d)
            except ValueError:
                continue
            overlap = list({kw.lower() for kw in (res.keywords or []) if kw.lower() in tokens})[:12]
            kw_score = len(overlap)
            emb = []  # no cache; can be extended with precomputed embeddings
            emb_score = cosine(q_vec, emb) if q_vec and emb else 0.0
            final = emb_score * 0.7 + kw_score * 0.3
            if final <= 0:
                continue
            scored.append((res.id, final, overlap, res))
            if logger.isEnabledFor(10):
                if len(debug_components) < 50:
                    debug_components.append(
                        {
                            "id": res.id,
                            "name": res.service_name[:60],
                            "kw_overlap": overlap,
                            "kw_score": kw_score,
                            "emb_score": round(emb_score, 4),
                            "final": round(final, 4),
                        }
                    )
    except Exception as e:
        logger.error(f"suggest iteration failed: {e}")
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[: req.top_k]
    if logger.isEnabledFor(10):
        logger.debug(
            f"[suggest_debug] candidates_considered={len(scored)} returning={len(top)} used_summary={used_summary}"
        )
        try:
            import json as _json

            logger.debug("[suggest_debug] score_components=" + _json.dumps(debug_components[:10], ensure_ascii=False))
        except Exception:
            pass
    return ResourceSuggestResponse(
        query_tokens=tokens[:100],
        resources=[
            SuggestedResource(
                resource_id=i,
                service_name=r.service_name,
                score=round(s, 4),
                matched_keywords=mk,
                excerpt=(r.description or "")[:180],
            )
            for i, s, mk, r in top
        ],
        used_summary=used_summary,
    )
