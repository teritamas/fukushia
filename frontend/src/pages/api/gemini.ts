import type { NextApiRequest, NextApiResponse } from "next";

// 実際はGoogle Generative AI SDKやfetchでGemini APIを呼び出してください
// ここではダミー応答
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { text } = req.body;
  if (!text) {
    res.status(400).json({ error: "No text provided" });
    return;
  }



  // Next.js API Routeはダミー応答のみ返します。
  // 実際のGemini API呼び出しはPython FastAPIサーバーで行ってください。

  // ダミー応答
  res.status(200).json({ result: `Gemini APIの要約: ${text.slice(0, 100)}...` });
}
