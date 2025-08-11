import google.generativeai as genai
from agent.utils import relative_date_tool, get_today_date_string

class GeminiAgent:
    def __init__(self, api_key: str, model_name: str = 'gemini-2.5-flash-preview-05-20', relative_date_tool_arg=None):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        # 相対日付→絶対日付変換toolを注入
        if relative_date_tool_arg is not None:
            self.relative_date_tool = relative_date_tool_arg
        else:
            self.relative_date_tool = relative_date_tool

    def analyze(self, text_content: str, assessment_item_name: str, user_assessment_items: dict) -> str:
        assessment_structure_info = ""
        for category, sub_items in user_assessment_items.items():
            assessment_structure_info += f"- {category}: {', '.join(sub_items)}\n"

        prompt = f"""
        あなたは社会福祉士のアセスメントシート作成を支援するAIアシスタントです。
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

    def generate_activity_report(self, case_name: str, memos: list, tasks: list) -> str:
        prompt = f"""
    あなたは社会福祉士の活動報告書作成を支援するプロフェッショナルなAIアシスタントです。
    以下の「日々のメモとタスク履歴」に基づいて、利用者「{case_name}」に関する活動報告書のドラフトを作成してください。

    活動報告書は以下のセクションで構成してください。
    各セクションは、提供された情報に基づいて客観的な事実のみを記述し、推測や評価を含まないでください。
    要約をする際、実際のメモの内容を尊重し、必要な情報を正確に反映してください。
    活動内容は実際のメモが登録された内容を参考に日付を算出してください。
    期間中の活動内容は関係のあることはすべて書き出してください。
    活動目標や状況変化、課題とニーズ支援計画は簡潔にお願いします。
    情報が不足している場合は、「（情報不足）」と記述してください。
    中学生でもわかるような文章や表現を使ってください。

    ---活動報告書セクションと指示---
    1.  **期間中の活動内容**:
        * 提供された「日々のメモとタスク履歴」に基づき、日付ごとに「いつ、何が行われたか」を簡潔にまとめてください。
        * **各日付の記述は、以下の例のように、日付を先頭に、その日にあった主要な活動、関与者、金銭の動き、預かり物の状況、特記事項などをまとめて記述してください。**
        * **箇条書きではなく、各日付の出来事を短く要約した文章やリスト形式で記述してください。**
        * **例:**
            **YYYY/MM/DD　〇〇地域包括センター長とともに来所。福サ利用について初回面談実施。収入は老齢厚生・老齢基礎年金・給付金のみ。金銭管理が難しく、現金をお預かり（XX銀行通帳、キャッシュカード、通帳、運転免許証など）。**
            **YYYY/MM/DD　生活支援給付金〇万円入金。**
            **YYYY/MM/DD　〇月分電気料金〇円支払い。**
    2.  **期間中の本人の状況変化**:
        * 提供されたメモから、利用者の身体的・精神的健康状態、生活状況（住居、食事、衛生）、経済状況、人間関係、金銭管理能力などの変化や特徴をまとめてください。
        * 特に、金銭管理の課題や飲酒・喫煙習慣に関する記述、家族や地域住民との交流に関する記述を含めてください。
    3.  **期間中に明らかになった課題と今後のニーズ**:
        * 提供されたメモから、この期間中に浮上した新たな課題や、まだ解決されていないニーズを具体的に抽出して記述してください。
        * 例: 金銭管理の課題、印鑑問題、生活環境（台所、トイレ）の状況、医療連携の必要性など。
    4.  **今後の支援計画**:
        * 上記の課題とニーズを踏まえ、今後の支援として具体的にどのような活動が計画されているか、提供されたメモに基づいて記述してください。
        * 例えば、印鑑の改印手続き、病院受診同行予定、金銭管理の継続支援、生活環境改善への具体的な取り組み、関係機関との連携予定など。

    ---日々のメモとタスク履歴---
    {memos}
    {tasks}
    ---------------------------

"""
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                return response.candidates[0].content.parts[0].text.strip()
            else:
                return "（応答がありませんでした。）"
        except Exception as e:
            return f"Gemini API呼び出しエラー: {e}"