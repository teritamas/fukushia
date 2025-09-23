from fastapi import APIRouter, Request

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

    # LLM summary is now used inside the loop for each resource if enabled
    import re
    import json

    # Tokenize the base text once for keyword matching
    tokens = [t.lower() for t in re.split(r"[\s、。,.；;:\n\r\t/()『』「」【】\[\]{}]+", base_text) if len(t) > 1][:1000]
    if logger.isEnabledFor(10):
        logger.debug(f"[suggest_debug] token_count={len(tokens)} first_tokens={tokens[:15]}")
    # Embed the base text for cosine similarity calculation
    q_vec = embed_texts([base_text])[0]
    scored: list[tuple[str, float, list[str], object, Optional[str], Optional[str]]] = []
    debug_components: list[dict] = []
    try:
        docs = list(resource_collection().stream())
        resources = []
        for d in docs:
            try:
                resources.append(resource_doc_to_model(d))
            except ValueError:
                continue

        for res in resources:
            # Keyword-based score
            overlap = list({kw.lower() for kw in (res.keywords or []) if kw.lower() in tokens})[:12]
            kw_score = len(overlap)

            # Embedding-based score from pre-calculated value
            emb = res.embedding or []
            emb_score = cosine(q_vec, emb) if q_vec and emb else 0.0

            # Combine scores
            final_score = emb_score * 0.7 + kw_score * 0.3
            if final_score <= 0.2:  # Increase threshold to filter out irrelevant results
                continue

            reason = None
            task_suggestion = None
            is_match = True  # Default to true if LLM check is not used

            if req.use_llm_summary and base_text:
                try:
                    support_plan_agent = request.app.state.support_plan_agent
                    resource_context = f"名称: {res.service_name}\n概要: {res.description}\n対象者: {res.target_users}\n利用要件: {res.eligibility}"
                    llm_response_str = support_plan_agent.summarize_for_resource_match(
                        base_text, client=req.client, resource_context=resource_context
                    )
                    llm_response = json.loads(llm_response_str)
                    is_match = llm_response.get("is_match", False)
                    reason = llm_response.get("reason")
                    task_suggestion = llm_response.get("task_suggestion")
                    used_summary = True
                    if not is_match:
                        continue  # Skip if LLM determines it's not a match
                except Exception as e:
                    logger.warning(f"LLM eligibility check failed for resource {res.id}: {e}")
                    # Fallback to not adding the resource if the check fails, to be safe
                    continue

            scored.append((res.id, final_score, overlap, res, reason, task_suggestion))

            if logger.isEnabledFor(10) and len(debug_components) < 50:
                debug_components.append(
                    {
                        "id": res.id,
                        "name": res.service_name[:60],
                        "kw_overlap": overlap,
                        "kw_score": kw_score,
                        "emb_score": round(emb_score, 4),
                        "final": round(final_score, 4),
                        "is_match": is_match,
                        "reason": reason,
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
                reason=reason,
                task_suggestion=task_suggestion,
            )
            for i, s, mk, r, reason, task_suggestion in top
        ],
        used_summary=used_summary,
    )
