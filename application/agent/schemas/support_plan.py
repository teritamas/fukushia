from pydantic.v1 import BaseModel, Field
from typing import List, Optional

class SupporterInfo(BaseModel):
    """支援対象者の基本情報"""
    name: Optional[str] = Field(description="氏名")
    age: Optional[int] = Field(description="年齢")
    address: Optional[str] = Field(description="現住所")
    concerns: str = Field(description="主な困りごとや相談内容")
    judgment_ability: Optional[str] = Field(description="判断能力の状態（例：特に問題なし、少し不安、医師の診断ありなど）")
    service_usage_status: Optional[str] = Field(description="現在利用中の福祉サービス")

class ServiceDetail(BaseModel):
    """提案または検討したサービスの詳細"""
    service_name: str = Field(description="制度やサービスの正式名称")
    overview: str = Field(description="サービスの概要")
    reason: str = Field(description="このサービスを選定した、あるいは不採用とした理由")
    contact_info: Optional[str] = Field(description="連絡先（電話番号、住所など）")
    url: Optional[str] = Field(description="公式サイトなどのURL")

class SupportPlanItem(BaseModel):
    """支援計画の具体的な項目"""
    support_item: str = Field(description="支援項目（例：経済的安定の確保）")
    service_details: str = Field(description="具体的なサービス内容やアクションプラン")
    duration: str = Field(description="実施期間の目安")
    person_in_charge: str = Field(description="主担当者（例：ケースワーカー）")

class FinalSupportPlan(BaseModel):
    """最終的な支援計画の完全な構造"""
    support_plan: dict = Field(description="支援計画全体")
    investigation_results: dict = Field(description="調査結果")

    class Config:
        schema_extra = {
            "example": {
                "support_plan": {
                    "decision_axis": "本人の意思を尊重し、経済的自立と地域での安定した生活の確立を最優先とする",
                    "basis_of_plan": "失職により収入が途絶え、家賃の支払いに窮している状況。本人の就労意欲は高いが、心身の不調も見られるため、生活再建と健康回復を並行して支援する必要があると判断した。",
                    "goal": "安定した収入の確保と生活基盤の再建",
                    "specific_support_content": [
                        {
                            "support_item": "就労による収入確保",
                            "service_details": "ハローワーク長井へ同行し、求職登録と職業相談を行う。同時に、南陽市シルバー人材センターに登録し、短期的な仕事を探す。",
                            "duration": "契約締結後1ヶ月以内",
                            "person_in_charge": "ケースワーカー"
                        }
                    ],
                    "remarks": "緊急小口資金の申請に必要な住民票の取得方法を本人に確認する。"
                },
                "investigation_results": {
                    "adopted_services": [
                        {
                            "service_name": "ハローワーク長井",
                            "overview": "公共職業安定所。求人情報の提供、職業相談、紹介状の発行など",
                            "reason": "本人の就労意欲が高く、多様な求人情報へのアクセスが不可欠なため。",
                            "contact_info": "山形県長井市ままの上7-8",
                            "url": "https://jsite.mhlw.go.jp/yamagata-hellowork/list/nagai.html"
                        }
                    ],
                    "rejected_services": [
                        {
                            "service_name": "株式会社〇〇（民間の有料職業紹介所）",
                            "overview": "IT専門職に特化した転職エージェント",
                            "reason": "本人の職務経験や希望と合致しないため。",
                            "contact_info": "東京都千代田区丸の内1-1-1",
                            "url": "https://example.com"
                        }
                    ]
                }
            }
        }
