import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from typing import Literal

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class AgentRoute(BaseModel):
    """ユーザーのメッセージに応じて、次に呼び出すべきエージェントを判断します。"""

    next_agent: Literal["support_plan", "conversational"] = Field(
        ..., description="ユーザーのメッセージ内容に基づいて、次に呼び出すべきエージェントを選択します。"
    )


ROUTER_PROMPT = """
あなたは、ユーザーからのメッセージを分析し、その意図に応じて最適なAIエージェントに処理を振り分けるルーターです。

ユーザーからのメッセージ:
{input}

上記のメッセージは、以下のどちらの意図に近いですか？

1. **支援提案 (support_plan)**:
   - 利用可能な社会資源、制度、サービスに関する具体的な提案を求めている
   - 「〇〇な制度を教えて」「どういう支援が受けられる？」といった、解決策の提示を期待する質問

2. **会話 (conversational)**:
   - 制度や支援策に関する単純な質問（例：「〇〇制度って何ですか？」）
   - 挨拶、相槌、感情的な応答など、一般的な対話
   - 提案された支援策に対する深掘りの質問や、手続きに関する質問

{format_instructions}
"""


class RouterAgent:
    def __init__(self, api_key: str):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=api_key,
        )
        self.parser = PydanticOutputParser(pydantic_object=AgentRoute)
        self.prompt = PromptTemplate(
            template=ROUTER_PROMPT,
            input_variables=["input"],
            partial_variables={"format_instructions": self.parser.get_format_instructions()},
        )
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt)

    async def route(self, message: str) -> AgentRoute:
        try:
            output = await self.chain.ainvoke({"input": message})
            parsed_output = self.parser.parse(output["text"])
            return parsed_output
        except Exception as e:
            logging.error(f"ルーティングエラー: {e}", exc_info=True)
            # デフォルトでは会話エージェントにフォールバック
            return AgentRoute(next_agent="conversational")
