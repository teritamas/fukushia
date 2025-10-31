import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools.render import render_text_description
from langchain.prompts import PromptTemplate

from agent.prompts.task_execution_agent import TASK_EXECUTION_AGENT_PROMPT
from agent.tools.google_search_tool import create_google_search_tool

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class TaskExecutionAgent:
    def __init__(self, api_key: str, google_cse_id: str):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=api_key,
        )

        tools = [create_google_search_tool(api_key, google_cse_id)]

        prompt = PromptTemplate.from_template(TASK_EXECUTION_AGENT_PROMPT).partial(
            tools=render_text_description(tools),
            tool_names=", ".join([t.name for t in tools]),
        )

        agent_core = create_react_agent(self.llm, tools, prompt)
        self.agent_executor = AgentExecutor(
            agent=agent_core,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,
        )

    async def execute_task(self, task: str) -> str:
        """
        与えられたタスクを実行し、結果を文字列として返す。
        """
        try:
            response = await self.agent_executor.ainvoke({"input": task})
            return response.get("output", "処理中にエラーが発生しました。")
        except Exception as e:
            logging.error(f"タスク実行エージェントでエラー: {e}", exc_info=True)
            return f"エラーが発生しました: {e}"
