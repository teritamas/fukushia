from langchain.agents import Tool
from config import RAG_PROJECT_ID, RAG_LOCATION, RAG_CORPUS_RESOURCE, RAG_MODEL
from utils.auth.google_credentials import get_google_service_account_credentials
from google import genai
from google.genai import types


def create_suggest_resources_tool() -> Tool:
    """
    Return a LangChain Tool that queries Vertex RAG Store for relevant policies/services.
    """

    def rag_suggest(situation: str) -> str:
        # Build explicit credentials from FIREBASE_SERVICE_ACCOUNT and pass to Client
        # (falls back to ADC if building fails or is omitted)
        creds = get_google_service_account_credentials()
        if creds is None:
            return "(ERROR) RAG検索でエラーが発生しました: 認証情報が取得できませんでした。"
        client = genai.Client(vertexai=True, project=RAG_PROJECT_ID, location=RAG_LOCATION, credentials=creds)

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(
                        text=(
                            "以下の利用者状況に適した日本の公的制度・自治体サービス・社会資源を検索し、"
                            "上位の関連情報をもとに日本語で簡潔に要約してください。"
                            "提供主体（国/都道府県/市区町村/機関）・主要な対象/条件・問い合わせ先の手掛かりも含めてください。\n\n"
                            f"【利用者状況】\n{situation}\n\n"
                            "出力形式:\n"
                            "- 推奨制度候補: 箇条書き (件名: 要約 – 主な条件/対象/連絡先の手掛かり)\n"
                            "- 根拠情報(任意): 箇条書き (出典名や要旨)\n"
                        )
                    ),
                ],
            )
        ]

        tools = [
            types.Tool(
                retrieval=types.Retrieval(
                    vertex_rag_store=types.VertexRagStore(
                        rag_resources=[types.VertexRagStoreRagResource(rag_corpus=RAG_CORPUS_RESOURCE)],
                        similarity_top_k=20,
                    )
                )
            )
        ]

        cfg = types.GenerateContentConfig(
            temperature=0.7,
            top_p=0.95,
            max_output_tokens=2048,
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_MEDIUM_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
            ],
            tools=tools,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        try:
            resp = client.models.generate_content(model=RAG_MODEL, contents=contents, config=cfg)
            if not resp or not getattr(resp, "candidates", None):
                return "(NO_RESULT) 候補が取得できませんでした。クエリを具体化してください。"
            texts: list[str] = []
            for c in resp.candidates:
                content = getattr(c, "content", None)
                parts = getattr(content, "parts", []) if content else []
                for p in parts:
                    t = getattr(p, "text", None)
                    if t:
                        texts.append(t)
            return "\n".join(texts).strip() or "(NO_RESULT) 返答テキストが空でした。"
        except Exception as e:
            return f"(ERROR) RAG検索でエラーが発生しました: {e}"

    return Tool(
        name="suggest_resources",
        func=rag_suggest,
        description="RAG(Vertex AI)で状況・困りごと・地域に合う制度/資源を検索・要約する。",
    )
