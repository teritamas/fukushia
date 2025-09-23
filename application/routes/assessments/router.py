"""Assessments API router."""

from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from google.cloud.firestore import SERVER_TIMESTAMP
from ..common import db, logger, exponential_backoff
import config
from google.cloud.firestore_v1.base_query import FieldFilter


router = APIRouter(tags=["assessments"])


class AssessmentCreateRequest(BaseModel):
    """Request model for creating an assessment."""

    client_name: str = Field(..., description="Name of the client")
    assessment: Dict[str, Any] = Field(..., description="Assessment data structure")
    original_script: Optional[str] = Field(None, description="Original interview script")
    support_plan: Optional[str] = Field(None, description="Support plan text")


class AssessmentUpdateRequest(BaseModel):
    """Request model for updating an assessment."""

    assessment: Optional[Dict[str, Any]] = Field(None, description="Updated assessment data structure")
    support_plan: Optional[str] = Field(None, description="Updated support plan text")


class AssessmentResponse(BaseModel):
    """Response model for assessment data."""

    id: str = Field(..., description="Assessment ID")
    client_name: str = Field(..., description="Name of the client")
    assessment: Dict[str, Any] = Field(..., description="Assessment data structure")
    original_script: Optional[str] = Field(None, description="Original interview script")
    support_plan: Optional[str] = Field(None, description="Support plan text")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    version: int = Field(..., description="Version number")


def assessments_collection():
    """アセスメントコレクションへの参照を取得"""
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("assessments")
    )


def clients_collection():
    """クライアントコレクションへの参照を取得"""
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("clients")
    )


@router.get("/", response_model=List[AssessmentResponse])
async def get_assessments(
    client_name: Optional[str] = Query(None, description="Filter by client name"),
) -> List[AssessmentResponse]:
    """Get all assessments, optionally filtered by client name."""
    try:

        def fetch_assessments():
            ref = assessments_collection()
            query = ref.order_by("createdAt", direction="DESCENDING")
            return query.stream()

        docs = exponential_backoff(fetch_assessments)

        result = []
        for doc in docs:
            data = doc.to_dict()
            if not data:
                continue

            # Filter by client name if provided
            if client_name and data.get("clientName") != client_name:
                continue

            try:
                result.append(
                    AssessmentResponse(
                        id=doc.id,
                        client_name=data.get("clientName", ""),
                        assessment=data.get("assessment", {}),
                        original_script=data.get("originalScript"),
                        support_plan=data.get("supportPlan"),
                        created_at=data.get("createdAt", datetime.now()),
                        updated_at=data.get("updatedAt", datetime.now()),
                        version=data.get("version", 1),
                    )
                )
            except Exception as e:
                logger.warning(f"Skipping invalid assessment {doc.id}: {e}")
                continue

        logger.info(f"アセスメント一覧を取得しました: {len(result)}件")
        return result

    except Exception as e:
        logger.error(f"アセスメント一覧取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"アセスメント一覧の取得中にエラーが発生しました: {str(e)}")


@router.post("/", response_model=AssessmentResponse)
async def create_assessment(req: AssessmentCreateRequest, request: Request) -> AssessmentResponse:
    """Create a new assessment."""
    try:
        if not req.client_name.strip():
            raise HTTPException(status_code=400, detail="クライアント名は必須です")

        def create_assessment_doc():
            ref = assessments_collection()
            doc_data = {
                "clientName": req.client_name.strip(),
                "assessment": req.assessment,
                "originalScript": req.original_script,
                "supportPlan": req.support_plan,
                "createdAt": SERVER_TIMESTAMP,
                "updatedAt": SERVER_TIMESTAMP,
                "version": 1,
            }
            doc_ref = ref.add(doc_data)
            return doc_ref[1]  # ドキュメント参照を返す

        doc_ref = exponential_backoff(create_assessment_doc)

        # 作成されたドキュメントを取得
        def get_created_doc():
            return doc_ref.get()

        doc = exponential_backoff(get_created_doc)
        data = doc.to_dict()

        result = AssessmentResponse(
            id=doc.id,
            client_name=data["clientName"],
            assessment=data["assessment"],
            original_script=data.get("originalScript"),
            support_plan=data.get("supportPlan"),
            created_at=data.get("createdAt", datetime.now()),
            updated_at=data.get("updatedAt", datetime.now()),
            version=data.get("version", 1),
        )

        # サジェストを生成して保存
        try:
            suggestion_agent = request.app.state.suggestion_agent
            suggestions = suggestion_agent.generate_suggestions(req.assessment)
            if "error" not in suggestions:
                client_ref = (
                    clients_collection().where(filter=FieldFilter("name", "==", req.client_name.strip())).limit(1)
                )
                client_docs = list(client_ref.stream())
                if client_docs:
                    client_doc_ref = client_docs[0].reference
                    client_doc_ref.update({"suggestion": suggestions})
                    logger.info(f"クライアント {req.client_name} にサジェストを保存しました。")
        except Exception as e:
            logger.error(f"サジェストの保存中にエラーが発生しました: {e}")
            # ここではエラーを発生させず、処理を続行する

        logger.info(f"アセスメントを作成しました: {result.client_name} (ID: {result.id})")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"アセスメント作成エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"アセスメント作成中にエラーが発生しました: {str(e)}")


@router.put("/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment(assessment_id: str, req: AssessmentUpdateRequest, request: Request) -> AssessmentResponse:
    """Update an existing assessment."""
    try:

        def get_existing_assessment():
            ref = assessments_collection().document(assessment_id)
            return ref.get()

        doc = exponential_backoff(get_existing_assessment)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="アセスメントが見つかりません")

        existing_data = doc.to_dict()

        # 更新データの準備
        update_data = {"updatedAt": SERVER_TIMESTAMP, "version": existing_data.get("version", 1) + 1}

        if req.assessment is not None:
            update_data["assessment"] = req.assessment

        if req.support_plan is not None:
            update_data["supportPlan"] = req.support_plan

        # ドキュメントを更新
        def update_doc():
            ref = assessments_collection().document(assessment_id)
            ref.update(update_data)

        exponential_backoff(update_doc)

        # 更新されたドキュメントを取得
        def get_updated_doc():
            ref = assessments_collection().document(assessment_id)
            return ref.get()

        updated_doc = exponential_backoff(get_updated_doc)
        updated_data = updated_doc.to_dict()

        result = AssessmentResponse(
            id=assessment_id,
            client_name=updated_data.get("clientName", ""),
            assessment=updated_data.get("assessment", {}),
            original_script=updated_data.get("originalScript"),
            support_plan=updated_data.get("supportPlan"),
            created_at=updated_data.get("createdAt", datetime.now()),
            updated_at=updated_data.get("updatedAt", datetime.now()),
            version=updated_data.get("version", 1),
        )

        # サジェストを生成して保存
        if req.assessment:
            try:
                suggestion_agent = request.app.state.suggestion_agent
                suggestions = suggestion_agent.generate_suggestions(req.assessment)
                if "error" not in suggestions:
                    client_ref = (
                        clients_collection()
                        .where(filter=FieldFilter("name", "==", updated_data.get("clientName", "")))
                        .limit(1)
                    )
                    client_docs = list(client_ref.stream())
                    if client_docs:
                        client_doc_ref = client_docs[0].reference
                        client_doc_ref.update({"suggestion": suggestions})
                        logger.info(f"クライアント {updated_data.get('clientName', '')} にサジェストを保存しました。")
            except Exception as e:
                logger.error(f"サジェストの保存中にエラーが発生しました: {e}")
                # ここではエラーを発生させず、処理を続行する

        logger.info(f"アセスメントを更新しました: ID {assessment_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"アセスメント更新エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"アセスメント更新中にエラーが発生しました: {str(e)}")


@router.get("/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(assessment_id: str) -> AssessmentResponse:
    """Get a specific assessment by ID."""
    try:

        def get_assessment_doc():
            ref = assessments_collection().document(assessment_id)
            return ref.get()

        doc = exponential_backoff(get_assessment_doc)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="アセスメントが見つかりません")

        data = doc.to_dict()

        result = AssessmentResponse(
            id=assessment_id,
            client_name=data.get("clientName", ""),
            assessment=data.get("assessment", {}),
            original_script=data.get("originalScript"),
            support_plan=data.get("supportPlan"),
            created_at=data.get("createdAt", datetime.now()),
            updated_at=data.get("updatedAt", datetime.now()),
            version=data.get("version", 1),
        )

        logger.info(f"アセスメントを取得しました: ID {assessment_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"アセスメント取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"アセスメント取得中にエラーが発生しました: {str(e)}")
