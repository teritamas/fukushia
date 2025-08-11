from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime
import uuid
import os
import httpx
import asyncio
import json
from .pydantic_models import MemoCreate, MemoResponse, ActivityReportRequest, ActivityReportResponse

app = FastAPI()

db = []  # In-memory storage for demonstration

async def save_memo_to_db(memo: MemoResponse):
    db.append(memo)
    print(f"Memo saved to DB: {memo.id}")

async def get_memos_from_db(case_name: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[MemoResponse]:
    filtered_memos = [m for m in db if m.case_name == case_name]
    if start_date:
        filtered_memos = [m for m in filtered_memos if m.timestamp >= start_date]
    if end_date:
        filtered_memos = [m for m in filtered_memos if m.timestamp <= end_date]
    return filtered_memos

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent"

async def call_gemini_api(prompt_text: str, schema: Optional[Dict] = None):
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}]
    }
    if schema:
        payload["generationConfig"] = {
            "responseMimeType": "application/json",
            "responseSchema": schema
        }
    max_retries = 5
    base_delay = 1
    for i in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(f"{GEMINI_API_URL}?key={GEMINI_API_KEY}", headers=headers, json=payload, timeout=60)
                response.raise_for_status()
                result = response.json()
                if result.get('candidates') and result['candidates'][0].get('content') and result['candidates'][0]['content'].get('parts'):
                    response_text = result['candidates'][0]['content']['parts'][0]['text']
                    if schema:
                        return response_text
                    return response_text
                else:
                    raise ValueError("Unexpected Gemini API response structure")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and i < max_retries - 1:
                delay = base_delay * (2 ** i)
                print(f"Rate limit exceeded. Retrying in {delay} seconds...")
                await asyncio.sleep(delay)
            else:
                raise HTTPException(status_code=e.response.status_code, detail=f"Gemini API error: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to call Gemini API: {str(e)}")
    raise HTTPException(status_code=500, detail="Gemini API call failed after multiple retries.")

@app.post("/memos/", response_model=MemoResponse)
async def create_memo(memo_data: MemoCreate, supporter_name: str = "佐藤 花子"):
    prompt_for_analysis = f"""
    以下の活動メモの内容を分析し、JSON形式でタスク、支払い情報、関連情報を抽出してください。
    タスクは「TODO:」「要確認:」などの明確な指示だけでなく、内容から推測される必要な行動も抽出してください。
    支払い情報は「入金」「支出」を区別し、日付、項目、金額を特定してください。
    関連情報は、支援対象者の状況、健康、金銭管理、社会関係、住居環境、利用サービスなど、アセスメントや今後の支援に役立つ重要なキーワードや概念を抽出してください。

    メモ:
    {memo_data.content}

    JSON形式の出力例:
    {{
        "tasks": [
            {{"description": "具体的なタスク内容", "due_date_hint": "期限のヒント (例: 来週中, 早急に)"}}
        ],
        "payments": [
            {{"date": "MM/DD", "item": "項目", "amount": 金額, "type": "入金"|"支出"}}
        ],
        "related_info": [
            "キーワード1", "キーワード2"
        ]
    }}
    """
    analysis_schema = {
        "type": "OBJECT",
        "properties": {
            "tasks": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "description": {"type": "STRING"},
                        "due_date_hint": {"type": "STRING"}
                    }
                }
            },
            "payments": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "date": {"type": "STRING"},
                        "item": {"type": "STRING"},
                        "amount": {"type": "NUMBER"},
                        "type": {"type": "STRING", "enum": ["入金", "支出"]}
                    }
                }
            },
            "related_info": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            }
        },
        "required": ["tasks", "payments", "related_info"]
    }
    try:
        ai_analysis_raw = await call_gemini_api(prompt_for_analysis, schema=analysis_schema)
        ai_analysis = json.loads(ai_analysis_raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")
    new_memo = MemoResponse(
        id=str(uuid.uuid4()),
        case_name=memo_data.case_name,
        content=memo_data.content,
        timestamp=datetime.utcnow(),
        supporter_name=supporter_name,
        tasks=ai_analysis.get("tasks", []),
        payments=ai_analysis.get("payments", []),
        related_info=ai_analysis.get("related_info", [])
    )
    await save_memo_to_db(new_memo)
    return new_memo

@app.get("/memos/{case_name}", response_model=List[MemoResponse])
async def get_memos(case_name: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None):
    memos = await get_memos_from_db(case_name, start_date, end_date)
    return memos
@app.post("/reports/activity/", response_model=ActivityReportResponse)
async def generate_activity_report(report_req: ActivityReportRequest):
    # 期間内のメモを取得
    memos_in_period = await get_memos_from_db(report_req.case_name, report_req.start_date, report_req.end_date)
    
    if not memos_in_period:
        raise HTTPException(status_code=404, detail="指定された期間内にメモが見つかりませんでした。")

    # メモの内容を結合 (AIが解析しやすいように生のまま結合)
    combined_memo_raw_content = "\n".join([m.content for m in memos_in_period])

    # 支払い情報を整形して文字列にする
    all_payments = []
    for m in memos_in_period:
        all_payments.extend(m.payments)

    # 日付でソート（MM/DD形式を考慮）
    all_payments.sort(key=lambda p: (int(p['date'].split('/')[0]), int(p['date'].split('/')[1])))

    formatted_payments_list = []
    for p in all_payments:
        # 金額をカンマ区切りでフォーマット
        amount_formatted = f"{p['amount']:,}" 
        formatted_payments_list.append(f"{p['date']}: {p['item']} {amount_formatted}円 ({p['type']})")
    
    payments_summary_str = "\n".join(formatted_payments_list)
    if not payments_summary_str:
        payments_summary_str = "支払い情報は検出なし。" # 簡潔な表現に変更


    # AIへのプロンプト作成 - フォーマットを明確に指示
    report_prompt = f"""
以下の活動メモと支払い情報から、利用者 {report_req.case_name} の活動報告書を日本語で作成せよ。
**厳密に以下のフォーマットとトーン（だ・である調または体言止め、簡潔）に従って出力せよ。**
セクションのヘッダーにMarkdownのマークアップは使用しないこと。
報告書全体で、要約や導入となる一文（例:「期間中の収入と支出の概要は以下の通りです。」）は含めないこと。

活動報告書（{report_req.case_name}）

作成日: {datetime.now().strftime('%Y/%m/%d %H:%M')}

【期間中の主要な活動】
---
活動メモの内容を時系列でまとめ、箇条書きで記述する。
**各活動の冒頭には必ずその活動時期（例: MM/DD）を明記すること。**
各項目は簡潔に「だ・である」調、または体言止めで表現する。
{combined_memo_raw_content}
---

【金銭管理状況（{report_req.case_name}）】
{payments_summary_str}

【特記事項・課題】
メモから読み取れる利用者の現在の課題や特筆すべき状況を箇条書きで記述する。「だ・である」調、または体言止めで簡潔に表現する。
{', '.join([info for m in memos_in_period for info in m.related_info])}

【今後の支援方針】
利用者 {report_req.case_name} の現在の状況と課題に基づき、今後の支援で注力すべき点や継続的な支援の方向性を箇条書きで提案する。「だ・である」調、または体言止めで表現する。
上記はAIがメモの内容を元に作成したドラフトである。
    """
    try:
        generated_report = await call_gemini_api(report_prompt)
        return ActivityReportResponse(report_content=generated_report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"活動報告書の生成に失敗しました: {str(e)}")
    # 期間内のメモを取得
    memos_in_period = await get_memos_from_db(report_req.case_name, report_req.start_date, report_req.end_date)
    
    if not memos_in_period:
        raise HTTPException(status_code=404, detail="指定された期間内にメモが見つかりませんでした。")

    # メモの内容を結合
    combined_memo_content = "\n".join([m.content for m in memos_in_period])

    # 支払い情報を整形して文字列にする
    all_payments = []
    for m in memos_in_period:
        all_payments.extend(m.payments)

    # 日付でソート（MM/DD形式を考慮）
    all_payments.sort(key=lambda p: (int(p['date'].split('/')[0]), int(p['date'].split('/')[1])))

    formatted_payments_list = []
    for p in all_payments:
        # 金額をカンマ区切りでフォーマット
        amount_formatted = f"{p['amount']:,}" 
        formatted_payments_list.append(f"{p['date']}: {p['item']} {amount_formatted}円 ({p['type']})")
    
    payments_summary_str = "\n".join(formatted_payments_list)
    if not payments_summary_str:
        payments_summary_str = "支払い情報は検出されませんでした。"


    # AIへのプロンプト作成 - フォーマットを明確に指示
    report_prompt = f"""
以下の活動メモと支払い情報から、利用者 {report_req.case_name} の活動報告書を日本語で作成してください。
**厳密に以下のフォーマットに従って出力してください。**

活動報告書（利用者 {report_req.case_name}）

作成日: {datetime.now().strftime('%Y/%m/%d %H:%M')}

【期間中の主要な活動】
---
{combined_memo_content.replace('\n', '\n・').strip()}
---

【金銭管理状況（利用者 {report_req.case_name}）】
期間中の収入と支出の概要です。

{payments_summary_str}

【特記事項・課題】
{', '.join([info for m in memos_in_period for info in m.related_info])}

【今後の支援方針】
利用者 {report_req.case_name} の現在の状況と課題に基づき、今後の支援方針を簡潔に箇条書きで記述してください。

上記はAIがメモの内容を元に作成したドラフトです。
    """
    try:
        generated_report = await call_gemini_api(report_prompt)
        return ActivityReportResponse(report_content=generated_report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"活動報告書の生成に失敗しました: {str(e)}")