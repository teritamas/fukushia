import json
import os
from langchain.agents import tool
from langchain_google_community import GoogleSearchAPIWrapper
from pydantic.v1 import BaseModel, Field
from typing import List, Optional
import logging

from ..schemas.support_plan import SupporterInfo, FinalSupportPlan, ServiceDetail

# loggingの設定
logging.basicConfig(level=logging.INFO)

DATA_FILE_CANDIDATES = [
    # 1. このファイル位置を基準(application/data/...)
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "local_resources.json"),
    # 2. CWD 基準 (uvicorn 起動位置が application/ の可能性)
    os.path.join(os.getcwd(), "application", "data", "local_resources.json"),
    # 3. ルート直下 data/ (将来用)
    os.path.join(os.getcwd(), "data", "local_resources.json"),
]

def _sanitize_json_text(txt: str) -> str:
    """軽量サニタイズ: // / # コメント行除去 と 末尾カンマ削除 (厳密JSON化目的)."""
    import re
    lines = []
    for line in txt.splitlines():
        s = line.strip()
        if s.startswith("//") or s.startswith("#"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    # 末尾カンマ ( ,] / ,} ) を削る簡易パターン
    cleaned = re.sub(r",(\s*[}\]])", r"\1", cleaned)
    return cleaned

def _load_local_resources() -> list:
    load_errors = []
    for path in DATA_FILE_CANDIDATES:
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = f.read()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                # サニタイズ再試行
                try:
                    data = json.loads(_sanitize_json_text(raw))
                except json.JSONDecodeError as e2:
                    load_errors.append(f"{path}: JSON decode error line {e2.lineno} col {e2.colno} - {e2.msg}")
                    continue
            if not isinstance(data, list):
                load_errors.append(f"{path}: top-level JSON is not a list")
                continue
            logging.info(f"Loaded local resources from {path} (count={len(data)})")
            return data
        except FileNotFoundError:
            continue
        except Exception as e:
            load_errors.append(f"{path}: {type(e).__name__} {e}")
    if load_errors:
        logging.warning("local_resources.json が見つからないか/読み込み失敗。errors=" + str(load_errors))
    else:
        logging.warning("local_resources.json が見つかりません。")
    return []

local_resources = _load_local_resources()

# 欠落フィールドを補完（将来の一貫性確保）
DEFAULT_FIELDS = {
    "eligibility": "不明。詳細は提供元へ確認。",
    "application_process": "不明。提供元窓口へ要確認。",
    "cost": "不明。公的負担や自己負担について要確認。",
    "keywords": [],
}
for r in local_resources:
    for k, v in DEFAULT_FIELDS.items():
        if k not in r:
            r[k] = v

class ExtractInfoInput(BaseModel):
    assessment_text: str = Field(description="相談者のアセスメント情報が記載されたテキスト。")

class SearchInput(BaseModel):
    query: str = Field(description="検索クエリ。地名と具体的な困りごと（例：「南陽市 就労支援」）を含めること。")

def reset_search_state():
    """支援計画生成 1 セッションごとのローカル検索状態をリセット。"""
    global _SEARCH_HISTORY, _LOCAL_SEARCH_ATTEMPTS, _LOCAL_SEARCH_FAILURES
    _SEARCH_HISTORY = []
    _LOCAL_SEARCH_ATTEMPTS = 0
    _LOCAL_SEARCH_FAILURES = 0


@tool("search_local_resources", args_schema=SearchInput, return_direct=False)
def search_local_resources(query: str) -> str:
    """
    地域の社会資源データベースを検索し、相談者の困りごとに合致するサービスや制度の情報を返す。
    広範なWeb検索を行う前に、まずこのツールを使用することを強く推奨する。
    """
    logging.info(f"【Tool】Executing search_local_resources with query: {query}")
    # --- Loop / duplicate control ---
    global _SEARCH_HISTORY, _LOCAL_SEARCH_ATTEMPTS, _LOCAL_SEARCH_FAILURES
    try:
        _SEARCH_HISTORY
    except NameError:
        _SEARCH_HISTORY = []
    try:
        _LOCAL_SEARCH_ATTEMPTS
    except NameError:
        _LOCAL_SEARCH_ATTEMPTS = 0
    try:
        _LOCAL_SEARCH_FAILURES
    except NameError:
        _LOCAL_SEARCH_FAILURES = 0

    normalized_q = query.strip()
    if normalized_q in _SEARCH_HISTORY:
        return (
            "(REPEAT_QUERY) 同一クエリ再実行。別のキーワードへ切替、または google_search を一度だけ試し、その後 create_final_support_plan に進んでください。"
        )
    _SEARCH_HISTORY.append(normalized_q)
    _LOCAL_SEARCH_ATTEMPTS += 1
    results = []
    # --- 前処理: ブール演算子 (+ AND, | OR, - NOT) と引用符でのフレーズ保持に軽量対応 ---
    raw_tokens = [t for t in query.split() if t.strip()]
    tokens = []
    boolean_ops = {"+": "AND", "|": "OR"}
    structured_terms = []  # (term, op, neg)
    current_op = "AND"  # デフォルトはAND解釈
    for t in raw_tokens:
        if t in boolean_ops:
            current_op = boolean_ops[t]
            continue
        neg = False
        term = t
        if term.startswith('-') and len(term) > 1:
            neg = True
            term = term[1:]
        structured_terms.append((term, current_op, neg))
        # 次のトークンはデフォルトAND
        current_op = "AND"
        tokens.append(term)

    # シノニム / 関連語簡易展開 (ローカルマッチ強化)
    SYNONYMS = {
        "生活困窮": ["家計", "生活支援", "自立", "生計"],
        "就労支援": ["就職", "職業", "ハローワーク", "求職"],
        "金銭管理": ["家計", "支出", "収支"],
        "障がい": ["障害", "障害者", "障がい者"],
    }

    # 年度/年指定が無い場合に内部スコア用に 2025 を補助トークン扱い (検索結果テキストに年が含まれる資源優先の布石)
    year_flag = not any(y in query for y in ["2025", "令和7", "R7"])  # 今年度補助
    # 地域トークン候補: 市/町/村/区/県/府/道 で終わる最初の語
    region_token = None
    for t in tokens:
        if t.endswith(('市','町','村','区','県','府','道')):
            region_token = t
            break
    keyword_tokens = [t for t in tokens if t != region_token]
    expanded_tokens = []
    for kt in keyword_tokens:
        expanded_tokens.append(kt)
        for syn in SYNONYMS.get(kt, []):
            expanded_tokens.append(syn)
    if year_flag:
        expanded_tokens.append("2025")

    def resource_matches(resource, kw_tokens, and_mode=True):
        haystack = " ".join([
            str(resource.get("service_name", "")),
            str(resource.get("category", "")),
            str(resource.get("description", "")),
            " ".join(resource.get("keywords", [])),
            str(resource.get("eligibility", "")),
            str(resource.get("application_process", "")),
        ]).lower()
        if not kw_tokens:
            return True
        kw_tokens_lower = [k.lower() for k in kw_tokens]
        if and_mode:
            return all(k in haystack for k in kw_tokens_lower)
        else:
            return any(k in haystack for k in kw_tokens_lower)

    # スコアリング: マッチトークン数 + 年度ボーナス
    def score_resource(resource, tokens_for_score):
        text = " ".join([
            str(resource.get("service_name", "")),
            str(resource.get("category", "")),
            str(resource.get("description", "")),
            " ".join(resource.get("keywords", [])),
            str(resource.get("eligibility", "")),
            str(resource.get("application_process", "")),
        ]).lower()
        score = 0
        for t in tokens_for_score:
            if t.lower() in text:
                score += 1
        if "2025" in tokens_for_score and ("2025" in text or "令和7" in text):
            score += 2
        return score

    # 地域優先フィルタ
    candidate_resources = local_resources
    region_filtered = []
    if region_token:
        for r in local_resources:
            loc = str(r.get('location',''))
            prov = str(r.get('provider',''))
            name = str(r.get('service_name',''))
            if region_token in loc or region_token in prov or region_token in name:
                region_filtered.append(r)
        if region_filtered:
            candidate_resources = region_filtered

    # 検索: 地域一致があれば AND, なければ OR で広めに
    and_mode = True if region_filtered else False
    for resource in candidate_resources:
        if resource_matches(resource, expanded_tokens, and_mode=and_mode):
            sc = score_resource(resource, expanded_tokens)
            if resource_matches(resource, keyword_tokens, and_mode=and_mode):
                contact = resource.get("contact_info")
                if isinstance(contact, dict):
                    contact_repr = ", ".join(f"{k}:{v}" for k, v in contact.items() if v)
                else:
                    contact_repr = str(contact)
                prefix = "[地域一致] " if region_filtered else ""
                results.append(
                    "\n".join([
                        f"{prefix}サービス名: {resource.get('service_name', 'N/A')}",
                        f"カテゴリ: {resource.get('category', 'N/A')}",
                        f"対象: {resource.get('target_users', 'N/A')}",
                        f"利用条件: {resource.get('eligibility', 'N/A')}",
                        f"申請手続き: {resource.get('application_process', 'N/A')}",
                        f"費用: {resource.get('cost', 'N/A')}",
                        f"概要: {resource.get('description', 'N/A')}",
                        f"キーワード: {', '.join(resource.get('keywords', []))}",
                        f"連絡先: {contact_repr}",
                        f"提供主体: {resource.get('provider', 'N/A')}",
                        f"所在地: {resource.get('location', 'N/A')}",
                        f"内部スコア: {sc}",
                    ])
                )

    if not results and region_token and not region_filtered:
        # 地域一致が全くなかったため fallback したことを明示
        logging.info("【Tool】No exact region match; falling back to broad OR search")
        scored = []
        for resource in candidate_resources:
            if resource_matches(resource, expanded_tokens, and_mode=and_mode):
                scored.append((score_resource(resource, expanded_tokens), resource))
        # スコア降順で上位 (最大8件) を取り出す
        for score, resource in sorted(scored, key=lambda x: x[0], reverse=True)[:8]:
            contact = resource.get("contact_info")
            if isinstance(contact, dict):
                contact_repr = ", ".join(f"{k}:{v}" for k, v in contact.items() if v)
            else:
                contact_repr = str(contact)
            results.append(
                "\n".join([
                    f"[他地域] サービス名: {resource.get('service_name', 'N/A')}",
                    f"カテゴリ: {resource.get('category', 'N/A')}",
                    f"対象: {resource.get('target_users', 'N/A')}",
                    f"利用条件: {resource.get('eligibility', 'N/A')}",
                    f"申請手続き: {resource.get('application_process', 'N/A')}",
                    f"費用: {resource.get('cost', 'N/A')}",
                    f"概要: {resource.get('description', 'N/A')}",
                    f"キーワード: {', '.join(resource.get('keywords', []))}",
                    f"連絡先: {contact_repr}",
                    f"提供主体: {resource.get('provider', 'N/A')}",
                    f"所在地: {resource.get('location', 'N/A')}",
                    f"内部スコア: {score}",
                ])
            )

    if results:
        result_str = "\n---\n".join(results)
        logging.info(f"【Tool】Local search result: {result_str}")
        return result_str
    else:
        _LOCAL_SEARCH_FAILURES += 1
        guidance = []
        if _LOCAL_SEARCH_FAILURES == 1:
            guidance.append("(NO_RESULT_1) ローカルDBで該当なし。語彙拡張例: '家計', '自立', '相談', '支援事業', '就労', '金銭管理'。複合は +、代替は |、除外は -語 で指定可。例: 南陽市 +家計 +相談 |就労 -児童")
        elif _LOCAL_SEARCH_FAILURES == 2:
            guidance.append("(NO_RESULT_2) 2回連続でローカル該当なし。次は google_search を1回だけ試し、その後 create_final_support_plan に進む準備。")
        else:
            guidance.append("(NO_RESULT_3) 3回以上該当なし。これ以上のローカル再検索は禁止。現在得られている情報を要約し create_final_support_plan を実行してください。")
        guidance.append(f"(Attempts: {_LOCAL_SEARCH_ATTEMPTS}, Failures: {_LOCAL_SEARCH_FAILURES})")
        result_str = " ".join(guidance)
        logging.info(f"【Tool】Local search guidance: {result_str}")
        return result_str

@tool("google_search", args_schema=SearchInput, return_direct=False)
def google_search(query: str) -> str:
    """
    Google検索を実行し、最新の制度情報や広範なウェブ上の情報を取得する。
    `search_local_resources`で情報が見つからなかった場合や、より新しい情報が必要な場合に使用する。
    """
    logging.info(f"【Tool】Executing google_search with query: {query}")
    # このツールはGeminiAgentクラス内でAPIキーを使って初期化する必要がある
    # ここではプレースホルダーとして定義
    raise NotImplementedError("Google Search must be initialized within the GeminiAgent class.")

class CreatePlanInput(BaseModel):
    payload: str = Field(
        description="最終計画生成用のJSON文字列。例: {\"supporter_info\": {...}, \"investigation_results\": [\"...\"]}。自然文の場合は内部でベストエフォート抽出。"
    )

# キーワードなどのカラムが足りないものをここに避難
# JSONだとコメントアウトできなかった

#   {
#     "service_name": "子育て支援センター (酒田市)",
#     "category": "子育て支援, 地域交流",
#     "target_users": "親子 (子育て中の親子)",
#     "description": "親子でふれあいながら遊んだり、同じように子育て中の親子と交流できる。子育てに関する相談や育児講座も開催。",
#     "contact_info": {
#       "phone": "0234-26-5731",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "酒田市",
#     "location": "酒田市"
#   },
#   {
#     "service_name": "基幹相談支援センター (酒田市)",
#     "category": "障がい福祉, 相談支援",
#     "target_users": "障がいのある方やその家族",
#     "description": "障がいのある方やその家族が、住み慣れた地域で安心して生活できるよう、相談支援専門員、社会福祉士などの専門の資格を持った職員が、様々な困りごと、心配ごとなどの相談に応じて支援を行う。",
#     "contact_info": {
#       "phone": "0234-26-5733",
#       "fax": "0234-23-2258",
#       "email": null,
#       "url": null
#     },
#     "provider": "酒田市",
#     "location": "酒田市"
#   },
#   {
#     "service_name": "地域活動支援センター (酒田市)",
#     "category": "障がい福祉, 日中活動",
#     "target_users": "在宅の障がい者",
#     "description": "在宅の障がい者が通所して、創作的活動、生産活動、社会生活への適応のために必要な訓練等のサービスが受けられる。",
#     "contact_info": {
#       "phone": "0234-26-5733",
#       "fax": "0234-23-2258",
#       "email": null,
#       "url": null
#     },
#     "provider": "酒田市",
#     "location": "酒田市"
#   },
#   {
#     "service_name": "自立支援医療 (更生医療, 育成医療, 精神通院医療)",
#     "category": "障がい福祉, 医療費助成",
#     "target_users": "心身の障がいを除去・軽減するための医療を必要とする方",
#     "description": "医療費の自己負担額を軽減する公費負担医療制度。所得に応じて負担上限月額が設定される。",
#     "contact_info": {
#       "phone": "0234-26-5733",
#       "fax": "0234-23-2258",
#       "email": null,
#       "url": null
#     },
#     "provider": "酒田市",
#     "location": "酒田市"
#   },
#   {
#     "service_name": "精神障がい者保健福祉手帳 (金山町)",
#     "category": "障がい福祉, 手帳交付",
#     "target_users": "精神障がい者",
#     "description": "精神障がい者のための手帳交付制度。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "特別障害者手当・障害児福祉手当・福祉手当制度 (金山町)",
#     "category": "障がい福祉, 手当支給",
#     "target_users": "特別障害者、障害児",
#     "description": "障がい者や障がい児への手当支給制度。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "障がい福祉サービス (金山町)",
#     "category": "障がい福祉",
#     "target_users": "障がい者",
#     "description": "障がい者向けの各種福祉サービス。具体的なサービス内容は不明。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "福祉タクシー事業 (金山町)",
#     "category": "障がい福祉, 移動支援",
#     "target_users": "障がい者",
#     "description": "障がい者向けのタクシー利用支援。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "人工透析交通費助成事業 (金山町)",
#     "category": "障がい福祉, 医療費助成",
#     "target_users": "人工透析を受ける方",
#     "description": "人工透析を受ける方の交通費助成。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "障害者紙おむつ支給事業 (金山町)",
#     "category": "障がい福祉, 日常生活支援",
#     "target_users": "障がい者",
#     "description": "障がい者への紙おむつ支給。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "在宅酸素療法支援事業 (金山町)",
#     "category": "障がい福祉, 医療支援",
#     "target_users": "在宅酸素療法を受ける方",
#     "description": "在宅酸素療法を受ける方への支援。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "重度障害者介護者激励金支給事業 (金山町)",
#     "category": "障がい福祉, 介護支援",
#     "target_users": "重度障害者の介護者",
#     "description": "重度障害者の介護者への激励金支給。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "日常生活用具給付事業 (金山町)",
#     "category": "障がい福祉, 日常生活支援",
#     "target_users": "障がい者",
#     "description": "障がい者への日常生活用具給付。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "金山町",
#     "location": "金山町"
#   },
#   {
#     "service_name": "生活困窮者自立支援制度 (全体)",
#     "category": "生活支援, 総合支援",
#     "target_users": "経済的に困窮し、最低限度の生活を維持することができなくなるおそれのある者",
#     "description": "生活保護に至る前の段階で、就労、住居、家計などの課題を抱える方々に対し、個々の状況に応じた支援プランを作成し、自立に向けた支援を行う制度。",
#     "contact_info": {
#       "phone": "023-630-2334",
#       "fax": "023-632-8176",
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県",
#     "location": "〒990-8570 山形市松波二丁目8番1号"
#   },
#   {
#     "service_name": "自立相談支援事業 (山形県)",
#     "category": "生活支援, 相談支援",
#     "target_users": "生活に困りごとや不安を抱えている方",
#     "description": "地域の相談窓口で支援員が相談を受け、相談者と共に必要な支援を検討し、具体的な支援プランを作成。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "住居確保給付金の支給 (山形県)",
#     "category": "生活支援, 住居支援",
#     "target_users": "離職などにより住居を失った方、または失うおそれの高い方",
#     "description": "就職活動を条件に一定期間、家賃相当額が支給される。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "就労準備支援事業 (山形県)",
#     "category": "生活支援, 就労支援",
#     "target_users": "直ちに就労が困難な方 (社会との関わりに不安がある、コミュニケーションがうまくとれないなど)",
#     "description": "6ヶ月から1年のプログラムに沿って、一般就労に向けた基礎能力を養う支援や就労機会の提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "家計改善支援事業 (山形県)",
#     "category": "生活支援, 金銭管理支援",
#     "target_users": "家計状況に課題を抱える方",
#     "description": "家計状況の「見える化」と根本的な課題の把握を行い、相談者が自ら家計を管理できるよう、状況に応じた支援計画の作成、相談支援、関係機関への連携、必要に応じた貸付のあっせんなどにより、早期の生活再生を支援。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "就労訓練事業 (山形県)",
#     "category": "生活支援, 就労支援",
#     "target_users": "直ちに一般就労が難しい方",
#     "description": "その方に合った作業機会を提供しながら、個別の就労支援プログラムに基づき、中・長期的に一般就労に向けた支援を実施する「中間的就労」。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "生活困窮世帯の子どもの学習・生活支援事業 (山形県)",
#     "category": "生活支援, 子育て支援",
#     "target_users": "生活困窮世帯の子どもと保護者",
#     "description": "子どもの学習支援に加え、日常的な生活習慣、仲間と出会い活動できる居場所づくり、進学に関する支援、高校進学者の退学防止に関する支援など、子どもと保護者の双方に必要な支援。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "一時生活支援事業 (山形県)",
#     "category": "生活支援, 住居支援",
#     "target_users": "住居を持たない方、またはネットカフェなどの不安定な住居形態にある方",
#     "description": "一定期間、宿泊場所や衣食が提供される。退所後の生活に向けて、就労支援などの自立支援も行う。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形県 (各地域の自立相談支援機関)",
#     "location": "山形県内各地域"
#   },
#   {
#     "service_name": "就労継続支援B型事業 (段ボール組み立て, 椎茸栽培・加工, お弁当製造販売など)",
#     "category": "障がい福祉, 就労支援",
#     "target_users": "現時点で通常の事業所に雇用されることが困難な障がいのある方",
#     "description": "利用者の意向を尊重し、多様な福祉サービスを総合的に提供することで、利用者が個人の尊厳を保持しつつ、地域社会において自立した生活を営むことができるように支援。生産された物品の販売や廃棄物処理業による収益を利用者の工賃にあてる。",
#     "contact_info": {
#       "phone": "0234-31-8335",
#       "fax": "0234-31-7321",
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人ホールド すまいるらんど",
#     "location": "〒998-0875 山形県酒田市東町1丁目20−15"
#   },
#   {
#     "service_name": "空き家のご紹介と各種相談 (移住支援)",
#     "category": "住居支援, 移住支援",
#     "target_users": "遊佐町への移住を希望する方",
#     "description": "遊佐町に移住を希望する方の様々な相談に対応。空き家バンク登録物件を案内。",
#     "contact_info": {
#       "phone": "0234-43-6941",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人いなか暮らし遊佐応援団",
#     "location": "飽海郡遊佐町遊佐字広表6-1 創業支援センター内"
#   },
#   {
#     "service_name": "空き家管理サービス (遊佐町)",
#     "category": "住居支援",
#     "target_users": "遊佐町の「空き家バンク」に登録されている空き家のオーナー",
#     "description": "空き家バンク登録物件を対象とした「空き家管理事業（通風、掃除など）」を実施。",
#     "contact_info": {
#       "phone": "0234-43-6941",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人いなか暮らし遊佐応援団",
#     "location": "飽海郡遊佐町遊佐字広表6-1 創業支援センター内"
#   },
#   {
#     "service_name": "遊佐での暮らしなんでも相談窓口",
#     "category": "相談支援, 移住支援",
#     "target_users": "移住者、近隣住民",
#     "description": "移住後の悩み、移住後の暮らしについての相談、また、近隣住民からの各種相談を受け付ける。",
#     "contact_info": {
#       "phone": "0234-43-6941",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人いなか暮らし遊佐応援団",
#     "location": "飽海郡遊佐町遊佐字広表6-1 創業支援センター内"
#   },
#   {
#     "service_name": "住宅確保要配慮者居住支援 (住まい探し支援, 債務保証支援, つながる見守りサービス)",
#     "category": "住居支援, 生活支援",
#     "target_users": "山形市内在住で、住宅を確保することが困難な生活困窮者・高齢者・障害者・外国人・刑余者など",
#     "description": "住宅確保要配慮者の民間賃貸住宅等への円滑な入居を促進するため、賃貸住宅への入居に係る住宅情報の提供や相談・見守りなどの生活支援等を実施。",
#     "contact_info": {
#       "phone": "023-666-7077",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "一般社団法人山形県地域包括支援センター等協議会",
#     "location": "〒990-0063 山形市山家町2-7-17-2F"
#   },
#   {
#     "service_name": "グループホームさくらんぼの丘南陽",
#     "category": "障がい福祉, 共同生活援助, 金銭管理支援",
#     "target_users": "障がい者訓練等給付受給者及びグループホーム利用認定者 (心に病をお持ちの方)",
#     "description": "居室・食事等の提供を受け、自立支援・社会参加等の援助を仰ぎ、共同で生活をする地域型グループホーム。食事援助、日常生活関連動作、健康・服薬・金銭管理、指定医通院、緊急時の応急対策の支援。定員13名。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人置賜ひまわり会",
#     "location": "〒992-0472 山形県南陽市宮内3196-1"
#   },
#   {
#     "service_name": "就労支援 (犯罪者等)",
#     "category": "就労支援, 社会復帰支援",
#     "target_users": "刑務所出所者等 (犯罪者など)",
#     "description": "再犯のない社会を作るために、山形県内の経済界の協力により犯罪者などに就労支援を行い、安全な社会づくりに貢献する組織。協力事業主の開拓や刑務所出所者等の就労支援を通して、地域社会の治安の確保に協力。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "特定非営利活動法人 山形県就労支援事業者機構",
#     "location": "山形県山形市大手町１－３２山形保護観察所内"
#   },
#   {
#     "service_name": "障がい者共同生活援助事業 (ポラリス)",
#     "category": "障がい福祉, 共同生活援助",
#     "target_users": "障がい者",
#     "description": "障がい者が地域の中で共に手を取り、歩んでいけるような共生社会を実現するために、総合的な福祉サービスを展開。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "障がい児者 相談支援事業 (福祉サポートセンター山形)",
#     "category": "障がい福祉, 相談支援",
#     "target_users": "障がい児や障がい者",
#     "description": "障がい児や障がい者の生活を支援するため、各種の福祉サービスを提供。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "障がい者居宅介護・重度訪問介護・同行援護・行動援護事業",
#     "category": "障がい福祉, 訪問介護",
#     "target_users": "障がい者",
#     "description": "障がい者の居宅での生活支援、重度訪問介護、外出時の同行援護、行動援護を提供。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "就労継続支援Ａ型事業 (福祉サポートセンター山形)",
#     "category": "障がい福祉, 就労支援",
#     "target_users": "障がい者",
#     "description": "障がい者の就労支援。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "就労継続支援Ｂ型事業 (福祉サポートセンター山形)",
#     "category": "障がい福祉, 就労支援",
#     "target_users": "障がい者",
#     "description": "障がい者の就労支援。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "就労移行支援事業 (福祉サポートセンター山形)",
#     "category": "障がい福祉, 就労支援",
#     "target_users": "障がい者",
#     "description": "障がい者の就労支援。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "日中一時支援（レスパイト）事業 (スマイル)",
#     "category": "障がい福祉, 短期入所",
#     "target_users": "障がい児者",
#     "description": "障がい児者の日中一時支援。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "居宅介護支援事業 (福祉サポートセンター山形)",
#     "category": "高齢者福祉, 相談支援",
#     "target_users": "高齢者",
#     "description": "高齢者の居宅介護支援。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "訪問介護事業 (どんぐり)",
#     "category": "高齢者福祉, 訪問介護",
#     "target_users": "高齢者",
#     "description": "高齢者の訪問介護。",
#     "contact_info": {
#       "phone": "0233-29-4556",
#       "fax": "0233-29-5200",
#       "email": "fukusi@email.plala.or.jp",
#       "url": null
#     },
#     "provider": "福祉サポートセンター山形",
#     "location": "〒996-0027 山形県新庄市本町６番１１号"
#   },
#   {
#     "service_name": "就労継続支援事業（B型） (NPO法人あゆむ会)",
#     "category": "障がい福祉, 就労支援",
#     "target_users": "現時点で通常の事業所に雇用されることが困難な障がいのある方",
#     "description": "生産活動（作業）などの機会の提供、知識および能力の向上のために必要な訓練と支援を行うサービス。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人あゆむ会",
#     "location": "不明"
#   },
#   {
#     "service_name": "グループホーム（共同生活援助） (NPO法人あゆむ会)",
#     "category": "障がい福祉, 共同生活援助",
#     "target_users": "障がい者",
#     "description": "障がい者の共同生活援助。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "NPO法人あゆむ会",
#     "location": "不明"
#   },
#   {
#     "service_name": "まごころ給食サービス",
#     "category": "弁当・食材の配達",
#     "target_users": "おおむね65歳以上の一人暮らし・高齢者世帯・障がい者世帯で、担当地区民生委員が必要と認めた方",
#     "description": "社会福祉協議会が提供する給食サービス。奇数週はボランティアによる手作り弁当、偶数週は仕出し弁当。",
#     "contact_info": {
#       "phone": "0238-43-5888",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "社会福祉協議会",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "COOP せいきょう",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "夕食用冷蔵弁当を平日配達。1食から注文可能。冷凍おかずや日用品の注文も可能。",
#     "contact_info": {
#       "phone": "0800-800-6265",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "COOP せいきょう",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "ワタミの宅食",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "夕食用の冷蔵弁当を平日のみ、1週間単位で配達。冷凍おかずや「みまもりサービス」も提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "ワタミ",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "JA",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "食材を月・水・金、または火・木・土のコースで配達。冷凍おかずや乳製品の追加注文も可能。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "JA",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "すし海道",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "寿司の出前サービス。1,500円以上から配達可能。市内全域に対応。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "すし海道",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "大竹精肉店",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "惣菜や肉類を扱っており、午前中の注文で16:30までに配達。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "大竹精肉店",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "移動スーパー とくし丸",
#     "category": "弁当・食材の配達",
#     "target_users": null,
#     "description": "軽トラックで自宅を訪問し、食品や日用品を販売。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "とくし丸",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "南陽市生活支援を考える会",
#     "category": "移動支援",
#     "target_users": "要支援者やチェックリストに該当する方",
#     "description": "通いの場への移動を支援。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "南陽市生活支援を考える会",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "山形コアラ",
#     "category": "移動支援",
#     "target_users": "介護保険介護タクシーはケアマネジャーのプランに基づき利用。その他の方は福祉タクシーを利用",
#     "description": "介護保険介護タクシーと、介護保険が適用されない介護タクシーを提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形コアラ",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "あんず福祉タクシー",
#     "category": "移動支援",
#     "target_users": "すべての方",
#     "description": "要介護認定の有無に関わらず、すべての方が利用できる福祉タクシー。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "あんず福祉タクシー",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "たすけあいの会（生協）",
#     "category": "生活支援（介護保険外サービス）",
#     "target_users": null,
#     "description": "掃除、買い物、家事などの家事支援サービスを提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "たすけあいの会（生協）",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "山形コアラ",
#     "category": "生活支援（介護保険外サービス）",
#     "target_users": null,
#     "description": "ゴミ出し、掃除、買い物、病院付き添いなどの家事支援や、雪片づけも実施。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "山形コアラ",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "シルバー人材センター",
#     "category": "生活支援（介護保険外サービス）",
#     "target_users": null,
#     "description": "掃除、洗濯、話し相手などの家事支援から、草刈りや除雪・雪下ろしなどの外作業まで、幅広いサービスを提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "シルバー人材センター",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "ほのぼのケアサービス",
#     "category": "生活支援（介護保険外サービス）",
#     "target_users": null,
#     "description": "生活援助（買い物、調理、掃除など）や身体介護（食事、入浴、排泄介助など）を実施。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "ほのぼのケアサービス",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "フク菊丸応援隊",
#     "category": "生活支援（介護保険外サービス）",
#     "target_users": null,
#     "description": "ゴミ出し、草むしり、除雪などのサービスを提供。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "フク菊丸応援隊",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "緊急通報システム",
#     "category": "高齢者の安全サポート",
#     "target_users": "65歳以上の一人暮らしの方・65歳以上の方のみの世帯・身体障がい者のみの世帯・65歳以上と障がい者のみの世帯",
#     "description": "急に具合が悪くなった場合に、救急車の手配や緊急連絡先への連絡をしてくれるシステム。",
#     "contact_info": {
#       "phone": "0238-40-0610",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "南陽市 福祉課",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "家さかえっぺ登録",
#     "category": "高齢者の安全サポート",
#     "target_users": "在宅で生活している概ね65歳以上で、認知症等により徘徊の恐れがある方",
#     "description": "高齢者の情報を市に登録することで、行方不明になった際の早期発見・保護に繋げる支援事業。",
#     "contact_info": {
#       "phone": "0238-40-0610",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "南陽市 福祉課",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "郵便局のみまもりサービス",
#     "category": "高齢者の安全サポート",
#     "target_users": null,
#     "description": "郵便局員が直接訪問し、訪問状況を指定先に報告するサービス。",
#     "contact_info": {
#       "phone": "0120-23-28-86",
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "郵便局",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "ほのぼのケアサービス 福祉用具",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "ほのぼのケアサービス",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "ウエルランド いいづか",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "ウエルランド",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "ヘルズ",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "ヘルズ",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "サン十字 南陽営業所",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "サン十字",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "悠々くらし会",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "悠々くらし会",
#     "location": "山形県南陽市"
#   },
#   {
#     "service_name": "さふらん",
#     "category": "福祉用具の専門店",
#     "target_users": null,
#     "description": "福祉用具の専門店。",
#     "contact_info": {
#       "phone": null,
#       "fax": null,
#       "email": null,
#       "url": null
#     },
#     "provider": "さふらん",
#     "location": "山形県南陽市"
#   },
#   {
# "service_name": "くらしのたすけあいの会（生協）",
# "category": "配食サービス",
# "target_users": "組合員",
# "description": "夕食（おかずのみ又は弁当）を配達。事前に組合員に加入する必要があります。",
# "contact_info": {
# "phone": "080-0800-6265",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "くらしのたすけあいの会（生協）",
# "location": "新庄市"
# },
# {
# "service_name": "おくやまストアー",
# "category": "配食サービス",
# "target_users": null,
# "description": "昼食弁当を配達。配達エリアは市内。",
# "contact_info": {
# "phone": "0233-29-2321",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "おくやまストアー",
# "location": "新庄市"
# },
# {
# "service_name": "福原鮮魚店",
# "category": "配食サービス",
# "target_users": "高齢者向け惣菜も販売",
# "description": "お惣菜各種と弁当を販売。3,000円以上で市内配送無料。高齢者向けの惣菜も販売中。",
# "contact_info": {
# "phone": "0233-23-2812",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "福原鮮魚店",
# "location": "新庄市"
# },
# {
# "service_name": "ヨシケイ",
# "category": "配食サービス",
# "target_users": "糖尿病、高血圧症、高脂血症の方",
# "description": "糖尿病、高血圧症、高脂血症の方向け食材など、幅広いラインナップを提供。2食入りや3食入りコースがある。",
# "contact_info": {
# "phone": "0233-22-7323",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ヨシケイ",
# "location": "新庄市"
# },
# {
# "service_name": "日東ベスト",
# "category": "配食サービス",
# "target_users": null,
# "description": "冷凍食品をカタログから選択して注文。嚥下困難食など、食形態が豊富。",
# "contact_info": {
# "phone": "0120-917-549",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "日東ベスト",
# "location": "新庄市"
# },
# {
# "service_name": "かいせい食堂",
# "category": "配食サービス",
# "target_users": "かいせい訪問介護・訪問入浴などの利用者",
# "description": "各種弁当を提供。毎週木曜は治療食も取り扱い。",
# "contact_info": {
# "phone": "0233-29-2912",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "かいせい",
# "location": "新庄市"
# },
# {
# "service_name": "食楽膳",
# "category": "配食サービス",
# "target_users": null,
# "description": "冷凍タイプの調理済惣菜。電子レンジで温めるだけ。注文合計5,500円以上で送料無料。",
# "contact_info": {
# "phone": "0120-640-407",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "食楽膳",
# "location": "新庄市"
# },
# {
# "service_name": "福祉サポートセンター山形",
# "category": "移送サービス(福祉有償運送事業所)",
# "target_users": "新庄市社会福祉協議会もみの木訪問介護事業所の利用者および付き添いの方、要介護認定を受けている方、身体障がい者手帳又は療育手帳をお持ちの方",
# "description": "通院、同行援護などを支援。保有台数3台（車いす対応車1台）。",
# "contact_info": {
# "phone": "0233-22-5790",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "くらしのたすけあいの会（生協）",
# "category": "移送サービス(福祉有償運送事業所)",
# "target_users": "新庄市在住の要介護認定者、障がい手帳所有者（たすけあいの会の会員になる必要があります）",
# "description": "通院送迎などを支援。保有台数4台（車いす対応車3台）。",
# "contact_info": {
# "phone": "0233-22-8893",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "くらしのたすけあいの会（生協）",
# "location": "新庄市"
# },
# {
# "service_name": "新庄タクシー",
# "category": "移送サービス(一般乗用旅客)",
# "target_users": null,
# "description": "一般タクシーサービス。車いす対応車1台、ストレッチャーあり。県内外に対応。",
# "contact_info": {
# "phone": "0233-22-3955",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄タクシー",
# "location": "新庄市"
# },
# {
# "service_name": "介護タクシー「もがみ」",
# "category": "移送サービス(一般乗用旅客)",
# "target_users": null,
# "description": "一般タクシーサービス。男性2人体制、重度の方は受け入れ困難。吸引器あり。",
# "contact_info": {
# "phone": "0233-35-2721",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "介護タクシー「もがみ」",
# "location": "新庄市"
# },
# {
# "service_name": "かなエール・タクシー",
# "category": "移送サービス(一般乗用旅客)",
# "target_users": null,
# "description": "各種、付き添い・同行サービスも対応可能。保有台数4台（車いす対応車4台）。",
# "contact_info": {
# "phone": "0237-85-1147",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "かなエール・タクシー",
# "location": "新庄市"
# },
# {
# "service_name": "カイセイ",
# "category": "移送サービス(一般乗用旅客)",
# "target_users": "新庄市、鮭川村、真室川町、舟形町に在住の要介護認定者、障がい手帳所有者",
# "description": "事業所を出発した時点から料金が発生。介護保険利用時は料金が加算されます。",
# "contact_info": {
# "phone": "0233-29-2912",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "カイセイ",
# "location": "新庄市"
# },
# {
# "service_name": "もみの木 訪問介護事業所",
# "category": "訪問サービス（介護保険外）",
# "target_users": "もみの木訪問介護事業所を利用している方",
# "description": "身体介護、通院介助、外出付き添い、家事援助、買い物などを提供。安否・服薬確認も実施。",
# "contact_info": {
# "phone": "0233-22-5790",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "もみの木 訪問介護事業所",
# "location": "新庄市"
# },
# {
# "service_name": "(有) ケアワーク新庄",
# "category": "訪問サービス（介護保険外）",
# "target_users": null,
# "description": "通院介助・在宅家事援助・在宅介護支援など。日勤・夜勤・住み込み対応可（料金別途）。",
# "contact_info": {
# "phone": "0233-22-2018",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "(有) ケアワーク新庄",
# "location": "新庄市"
# },
# {
# "service_name": "ヘルパーステーション さんのほり 新庄徳洲会介護センター",
# "category": "訪問サービス（介護保険外）",
# "target_users": "徳洲会病院入院中の患者",
# "description": "通院介助・家事援助、身体介護（入浴介助等）、徳洲会病院入院中の患者を対象とした洗濯サービスを提供。",
# "contact_info": {
# "phone": "0233-28-9371, 0233-28-1808",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄徳洲会介護センター",
# "location": "新庄市"
# },
# {
# "service_name": "くらしのたすけあいの会（生協）",
# "category": "生活支援（介護保険外）",
# "target_users": "会員",
# "description": "家事全般・通院援助などを提供。利用時は事前に会員に登録し、利用券を購入する必要があります。",
# "contact_info": {
# "phone": "0233-22-8893",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "くらしのたすけあいの会（生協）",
# "location": "新庄市"
# },
# {
# "service_name": "シルバー人材センター",
# "category": "生活支援（介護保険外）",
# "target_users": null,
# "description": "家事手伝い、病人の付き添い、雪囲い、屋根雪下ろし・除雪など様々なサービスを提供。",
# "contact_info": {
# "phone": "0233-22-3065",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "シルバー人材センター",
# "location": "新庄市"
# },
# {
# "service_name": "どんぐり",
# "category": "生活支援（介護保険外）",
# "target_users": null,
# "description": "家事全般・通院援助などを提供。30分ごとに料金が加算されます。",
# "contact_info": {
# "phone": "0233-29-4556",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "どんぐり",
# "location": "新庄市"
# },
# {
# "service_name": "カイセイ 訪問介護事業所",
# "category": "生活支援（介護保険外）",
# "target_users": "どなたでも利用可能（一部サービスはカイセイ訪問介護事業所を利用している方が対象）",
# "description": "身体介護、家事援助、付き添い、買い物、安否確認、服薬確認、ゴミ出しなどを提供。",
# "contact_info": {
# "phone": "0233-29-2912",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "カイセイ",
# "location": "新庄市"
# },
# {
# "service_name": "ニチイケアセンター",
# "category": "生活支援（介護保険外）",
# "target_users": "子どもから高齢者・障がい者まで幅広く対応",
# "description": "期間限定で契約を結び、プランを組んでサービスを提供。料金はプランの組み合わせにより異なります。",
# "contact_info": {
# "phone": "0120-212-295, 0233-28-0050",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ニチイケアセンター",
# "location": "新庄市"
# },
# {
# "service_name": "訪問介護事業所 すまいる",
# "category": "生活支援（介護保険外）",
# "target_users": "訪問介護事業所すまいるを利用している要支援・要介護者",
# "description": "24時間対応。家事全般、除雪作業、通院や入院、銀行などの付き添い、身の回りのお世話、散歩やお話相手などを提供。安否確認やゴミ出し、服薬確認も実施。",
# "contact_info": {
# "phone": "0233-32-1300",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "訪問介護事業所 すまいる",
# "location": "新庄市"
# },
# {
# "service_name": "訪問看護ステーションアーユス新庄",
# "category": "訪問看護事業所（独自サービス）",
# "target_users": null,
# "description": "自費訪問看護、経管栄養、導尿、清潔援助、吸引、バイタルチェックなど。介護保険額に準ずる10割負担。",
# "contact_info": {
# "phone": "0233-77-4418",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "訪問看護ステーションアーユス新庄",
# "location": "新庄市"
# },
# {
# "service_name": "新庄徳洲会訪問看護ステーション",
# "category": "訪問看護事業所（独自サービス）",
# "target_users": "人工呼吸器利用など医療依存度の高い方",
# "description": "医療依存度の高い方への訪問看護。訪問看護の長時間利用や緊急時訪問サービスあり。",
# "contact_info": {
# "phone": "0233-29-4607",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄徳洲会訪問看護ステーション",
# "location": "新庄市"
# },
# {
# "service_name": "訪問看護ステーション新庄",
# "category": "訪問看護事業所（独自サービス）",
# "target_users": null,
# "description": "看護師が月1回自宅訪問し、健康状態や生活状況の確認、電話相談、受診支援を行う。",
# "contact_info": {
# "phone": "0233-28-7330",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "訪問看護ステーション新庄",
# "location": "新庄市"
# },
# {
# "service_name": "訪問看護ステーション コティエ",
# "category": "訪問看護事業所（医療保険）",
# "target_users": null,
# "description": "健康観察・相談、生活指導、服薬管理など、精神科訪問看護を提供。精神科医師からの指示書が必要。",
# "contact_info": {
# "phone": "0233-32-0542",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "訪問看護ステーション コティエ",
# "location": "新庄市"
# },
# {
# "service_name": "認定栄養ケア・ステーション D-june（だじゅね）",
# "category": "訪問栄養指導事業所（認定栄養ケアステーション）",
# "target_users": null,
# "description": "栄養相談・特定保健指導、訪問栄養指導、給食献立作成指導、ワンコイン栄養相談（1回500円）などを実施。",
# "contact_info": {
# "phone": "090-4551-4790",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "日本栄養士会",
# "location": "新庄市"
# },
# {
# "service_name": "ほし薬局栄養ケアステーション「Hi-to!」",
# "category": "訪問栄養指導事業所（認定栄養ケアステーション）",
# "target_users": null,
# "description": "食、栄養相談（訪問型）、検診後の食事指導、外来栄養指導、給食献立作成などを提供。",
# "contact_info": {
# "phone": "0233-28-8693",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ほし薬局",
# "location": "新庄市"
# },
# {
# "service_name": "（公社）山形県栄養士会 栄養ケアステーション 栄養ケアもがみ D-nya（だーにゃ）",
# "category": "訪問栄養指導事業所（認定栄養ケアステーション）",
# "target_users": "食事等でお困りの方、栄養についてご質問のある方",
# "description": "栄養相談・栄養指導・調理実習（幼時から高齢者対象）、在宅訪問栄養指導、給食献立作成などを提供。",
# "contact_info": {
# "phone": "080-1817-7019",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "（公社）山形県栄養士会",
# "location": "新庄市"
# },
# {
# "service_name": "ほし薬局",
# "category": "訪問服薬管理指導事業所",
# "target_users": "認知症、緩和ケアなどの専門性を必要とする方から、飲み忘れの支援まで幅広く",
# "description": "無菌調剤、介護用品販売、医療材料支給。在宅対応24時間可能。在宅訪問実績（年間）1,106件。",
# "contact_info": {
# "phone": "0233-28-8693",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ほし薬局",
# "location": "新庄市"
# },
# {
# "service_name": "アイン薬局新庄店",
# "category": "訪問服薬管理指導事業所",
# "target_users": null,
# "description": "医療材料支給（特定保健医療材料含む）。24時間オンコール態勢あり。在宅訪問実績（年間）5件。",
# "contact_info": {
# "phone": "0233-28-8150",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "アイン薬局新庄店",
# "location": "新庄市"
# },
# {
# "service_name": "おおてまち薬局",
# "category": "訪問服薬管理指導事業所",
# "target_users": null,
# "description": "無菌調剤、医療材料支給（特定保健医療材料含む）。24時間オンコール態勢あり。在宅訪問実績（年間）1件。",
# "contact_info": {
# "phone": "0233-32-1981",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "おおてまち薬局",
# "location": "新庄市"
# },
# {
# "service_name": "かねざわ薬局",
# "category": "訪問服薬管理指導事業所",
# "target_users": null,
# "description": "無菌調剤、介護用品販売、医療材料支給（特定保健医療材料含む）。24時間オンコール態勢あり。在宅訪問実績（年間）15件。",
# "contact_info": {
# "phone": "0233-29-7300",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "かねざわ薬局",
# "location": "新庄市"
# },
# {
# "service_name": "かんきょう",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "介護保険申請中の方、事業対象者、要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,350円。",
# "contact_info": {
# "phone": "0237-43-0294",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "かんきょう",
# "location": "新庄市"
# },
# {
# "service_name": "蔵王サプライズ",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,300円。",
# "contact_info": {
# "phone": "0233-32-0036",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "蔵王サプライズ",
# "location": "新庄市"
# },
# {
# "service_name": "シープ",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "介護保険申請中の方、事業対象者、要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,300円〜1,500円。",
# "contact_info": {
# "phone": "0233-22-1199",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "シープ",
# "location": "新庄市"
# },
# {
# "service_name": "多田木工",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,600円。",
# "contact_info": {
# "phone": "023-653-5629",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "多田木工",
# "location": "新庄市"
# },
# {
# "service_name": "はっぴぃーアシスト",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "介護保険申請中の方、事業対象者、要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,500円。",
# "contact_info": {
# "phone": "0237-72-2080",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "はっぴぃーアシスト",
# "location": "新庄市"
# },
# {
# "service_name": "ぱれっと",
# "category": "福祉用具サービス（電動ベッド）",
# "target_users": "介護保険申請中の方、事業対象者、要支援1・2、要介護1",
# "description": "電動ベッド、マットレス、サイドレール、ベットパット、防水シーツをレンタル。月額料金1,300円〜。",
# "contact_info": {
# "phone": "0233-25-2231",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ぱれっと",
# "location": "新庄市"
# },
# {
# "service_name": "かんきょう",
# "category": "福祉用具サービス（車いす）",
# "target_users": "介護保険申請中の方、要支援1〜要介護1",
# "description": "カタログから車いすを選択してレンタル。カタログ記載単価の0.5倍の月額料金。",
# "contact_info": {
# "phone": "0237-43-0294",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "かんきょう",
# "location": "新庄市"
# },
# {
# "service_name": "蔵王サプライズ",
# "category": "福祉用具サービス（車いす）",
# "target_users": "介護保険申請中の方、要支援1〜要介護1",
# "description": "介助式、自走式から選択可能。月額料金800円。",
# "contact_info": {
# "phone": "0233-32-0036",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "蔵王サプライズ",
# "location": "新庄市"
# },
# {
# "service_name": "シープ",
# "category": "福祉用具サービス（車いす）",
# "target_users": "介護保険申請中の方、事業対象者〜要介護1",
# "description": "自走式が中心で、介助式は要相談。月額料金800円。",
# "contact_info": {
# "phone": "0233-22-1199",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "シープ",
# "location": "新庄市"
# },
# {
# "service_name": "はっぴぃーアシスト",
# "category": "福祉用具サービス（車いす）",
# "target_users": "介護保険申請中の方、事業対象者〜要介護1",
# "description": "介助式、自走式から選択可能。月額料金3,000円。",
# "contact_info": {
# "phone": "0237-72-2080",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "はっぴぃーアシスト",
# "location": "新庄市"
# },
# {
# "service_name": "ぱれっと",
# "category": "福祉用具サービス（車いす）",
# "target_users": "介護保険申請中の方、要支援1〜要介護1",
# "description": "介助式、自走式から選択可能。月額料金2,500円〜3,000円。",
# "contact_info": {
# "phone": "0233-25-2231",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "ぱれっと",
# "location": "新庄市"
# },
# {
# "service_name": "老人福祉センター",
# "category": "福祉用具サービス（車いす）",
# "target_users": "すべての方（要介護2〜5の方は7日間まで）",
# "description": "車いすの無料貸し出し。貸出期間は1ヶ月。印鑑を持参して申請が必要。",
# "contact_info": {
# "phone": "0233-23-3077",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "老人福祉センター",
# "location": "新庄市"
# },
# {
# "service_name": "新庄市役所 成人福祉課",
# "category": "福祉用具サービス（車いす）",
# "target_users": "すべての方",
# "description": "車いすの無料貸し出し。貸出期間は1週間。印鑑持参で即日貸し出し可能。",
# "contact_info": {
# "phone": "0233-22-2111",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市役所",
# "location": "新庄市"
# },
# {
# "service_name": "地域ふれあいサロン",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "65歳以上の方",
# "description": "地域の公民館等を活用し、高齢者が少人数で気軽に集まり、語らいや趣味活動など楽しい時間を過ごす場所。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "いっぷくオレンジカフェ",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "認知症に関心のある方",
# "description": "気軽な雰囲気で認知症について学んだり、認知症を話題に交流できる場所。",
# "contact_info": {
# "phone": "0233-28-0330",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市地域包括支援センター",
# "location": "新庄市"
# },
# {
# "service_name": "愛のひと声運動",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "独居高齢者等",
# "description": "安否確認のため、ひと声をかけながら、乳酸飲料を月・水・金の回数制で無料配布する。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "訪問理美容ボランティア「チョキボラ」",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "外出が困難な高齢者または身体障がい者",
# "description": "理美容師が自宅を訪問しカットを行う。1回1,500円。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "無料法律相談",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "新庄市在住の方",
# "description": "多重債務・離婚調停・財産分与・土地問題等の各種相談が可能。毎月第3週木曜日13:30〜16:00に開催（要予約）。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "福祉サービス利用援助事業",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "判断能力の低下した、高齢者・知的障がい者・精神障がい者",
# "description": "福祉サービスの利用援助、日常的な金銭管理、書類などの預かりサービス。利用料1回あたり1,500円。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "生活福祉資金",
# "category": "新庄市社会福祉協議会事業",
# "target_users": "低所得者世帯、高齢者世帯、身体・知的・精神障がい者世帯",
# "description": "資金の貸付を行うことにより、経済的自立及び生活意欲の助長促進を図ることを目的とした貸付制度。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "緊急通報システム（やすらぎ電話）",
# "category": "新庄市成人福祉課事業",
# "target_users": "一人暮らしの高齢者等",
# "description": "一人暮らし等の高齢者からの急病及び健康相談について民間の受信センターが受け、状況に応じて対応。使用料は220円/月（税別）。",
# "contact_info": {
# "phone": "0233-29-5809",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "除雪サービス",
# "category": "新庄市成人福祉課事業",
# "target_users": "本人及び生計中心者の納めるべき所得税がない世帯で、自力での除雪が困難な方",
# "description": "屋根の雪下ろしや玄関前の除雪を行う。屋根の雪下ろしは年3回まで（費用1割を本人負担）。玄関前雪払いは月8時間まで（費用1割を本人負担）。",
# "contact_info": {
# "phone": "0233-29-5809",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "紙おむつの支給",
# "category": "新庄市成人福祉課事業",
# "target_users": "本人及び生計中心者の納めるべき所得税がなく、かつ要介護3・4・5のいずれかを受けた方、又は同程度の状態の方",
# "description": "低所得者世帯であって、寝たきりや認知症のため常時失禁状態にある方に紙おむつを宅配。",
# "contact_info": {
# "phone": "0233-29-5809",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "成年後見制度利用支援",
# "category": "新庄市成人福祉課事業",
# "target_users": "要支援者または配偶者及び二親等以内の家族が審判請求を行う見込みがない者のうち、市長が必要と認めた者",
# "description": "判断能力が不十分な認知症高齢者などで、成年後見の審判請求が困難な方に対し、補完したり、経費の助成を行う。",
# "contact_info": {
# "phone": "0233-29-5809",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "安心見守り事前登録",
# "category": "新庄市成人福祉課事業",
# "target_users": "認知症などにより徘徊や迷子になる心配のある高齢者",
# "description": "高齢者の情報を市に事前登録し、行方不明になった時に警察や関係機関と共有し、早期発見に繋げる。",
# "contact_info": {
# "phone": "0233-29-5809",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "生活自立支援センター最上",
# "category": "相談機関",
# "target_users": "生活や仕事に関する困り事がある方",
# "description": null,
# "contact_info": {
# "phone": "0233-32-1585",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "生活自立支援センター最上",
# "location": "新庄市"
# },
# {
# "service_name": "新庄市地域包括支援センター",
# "category": "相談機関",
# "target_users": "高齢者",
# "description": "高齢者の保健・医療・福祉・介護等の総合的な相談窓口。",
# "contact_info": {
# "phone": "0233-28-0330",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市地域包括支援センター",
# "location": "新庄市"
# },
# {
# "service_name": "新庄市健康課",
# "category": "相談機関",
# "target_users": null,
# "description": "精神科医師または臨床心理士による心の健康相談、ひきこもり・アルコール相談、暮らしの悩み相談（司法書士による）など。",
# "contact_info": {
# "phone": "0233-29-5791",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市健康課",
# "location": "新庄市"
# },
# {
# "service_name": "最上保健所",
# "category": "相談機関",
# "target_users": null,
# "description": "精神科医師または臨床心理士による心の健康相談、ひきこもり・アルコール相談など。",
# "contact_info": {
# "phone": "0233-29-1266",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "最上保健所",
# "location": "新庄市"
# },
# {
# "service_name": "県精神保健福祉センター",
# "category": "相談機関",
# "target_users": null,
# "description": "心の健康相談。",
# "contact_info": {
# "phone": "023-631-7060",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "県精神保健福祉センター",
# "location": "山形県"
# },
# {
# "service_name": "山形いのちの電話",
# "category": "相談機関",
# "target_users": null,
# "description": "心の健康相談。年中無休で対応。",
# "contact_info": {
# "phone": "023-645-4343",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "山形いのちの電話",
# "location": "山形県"
# },
# {
# "service_name": "県警察本部少年課",
# "category": "相談機関",
# "target_users": "少年",
# "description": "少年の非行や事件、その他の悩みに関する相談。土日祝祭日、夜間も対応。",
# "contact_info": {
# "phone": "023-642-1777",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "県警察本部少年課",
# "location": "山形県"
# },
# {
# "service_name": "新庄市成人福祉課",
# "category": "相談機関",
# "target_users": "介護など高齢者に関する相談、生活保護に関する相談",
# "description": "介護など高齢者に関する相談、生活保護に関する相談窓口。",
# "contact_info": {
# "phone": "0233-29-5809, 0233-29-5808",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市成人福祉課",
# "location": "新庄市"
# },
# {
# "service_name": "最上障がい者就業生活支援センター",
# "category": "相談機関",
# "target_users": "障がい者",
# "description": "障がい者の就労や生活に関する相談窓口。",
# "contact_info": {
# "phone": "0233-23-4528",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "最上障がい者就業生活支援センター",
# "location": "新庄市"
# },
# {
# "service_name": "新庄市社会福祉協議会",
# "category": "相談機関",
# "target_users": null,
# "description": "福祉に関する心配事や悩み事相談、無料法律相談など。",
# "contact_info": {
# "phone": "0233-22-5797",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市社会福祉協議会",
# "location": "新庄市"
# },
# {
# "service_name": "県警察本部生活環境課",
# "category": "相談機関",
# "target_users": null,
# "description": "悪質商法に関する相談。24時間対応。",
# "contact_info": {
# "phone": "023-642-4477",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "県警察本部生活環境課",
# "location": "山形県"
# },
# {
# "service_name": "新庄市消費生活センター（市市民課）",
# "category": "相談機関",
# "target_users": null,
# "description": "消費生活トラブルに関する相談窓口。",
# "contact_info": {
# "phone": "0233-22-2121",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "新庄市消費生活センター",
# "location": "新庄市"
# },
# {
# "service_name": "日本賃金業協会山形県支部",
# "category": "相談機関",
# "target_users": null,
# "description": "賃金業務に関する相談・苦情・紛争解決・貸付自粛申告の受付。",
# "contact_info": {
# "phone": "0570-051-051",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "日本賃金業協会山形県支部",
# "location": "山形県"
# },
# {
# "service_name": "山形県司法書士会",
# "category": "相談機関",
# "target_users": null,
# "description": "司法書士による無料相談窓口。",
# "contact_info": {
# "phone": "023-642-3434",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "山形県司法書士会",
# "location": "山形県"
# },
# {
# "service_name": "山形県弁護士会法律センター",
# "category": "相談機関",
# "target_users": null,
# "description": "法律相談全般。",
# "contact_info": {
# "phone": "023-635-3648",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "山形県弁護士会",
# "location": "山形県"
# },
# {
# "service_name": "法テラス山形",
# "category": "相談機関",
# "target_users": null,
# "description": "法トラブルに関する情報提供など。",
# "contact_info": {
# "phone": "050-3383-5544",
# "fax": null,
# "email": null,
# "url": null
# },
# "provider": "法テラス",
# "location": "山形県"
# }