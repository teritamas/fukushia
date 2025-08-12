from fastapi import FastAPI, HTTPException, Request
import os
from infra.firestore import get_firestore_client
from models.pydantic_models import (
    ActivityReportRequest,
    Memo,
    Task,
    AssessmentMappingRequest,
    SupportPlanRequest,
)
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from agent.gemini import GeminiAgent
import time

load_dotenv()

app = FastAPI()

# CORS設定（React/Next.jsからのリクエストを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番は限定してください
    allow_methods=["*"],
    allow_headers=["*"],
)

# GeminiAgentの初期化
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID")
gemini_agent = GeminiAgent(api_key=GEMINI_API_KEY, google_cse_id=GOOGLE_CSE_ID)

# Firestoreクライアントの初期化
db = get_firestore_client()


def exponential_backoff(func, *args, retries=3, **kwargs):
    delay = 1
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if i == retries - 1:
                raise e
            time.sleep(delay)
            delay *= 2


@app.post("/api/gemini")
async def gemini_api(request: Request):
    data = await request.json()
    text = data.get("text", "")
    assessment_item_name = data.get("assessment_item_name", "")
    user_assessment_items = data.get("user_assessment_items", {})
    result = gemini_agent.analyze(text, assessment_item_name, user_assessment_items)
    return {"result": result}


# --- メモ保存エンドポイント ---
@app.post("/memos/")
async def create_memo(memo: Memo):
    memo_dict = memo.dict()
    now = time.time()
    memo_dict["created_at"] = now
    memo_dict["updated_at"] = now
    doc_ref = db.collection("memos").document()
    doc_ref.set(memo_dict)
    return {"id": doc_ref.id, **memo_dict}


# --- メモ取得エンドポイント（ケース名で絞り込み） ---
@app.get("/memos/{case_name}")
async def get_memos(case_name: str):
    memos_ref = db.collection("memos").where("case_name", "==", case_name)
    docs = memos_ref.stream()
    memos = [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return {"memos": memos}


# --- タスク保存エンドポイント ---


@app.post("/tasks/")
async def create_task(task: Task):
    task_dict = task.dict()
    now = time.time()
    task_dict["created_at"] = now
    task_dict["updated_at"] = now
    doc_ref = db.collection("tasks").document()
    doc_ref.set(task_dict)
    return {"id": doc_ref.id, **task_dict}


# --- タスク取得エンドポイント（ケース名で絞り込み） ---
@app.get("/tasks/{case_name}")
async def get_tasks(case_name: str):
    tasks_ref = db.collection("tasks").where("case_name", "==", case_name)
    docs = tasks_ref.stream()
    tasks = [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return {"tasks": tasks}


# --- 活動報告書生成エンドポイント ---
@app.post("/reports/activity/")
async def generate_activity_report(req: ActivityReportRequest):
    # Geminiで活動報告書を生成
    def call_gemini():
        return gemini_agent.generate_activity_report(req.case_name, req.memos, req.tasks)

    try:
        report = exponential_backoff(call_gemini)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")
    return {"report": report}


# --- アセスメント項目取得エンドポイント ---
@app.get("/assessment_items/")
async def get_assessment_items():
    """
    Firestoreからアセスメント項目を取得するエンドポイント。
    """
    try:
        # created_atでソートして取得
        items_ref = db.collection("assessment_items").order_by("created_at")
        docs = items_ref.stream()
        items = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return {"assessment_items": items}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"アセスメント項目の取得中にエラーが発生しました: {str(e)}",
        )


# --- アセスメントマッピングエンドポイント ---
@app.post("/assessment/map/")
async def map_assessment(req: AssessmentMappingRequest):
    """
    面談記録を解析し、アセスメント項目にマッピングするエンドポイント。
    """
    try:
        mapped_data = gemini_agent.map_to_assessment_items(req.text_content, req.assessment_items)
        return mapped_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"アセスメントマッピング中にエラーが発生しました: {str(e)}",
        )


# --- 支援計画生成エンドポイント ---
@app.post("/support-plan/generate/")
async def generate_support_plan(req: SupportPlanRequest):
    """
    アセスメント情報を基に支援計画を生成するエンドポイント。
    """
    try:
        plan = gemini_agent.generate_support_plan_with_agent(req.assessment_data)
        return {"plan": plan}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"支援計画の生成中にエラーが発生しました: {str(e)}",
        )
