import json
import logging
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools.render import render_text_description
from langchain.prompts import PromptTemplate
from typing import Optional
from models.pydantic_models import Client

from agent.prompts.conversational_agent import CONVERSATIONAL_AGENT_PROMPT
from agent.tools.rag_search_social_support_tool import create_rag_search_social_support_tool
from agent.tools.google_search_tool import create_google_search_tool

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class InteractiveSupportPlanAgent:
    def __init__(
        self,
        api_key: str,
        google_cse_id: str = None,
    ):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=api_key,
        )

        # --- Tools ---
        google_search_tool = create_google_search_tool(api_key, google_cse_id)
        search_rag_social_support_tool = create_rag_search_social_support_tool()

        tools = [google_search_tool, search_rag_social_support_tool]

        conversational_prompt = PromptTemplate.from_template(CONVERSATIONAL_AGENT_PROMPT).partial(
            tools=render_text_description(tools),
            tool_names=", ".join([t.name for t in tools]),
        )
        conversational_agent_core = create_react_agent(self.llm, tools, conversational_prompt)
        self.conversational_agent = AgentExecutor(
            agent=conversational_agent_core,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,  # 無限ループを防ぐ
        )

    async def generate_interactive_support_plan_stream(
        self,
        client_name: str,
        assessment_data: dict,
        message: str,
    ):
        """
        会話型エージェントで、ユーザーの質問・会話に自然な文章で答える。

        この関数は非同期ジェネータを返すため、FastAPI等でStreamingResponseとして利用できます。
        """
        context = json.dumps(assessment_data, ensure_ascii=False, indent=2)[:8000]
        conv_input = f"利用者: {client_name}\n状況: {context}\n質問: {message}".replace("ClientName", client_name)
        try:

            async def stream_generator():
                try:
                    final_answer = ""
                    async for event in self.conversational_agent.astream_events({"input": conv_input}):
                        if event["event"] == "on_agent_finish":
                            final_answer = event["data"]["output"]
                            # 最終的な回答からTask行を除外
                            lines = final_answer.split("\n")
                            cleaned_lines = [line for line in lines if not line.strip().startswith("Task:")]
                            cleaned_answer = "\n".join(cleaned_lines)
                            # 整形された回答を送信
                            data = f"data: {json.dumps({'chunk': cleaned_answer}, ensure_ascii=False)}\n\n"
                            yield data
                        elif event["event"] == "on_chat_model_stream":
                            chunk = event["data"]["chunk"]
                            if hasattr(chunk, "content"):
                                # AIMessageChunkの場合
                                content = chunk.content
                                if content:
                                    data = f"data: {json.dumps({'chunk': content}, ensure_ascii=False)}\n\n"
                                    yield data
                            else:
                                # 通常の文字列の場合
                                if chunk:
                                    data = f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                                    yield data
                        await asyncio.sleep(0.01)
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

    def summarize_for_resource_match(
        self, assessment_text: str, client: Optional[Client] = None, resource_context: Optional[str] = None
    ) -> str:
        """
        与えられたアセスメントテキストと社会資源の情報を基に、マッチングに適した要約や提案理由を生成する
        """
        client_info = ""
        if client and client.name:
            client_info = f"クライアントは {client.name} さんです。"

        if resource_context:
            # 資源情報がある場合は、要件マッチングと提案理由の生成を行う
            prompt = f"""
            あなたはケアマネージャーとして、クライアントの情報と社会資源の利用要件を比較し、その資源がクライアントに適しているか判断してください。

            クライアント情報:
            ---
            {assessment_text[:4000]}
            ---

            社会資源の情報:
            ---
            {resource_context[:4000]}
            ---

            上記の情報を基に、以下のJSON形式で回答してください。
            1. `is_match`: (boolean) クライアントが資源の利用要件を満たしている可能性が高い場合はtrue、低い場合はfalse。
            2. `reason`: (string) 判断理由を具体的に記述してください。要件のどの部分がクライアントの状況と合致するか、またはしないかを明確に言及してください。
            3. `task_suggestion`: (string, optional) 要件の確認が必要な場合や、申請手続きに関する具体的な次のアクションをタスクとして提案してください。

            JSON:
            """
        else:
            # 資源情報がない場合は、従来通りの要約を生成する
            prompt = f"""
            以下のテキストは、あるクライアントに関するアセスメント情報です。
            この情報から、利用可能な社会資源や制度を探すために最も重要となるキーワードや状況を抽出し、簡潔な要約を作成してください。
            {client_info}

            アセスメント情報:
            ---
            {assessment_text[:8000]}
            ---

            要約:
            """
        try:
            response = self.llm.invoke(prompt.strip())
            return response.content
        except Exception as e:
            logging.error(f"summarize_for_resource_match failed: {e}", exc_info=True)
            if resource_context:
                return json.dumps(
                    {
                        "is_match": False,
                        "reason": "AIによる判定中にエラーが発生しました。",
                        "task_suggestion": "手動で要件を確認してください。",
                    }
                )
            # fallback to simple text extraction
            return assessment_text[:2000]
