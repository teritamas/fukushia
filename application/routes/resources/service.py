import json
import math
from typing import List
from models.pydantic_models import Resource
from .utils import embed_texts


def resource_to_corpus(r: Resource) -> str:
    parts = [
        r.service_name or "",
        r.category or "",
        r.description or "",
        r.eligibility or "",
        r.application_process or "",
        r.target_users or "",
        " ".join(r.keywords or []),
    ]
    return "\n".join([p for p in parts if p])


def resource_doc_to_model(doc) -> Resource:
    data = doc.to_dict()

    def _coerce(v):
        if v is None:
            return None
        if isinstance(v, (str, int, float)):
            return str(v) if not isinstance(v, str) else v
        try:
            import json as _json

            return _json.dumps(v, ensure_ascii=False)
        except Exception:
            return str(v)

    service_name_val = _coerce(data.get("service_name"))
    if not service_name_val:
        raise ValueError("missing service_name")
    return Resource(
        id=doc.id,
        service_name=service_name_val,
        category=_coerce(data.get("category")),
        target_users=_coerce(data.get("target_users")),
        description=_coerce(data.get("description")),
        eligibility=_coerce(data.get("eligibility")),
        application_process=_coerce(data.get("application_process")),
        cost=_coerce(data.get("cost")),
        provider=_coerce(data.get("provider")),
        location=_coerce(data.get("location")),
        contact_phone=_coerce(data.get("contact_phone")),
        contact_fax=_coerce(data.get("contact_fax")),
        contact_email=_coerce(data.get("contact_email")),
        contact_url=_coerce(data.get("contact_url")),
        keywords=data.get("keywords", []),
        last_verified_at=data.get("last_verified_at"),
    )


def normalize_resource_input(raw: dict) -> dict:
    contact = raw.get("contact_info") or {}
    return {
        "service_name": raw.get("service_name"),
        "category": raw.get("category"),
        "target_users": raw.get("target_users"),
        "description": raw.get("description"),
        "eligibility": raw.get("eligibility"),
        "application_process": raw.get("application_process"),
        "cost": raw.get("cost"),
        "provider": raw.get("provider"),
        "location": raw.get("location"),
        "contact_phone": contact.get("phone"),
        "contact_fax": contact.get("fax"),
        "contact_email": contact.get("email"),
        "contact_url": contact.get("url"),
        "keywords": raw.get("keywords", []),
    }

