import json
import logging
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

CONVERSATIONAL_PROMPT = """
あなたは、利用者との対話をサポートする親切なAIアシスタントです。
利用者の状況やアセスメント情報を踏まえ、共感的で分かりやすい言葉で応答を生成してください。

### 指示
- 質問には簡潔かつ的確に答える
- 利用者の感情に配慮し、寄り添う姿勢を示す
- 専門用語は避け、平易な言葉で説明する

### 会話履歴
{chat_history}

### 利用者の状況
{context}

### ユーザーからのメッセージ
{input}

### 応答
"""


class ConversationalAgent:
    def __init__(self, api_key: str):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=api_key,
        )
        self.prompt = PromptTemplate.from_template(CONVERSATIONAL_PROMPT)
        self.chain = self.prompt | self.llm

    async def generate_response_stream(
        self,
        client_name: str,
        assessment_data: dict,
        message: str,
        chat_history: list = [],
    ):
        context = json.dumps(assessment_data, ensure_ascii=False, indent=2)[:8000]
        history_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history])

        try:

            async def stream_generator():
                try:
                    async for chunk in self.chain.astream(
                        {
                            "input": message,
                            "context": f"利用者: {client_name}\n状況: {context}",
                            "chat_history": history_str,
                        }
                    ):
                        data = f"data: {json.dumps({'chunk': chunk.get('text', '')}, ensure_ascii=False)}\n\n"
                        yield data
                    yield "event: done\ndata: [DONE]\n\n"
                except Exception as e:
                    logging.error(f"stream_generator error: {e}", exc_info=True)
                    yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

            return stream_generator()
        except Exception as e:
            logging.error(f"会話応答生成失敗: {e}", exc_info=True)

            async def err_gen():
                yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

            return err_gen()
