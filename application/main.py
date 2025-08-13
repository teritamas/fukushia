import os
import uvicorn
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from contextlib import asynccontextmanager
from agent.gemini import GeminiAgent
from pydantic import BaseModel
import time
import functools
import random
from google.cloud import firestore  # Add this import
from fastapi import FastAPI, HTTPException, Request
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from agent.gemini import GeminiAgent

# AssessmentMappingRequestモデルの定義
class AssessmentMappingRequest(BaseModel):
    text_content: str
    assessment_items: list

# Firestoreクライアントの初期化
db = firestore.Client()

# .envファイルから環境変数を読み込む
load_dotenv()

# 環境変数からAPIキーを取得
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID")

# loggingの設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリケーション起動時に実行
    logger.info("アプリケーションを起動します...")
    if not GEMINI_API_KEY or not GOOGLE_CSE_ID:
        raise ValueError("APIキーまたはCSE IDが設定されていません。")
    
    # GeminiAgentを初期化してapp.stateに格納
    app.state.gemini_agent = GeminiAgent(
        api_key=GEMINI_API_KEY, google_cse_id=GOOGLE_CSE_ID
    )
    logger.info("GeminiAgentの初期化が完了しました。")
    yield
    # アプリケーション終了時に実行
    logger.info("アプリケーションをシャットダウンします...")


app = FastAPI(lifespan=lifespan)
# CORS設定（React/Next.jsからのリクエストを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境ではより厳密な設定を推奨
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Exponential Backoff Utility ---
def exponential_backoff(func, max_attempts=5, initial_delay=1, max_delay=16):
    """
    指定した関数を指数バックオフで再試行するユーティリティ関数。
    """
    delay = initial_delay
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            if attempt == max_attempts - 1:
                raise
            time.sleep(delay + random.uniform(0, 0.5))
            delay = min(delay * 2, max_delay)
# Firestoreクライアントの初期化
db = firestore.Client()

# Memoモデルの定義
class Memo(BaseModel):
    case_name: str
    content: str
    # 必要に応じて他のフィールドを追加

# Taskモデルの定義
class Task(BaseModel):
    case_name: str
    description: str
    # 必要に応じて他のフィールドを追加


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


# --- メモ取得エンドポイント ---
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


# ActivityReportRequestモデルの定義
class ActivityReportRequest(BaseModel):
    case_name: str
    memos: list
    tasks: list

# --- 活動報告書生成エンドポイント ---
@app.post("/reports/activity/")
async def generate_activity_report(req: ActivityReportRequest):
    # Geminiで活動報告書を生成
    def call_gemini():
        gemini_agent: GeminiAgent = app.state.gemini_agent
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
async def map_assessment(req: AssessmentMappingRequest, request: Request):
    """
    面談記録を解析し、アセスメント項目にマッピングするエンドポイント。
    """
    gemini_agent: GeminiAgent = request.app.state.gemini_agent
    try:
        mapped_data = gemini_agent.map_to_assessment_items(req.text_content, req.assessment_items)
        return mapped_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"アセスメントマッピング中にエラーが発生しました: {str(e)}",
        )


# SupportPlanRequestモデルの定義
class SupportPlanRequest(BaseModel):
    assessment_data: dict  # 必要に応じて型やフィールドを調整

# --- 支援計画生成エンドポイント ---
@app.post("/support-plan/generate/")
async def generate_support_plan(req: SupportPlanRequest, request: Request):
    """
    アセスメント情報を基に支援計画を生成するエンドポイント。
    """
    gemini_agent: GeminiAgent = request.app.state.gemini_agent
    try:
        plan = gemini_agent.generate_support_plan_with_agent(req.assessment_data)
        return {"plan": plan}
    except Exception as e:
        logger.error(f"支援計画の生成中にエラーが発生しました: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"支援計画の生成中にエラーが発生しました: {str(e)}",
        )


# if __name__ == "__main__":
#     # Windowsでのリロード問題を避けるため、reload_dirsを指定
#     uvicorn.run(
#         "main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=True,
#         reload_dirs=["application"],
#     )