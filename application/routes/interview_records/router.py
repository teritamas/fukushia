from fastapi import APIRouter, HTTPException, Depends
from typing import List
from models.pydantic_models import InterviewRecord
from infra.firestore import get_firestore_client
import config
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter()
db = get_firestore_client()


@router.get(
    "/",
    response_model=List[InterviewRecord],
    summary="Get all interview records for a client",
)
def get_all_interview_records(client_name: str):
    """
    指定されたクライアントのすべての面談記録を取得します。
    """
    try:
        records_ref = (
            db.collection("artifacts")
            .document(config.TARGET_FIREBASE_APP_ID)
            .collection("users")
            .document(config.TARGET_FIREBASE_USER_ID)
            .collection("interview_records")
            .where(filter=FieldFilter("clientName", "==", client_name))
            .order_by("timestamp", direction="DESCENDING")
        )
        docs = records_ref.stream()

        records = []
        for doc in docs:
            record_data = doc.to_dict()
            record_data["id"] = doc.id
            records.append(InterviewRecord(**record_data))

        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
