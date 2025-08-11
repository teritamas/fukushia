from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from agent.gemini import GeminiAgent
from dotenv import load_dotenv
import os

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
gemini_agent = GeminiAgent(GEMINI_API_KEY)

@app.post("/api/gemini")
async def gemini_api(request: Request):
    data = await request.json()
    text = data.get("text", "")
    assessment_item_name = data.get("assessment_item_name", "")
    user_assessment_items = data.get("user_assessment_items", {})
    result = gemini_agent.analyze(text, assessment_item_name, user_assessment_items)
    return {"result": result}