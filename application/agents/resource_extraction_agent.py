import io
import os
import httpx
from PyPDF2 import PdfReader
from bs4 import BeautifulSoup
from typing import List
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate


class SocialResource(BaseModel):
    service_name: str = Field(description="サービス名")
    category: str = Field(description="カテゴリー")
    target_users: str = Field(description="対象者")
    description: str = Field(description="説明")
    eligibility: str = Field(description="利用資格")
    application_process: str = Field(description="申請方法")
    cost: str = Field(description="費用")
    provider: str = Field(description="提供者")
    location: str = Field(description="場所")
    contact_phone: str = Field(description="電話番号")
    contact_email: str = Field(description="メールアドレス")
    contact_url: str = Field(description="URL")
    source_url: str = Field(description="情報抽出元のURL")
    keywords: List[str] = Field(description="検索精度を向上させるためのキーワードやタグ")


async def extract_resource_from_url(url: str) -> SocialResource:
    """
    URLから社会資源情報を抽出する。
    PDFとWebページに対応しています。
    """
    text = ""
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")

        if "application/pdf" in content_type:
            pdf_file = io.BytesIO(response.content)
            reader = PdfReader(pdf_file)
            for page in reader.pages:
                text += page.extract_text()
        else:
            soup = BeautifulSoup(response.text, "html.parser")
            text = soup.get_text()

    llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-pro-latest",
        temperature=0,
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )
    structured_llm = llm.with_structured_output(SocialResource)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "あなたは、テキストから社会資源情報を抽出する専門家です。以下のテキストから、指定された項目を抽出してください。また、内容を要約した検索用のキーワードを5つ生成してください。",
            ),
            ("human", "{text}"),
        ]
    )

    chain = prompt | structured_llm
    result = await chain.ainvoke({"text": text[:16000]})  # トークン数制限を考慮
    result.source_url = url  # add source url
    return result
