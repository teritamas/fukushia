import google.generativeai as genai
from services.utils import relative_date_tool
from agent.natural_language_processor import NaturalLanguageProcessor
import json
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import Tool, initialize_agent, AgentType
from langchain_google_community import GoogleSearchAPIWrapper
from pydantic.v1 import BaseModel, Field

# loggingの設定
logging.basicConfig(level=logging.INFO)


# 1. 支援者情報抽出エージェントが生成するJSONの型を定義
class SupporterInfo(BaseModel):
    name: str = Field(description="氏名")
    age: int = Field(description="年齢")
    concerns: str = Field(description="困りごと")
    judgment_ability: str = Field(description="判断能力")
    service_usage_status: str = Field(description="福祉サービスの利用状況")


class GeminiAgent:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-1.5-flash",
        google_cse_id: str = None,
        relative_date_tool_arg=None,
    ):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        if relative_date_tool_arg is not None:
            self.relative_date_tool = relative_date_tool_arg
        else:
            self.relative_date_tool = relative_date_tool
        self.nlp_processor = NaturalLanguageProcessor()

        # --- エージェントの定義 ---
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash", google_api_key=api_key)

        # 1. 支援者情報抽出エージェント (ツール不要、JSON出力に特化)
        self.information_extraction_agent = self.llm.with_structured_output(
            SupporterInfo)

        # 2. 支援計画立案エージェント (検索ツールを利用)
        search = GoogleSearchAPIWrapper(
            google_api_key=api_key, google_cse_id=google_cse_id)
        tools = [
            Tool(
                name="Google Search",
                func=search.run,
                description="useful for when you need to answer questions about current events or find up-to-date information on services, resources, or specific topics related to social work and client support.",
            )
        ]
        self.support_plan_creation_agent = initialize_agent(
            tools, self.llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, verbose=True, return_intermediate_steps=True, handle_parsing_errors=True)

    def _extract_supporter_information(self, assessment_text: str) -> dict:
        """
        支援者情報抽出エージェントを実行する
        """
        prompt = f"""
        以下の支援者アセスメント情報から、困りごと、判断能力、福祉サービスの利用状況を抽出し、JSON形式で出力してください。
        必ず、与えられた情報から情報を抽出してください。
        与えられた情報から判定できない場合は、該当項目を「不明」としてください。

        --- 支援者アセスメント情報 ---
        {assessment_text}
        -----------------------------
        """
        try:
            logging.info("--- Running Information Extraction Agent ---")
            structured_data = self.information_extraction_agent.invoke(prompt)
            logging.info(
                f"--- Extracted Information: {structured_data.dict()} ---")
            # todo この部分をDBから取得するようにする
            return {
            "住居形態": "該当なし",
            "住民票": "該当なし",
            "同居状況": "該当なし",
            "性別": "男性",
            "氏名": "佐藤健",
            "現住所": "山形県南陽市",
            "生年月日": "1950年10月10日",
            "電話番号": "該当なし",
            **structured_data.dict()
            }
        
        except Exception as e:
            logging.error(f"Information Extraction Agent execution error: {e}")
            raise

    def _create_support_plan(self, assessment_data, supporter_info: dict, guidelines: str) -> str:
        """
        支援計画立案エージェントを実行する
        """
        supporter_info_text = json.dumps(
            supporter_info, indent=2, ensure_ascii=False)

        prompt = f"""
        あなたは非常に優秀で経験豊富なケースワーカーです。あなたの役割は、相談者の問題解決を支援し、利用可能な公的制度や福祉サービスへ繋げることです。以下の情報に基づき、最高の支援計画を作成してください。

        **思考プロセス:**
        1.  **相談者情報の熟読**: 相談者の氏名、年齢、住所、現在の「困りごと」、サービスの利用状況を正確に把握します。特に「住所」と「困りごと」が重要です。
        2.  **課題の分析と特定**: 「困りごと」（例：「仕事がなく収入が不安定」「金銭管理ができない」）から、解決すべき具体的な課題を明確にします。
        3.  **検索クエリの生成**: 課題解決に必要な公的制度や福祉サービスを見つけるため、具体的で効果的な検索クエリを**最低10個以上**考えます。必ず地名（市区町村名）を含め、多角的な視点（制度名、課題、施設名など）でクエリを作成します。
            -   例：`「南陽市 生活困窮者自立支援制度」` `「南陽市 ハローワーク 求人」` `「南陽市 社会福祉協議会 貸付」` `「南陽市 認知症 相談窓口」` `「南陽市 地域包括支援センター」` `「山形県 精神保健福祉センター」` `「南陽市 訪問介護事業所」` `「南陽市 日常生活自立支援事業」` `「南陽市 配食サービス」` `「南陽市 腰痛 専門医」`
        4.  **Google Searchの実行**: 生成したクエリでGoogle Searchツールを使い、**最低10回以上検索を実行**し、徹底的に情報を収集します。公的機関の公式サイトを中心に、情報の正確性を高めます。
        5.  **情報の整理と分析**: 収集した情報から、以下の点を整理します。
            -   **制度/サービス/機関の固有名詞**: `「ハローワーク長井」` `「南陽市社会福祉協議会」` `「南陽市役所 福祉課」`など。
            -   **具体的な支援内容**: 何をしてくれるのか。
            -   **利用条件・手続き**: 対象者、料金、申請方法、必要書類など。
            -   **連絡先、所在地、URL**: 電話番号、住所、公式サイトのURL。
        6.  **支援の選定と理由の明確化**: 収集した情報を基に、「提案する支援」と「検討したが不採用とした支援」に分類します。それぞれの「選定理由」「不採用理由」を明確に言語化します。
        7.  **支援計画の具体化**: 分析した情報に基づき、支援計画の「具体的な支援内容」を記述します。**抽象的な表現（「関係機関と連携する」など）は絶対に使わず**、固有名詞と具体的なアクションを記述します。
            -   良い例：`「ハローワーク長井に来所予約の電話をし、初回相談に同行する。生活福祉資金の申請も視野に入れ、南陽市社会福祉協議会に相談の予約を入れる。」`
            -   悪い例：`「就労支援サービスの情報提供を行う。」`
        8.  **対象可否の判断**: ガイドラインと相談者の状況を照らし合わせ、事業の対象となるか判断し、理由を記述します。
        9.  **最終出力の生成**: 全ての情報を指定されたJSON形式にまとめます。**【要確認タスク】は、検索しても情報が不足した場合の最終手段**とし、安易に使用しません。
        10. **出力の確認**: 出力内容がガイドラインに沿っているか、固有名詞や具体的なアクションが含まれているかを再確認します。

        **最重要指示:**
        - **固有名詞の徹底**: 提案する制度や機関は、必ず`Google Search`で探し出した**固有名詞（ハローワーク長井、南陽市社会福祉協議会など）**を記載してください。
        - **具体的アクション**: 「情報提供」「連携」で終わらせず、「電話する」「同行する」「申請を支援する」など、具体的なアクションを記述してください。
        - **JSON形式の厳守**: **最終的な回答は、以下のJSON形式の文字列のみを出力してください。**前後に説明文などをつけないでください。

        **タスク:**
        1.  **支援計画の作成**: 相談者の具体的な困りごとに対応する形で、公的制度や福祉サービス利用に繋げるための具体的な支援計画を提案してください。

        **出力JSON形式:**
        ```json
        {{
          "支援計画": {{
            "判断軸": "（例：本人の意思を尊重し、経済的自立と地域での安定した生活の確立を最優先とする）",
            "支援計画の根拠": "（例：失職により収入が途絶え、家賃の支払いに窮している状況。本人の就労意欲は高いが、心身の不調も見られるため、生活再建と健康回復を並行して支援する必要があると判断した。）",
            "目標": "（例：安定した収入の確保と生活基盤の再建）",
            "具体的な支援内容": [
              {{
                "支援項目": "（例：就労による収入確保）",
                "サービス内容": "（例：調査結果に基づき、ハローワーク長井へ同行し、求職登録と職業相談を行う。同時に、南陽市シルバー人材センターに登録し、短期的な仕事を探す。）",
                "実施期間": "（例：契約締結後1ヶ月以内）",
                "担当": "（例：ケースワーカー）"
              }},
              {{
                "支援項目": "（例：当面の生活維持）",
                "サービス内容": "（例：調査結果に基づき、南陽市社会福祉協議会に同行し、生活福祉資金（緊急小口資金）の申請手続きを支援する。）",
                "実施期間": "（例：契約締結後速やかに）",
                "担当": "（例：ケースワーカー）"
              }}
            ],
            "備考": "（【要確認タスク】緊急小口資金の申請に必要な住民票の取得方法を本人に確認する。など、どうしても確認が必要な事項のみ記述）"
          }},
          "調査結果": {{
            "採用したサービス": [
              {{
                "サービス名": "（例：ハローワーク長井）",
                "概要": "（例：公共職業安定所。求人情報の提供、職業相談、紹介状の発行など）",
                "選定理由": "（例：本人の就労意欲が高く、多様な求人情報へのアクセスが不可欠なため。専門の相談員による個別支援が期待できる。）",
                "所在地": "（例：山形県長井市ままの上7-8）",
                "連絡先": "（例：0238-84-2131）",
                "URL": "（例：https://jsite.mhlw.go.jp/yamagata-hellowork/list/nagai.html）"
              }}
            ],
            "検討したが不採用としたサービス": [
              {{
                "サービス名": "（例：株式会社〇〇（民間の有料職業紹介所））",
                "概要": "（例：IT専門職に特化した転職エージェント）",
                "不採用理由": "（例：本人の職務経験や希望と合致しないため。また、利用料金が発生する点も、現在の経済状況では負担が大きいと判断した。）",
                "所在地": "（例：東京都千代田区丸の内1-1-1）",
                "連絡先": "（例：03-1234-5678）",
                "URL": "（例：https://example.com）"
              }}
            ]
          }}
        }}
        ```
        --- 支援者基本情報 ---
        {supporter_info_text}
        --------------------
        --- 支援者アセスメント情報 ---
        {assessment_data}
        --------------------
        --- 福祉サービス利用援助事業のガイドライン ---
        {guidelines}
        -------------------------------------------
        """
        try:
            logging.info("--- Running Support Plan Creation Agent ---")
            response = self.support_plan_creation_agent.invoke(
                {"input": prompt})
            return response['output']
        except Exception as e:
            logging.error(f"Support Plan Creation Agent execution error: {e}")
            raise

    def generate_support_plan_with_agent(self, assessment_data: dict) -> str:
        """
        2つのエージェントを連携させ、支援計画を生成する。
        """
        # TODO: 将来的には、このガイドラインは外部ファイルやデータベースから読み込むようにする
        guidelines = """
        **福祉サービス利用援助事業 ガイドライン（サンプル）**
        - **対象者**: 本事業の対象者は、判断能力が不十分な者（認知症高齢者、知的障害者、精神障害者等）であって、福祉サービスの利用に関する適切な判断が困難な者とする。
        - **支援内容**: 福祉サービスの利用援助、それに伴う金銭管理、書類等の預かりサービス。
        - **対象外**: 判断能力に問題がないと判断される者、資産管理や身上監護のみを目的とする者。
        """

        try:
            assessment_text = json.dumps(
                assessment_data, indent=2, ensure_ascii=False)

            # 1. 支援者情報抽出エージェントを実行
            supporter_info = self._extract_supporter_information(
                assessment_text)

            # 2. 支援計画立案エージェントを実行
            support_plan = self._create_support_plan(
                assessment_data, supporter_info, guidelines)

            return support_plan
        except Exception as e:
            logging.error(f"Support plan generation failed: {e}")
            return f"支援計画の生成中にエラーが発生しました: {e}"

    def analyze(
        self,
        text_content: str,
        assessment_item_name: str,
        user_assessment_items: dict,
    ) -> str:
        assessment_structure_info = ""
        for category, sub_items in user_assessment_items.items():
            assessment_structure_info += f"- {category}: {', '.join(sub_items)}\n"

        prompt = f"""
        あなたはケースワーカーのアセスメントシート作成を支援するAIアシスタントです。
        以下のアセスメントシートの項目「{assessment_item_name}」について、提供された日々のメモの内容から関連する情報を抽出出し、箇条書きで簡潔に要約してください。
        客観的な事実に基づいて記述し、推測や評価は含めないでください。
        関連情報がない場合は、「（関連情報なし）」と回答してください。

        ---アセスメントシートの項目構造---
        {assessment_structure_info}
        ---日々のメモ内容---
        {text_content}
        -------------------

        「{assessment_item_name}」項目に関連する要約情報:
        """
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                return response.candidates[0].content.parts[0].text.strip()
            else:
                return "（応答がありませんでした。）"
        except Exception as e:
            return f"Gemini API呼び出しエラー: {e}"

    def map_to_assessment_items(self, text_content: str, assessment_items: dict) -> dict:
        """
        NLPで抽出した情報とGeminiの解釈をアセスメント項目にマッピングする。
        """
        # 1. NLPによる情報抽出
        nlp_results = self.nlp_processor.analyze_text(text_content)
        entities = nlp_results["entities"]
        sentiment = nlp_results["sentiment"]

        # 2. Geminiによる文脈解釈とマッピング
        prompt = f"""
        あなたはケースワーカーのアセスメント業務を支援するAIアシスタントです。
        以下の「面談記録」と「抽出されたエンティティ情報」を分析し、
        指定された「アセスメントシートの項目」に沿って、関連する情報を整理・要約してください。

        出力は、各アセスメント項目に対応する情報を記述したJSON形式でなければなりません。
        客観的な事実に基づいて記述し、情報がない項目は「該当なし」としてください。

        --- 面談記録 ---
        {text_content}
        ----------------

        --- 抽出されたエンティティ情報 ---
        {", ".join([entity.name for entity in entities])}
        ----------------

        --- アセスメントシートの項目 ---
        {json.dumps(assessment_items, indent=2, ensure_ascii=False)}
        ----------------

        以下のJSON形式で、アセスメント項目に対応する情報を記述してください:
        """
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                # Geminiからの応答（JSON文字列を想定）をパースする
                response_text = response.candidates[0].content.parts[0].text.strip()
                # マークダウンの```json ... ```を削除
                if response_text.startswith("```json"):
                    response_text = response_text[7:-3].strip()
                return json.loads(response_text)
            else:
                return {"error": "Geminiからの応答がありませんでした。"}
        except Exception as e:
            return {"error": f"Gemini API呼び出しエラー: {e}"}
