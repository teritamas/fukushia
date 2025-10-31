import google.generativeai as genai
import json
import logging

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class AssessmentMappingAgent:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-2.5-flash-lite",
    ):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def generate_suggestions_from_assessment(self, assessment_data: dict) -> dict:
        try:
            assessment_json = json.dumps(assessment_data, ensure_ascii=False, indent=2)
        except Exception:
            assessment_json = str(assessment_data)

        prompt = f"""
        あなたは社会福祉士の業務を支援するAIアシスタントです。
        以下の「アセスメント情報」を分析し、クライアントの状況やニーズに基づいた具体的な支援計画を提案してください。

        提案には、以下の2つの要素を含めてください。
        1.  **具体的なタスク案**: 今後必要となる具体的なアクションをリスト形式で提案してください。
        2.  **支援記録の要約案**: 今回のアセスメント更新を記録するための、簡潔な要約を作成してください。

        出力は、必ず以下のキーを持つJSON形式で返してください。
        - `suggested_tasks`: 提案するタスクを文字列の配列で記述。（例: ["〇〇の申請手続きについて情報提供する", "次回の面談で経済状況について詳しくヒアリングする"]）
        - `suggested_memo`: 支援記録の要約案を一つの文字列で記述。

        --- アセスメント情報 ---
        {assessment_json}
        --------------------

        JSONのみを返してください。説明や前置きは不要です。
        """

        try:
            resp = self.model.generate_content(prompt)
            text = ""
            if getattr(resp, "candidates", None):
                c0 = resp.candidates[0]
                parts = getattr(getattr(c0, "content", None), "parts", [])
                if parts:
                    text = getattr(parts[0], "text", "").strip()

            if not text:
                return {"error": "Geminiからの応答がありませんでした。"}

            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

            try:
                return json.loads(text)
            except Exception:
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    return json.loads(text[start : end + 1])
                return {"error": "Gemini応答のJSON解析に失敗しました。", "raw": text}
        except Exception as e:
            logging.error(f"generate_suggestions failed: {e}", exc_info=True)
            return {"error": f"Gemini API呼び出しエラー: {e}"}

    def map_to_assessment_items(self, text_content: str, assessment_items: dict) -> dict:
        """
        面談記録テキストを指定のアセスメント項目構成にマッピングして要約を返す。

        旧実装(df520a1)ではNLP抽出 + Geminiでのマッピングを行っていたが、
        現行ではGemini(GenerativeModel)のみで自己完結するように簡潔化して復元する。
        """
        try:
            items_json = json.dumps(assessment_items, ensure_ascii=False, indent=2)
        except Exception:
            items_json = str(assessment_items)

        prompt = f"""
        あなたは社会福祉士のアセスメント業務を支援するAIアシスタントです。
        以下の「面談記録」を分析し、指定された「アセスメントシートの項目」に沿って、
        関連する情報を整理・要約してください。

        出力は、各アセスメント項目に対応する情報を記述したJSON形式でなければなりません。
        客観的な事実に基づいて記述し、情報がない項目は「該当なし」としてください。

        --- 面談記録 ---
        {text_content}
        ----------------

        --- アセスメントシートの項目 ---
        {items_json}
        ----------------

        次のJSONのみを返してください。説明文や前置きは不要です。
        """

        try:
            resp = self.model.generate_content(prompt)
            # 期待: JSON文字列
            text = ""
            if getattr(resp, "candidates", None):
                c0 = resp.candidates[0]
                parts = getattr(getattr(c0, "content", None), "parts", [])
                if parts:
                    text = getattr(parts[0], "text", "").strip()
            if not text:
                return {"error": "Geminiからの応答がありませんでした。"}

            # フェンス ```json ... ``` を除去
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

            try:
                return json.loads(text)
            except Exception:
                # 緊急フォールバック: 最初の { から最後の } を抽出
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    return json.loads(text[start : end + 1])
                return {"error": "Gemini応答のJSON解析に失敗しました。", "raw": text}
        except Exception as e:
            logging.error(f"map_to_assessment_items failed: {e}", exc_info=True)
            return {"error": f"Gemini API呼び出しエラー: {e}"}
