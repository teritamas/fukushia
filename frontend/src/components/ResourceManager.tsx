"use client";

import { useState } from "react";
import apiClient from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type SocialResource = {
  service_name: string;
  category: string;
  target_users: string;
  description: string;
  eligibility: string;
  application_process: string;
  cost: string;
  provider: string;
  location: string;
  contact_phone: string;
  contact_email: string;
  contact_url: string;
  source_url: string;
  keywords: string[];
};

const fieldLabels: Record<keyof Omit<SocialResource, "keywords">, string> = {
  service_name: "サービス名",
  category: "カテゴリー",
  target_users: "対象者",
  description: "説明",
  eligibility: "利用資格",
  application_process: "申請方法",
  cost: "費用",
  provider: "提供者",
  location: "場所",
  contact_phone: "電話番号",
  contact_email: "メールアドレス",
  contact_url: "URL",
  source_url: "情報源URL",
};

export function ResourceManager() {
  const [url, setUrl] = useState("");
  const [extractedResource, setExtractedResource] =
    useState<SocialResource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resource = await apiClient.post<SocialResource>(
        "/resources/extract-from-url",
        { url },
      );
      setExtractedResource(resource);
    } catch (err) {
      setError("情報の抽出に失敗しました。");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!extractedResource) return;
    try {
      await apiClient.post("/resources/", extractedResource);
      alert("社会資源を保存しました。");
      setExtractedResource(null);
      setUrl("");
    } catch (err) {
      alert("保存に失敗しました。");
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">社会資源の追加</h2>
      <div className="flex items-center mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="PDFまたはWebページのURL"
          className="border p-2 flex-grow"
        />
        <Button onClick={handleExtract} disabled={isLoading} className="ml-2">
          {isLoading ? "抽出中..." : "情報を抽出"}
        </Button>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      {extractedResource && (
        <div className="mt-4">
          <h3 className="text-lg font-bold mb-2">抽出された情報</h3>
          <div className="space-y-3">
            {Object.entries(fieldLabels).map(([key, label]) => (
              <div key={key}>
                <label className="font-semibold text-sm">{label}</label>
                <input
                  type="text"
                  readOnly={key === "source_url"}
                  value={
                    extractedResource[key as keyof typeof fieldLabels] || ""
                  }
                  onChange={(e) =>
                    setExtractedResource({
                      ...extractedResource,
                      [key]: e.target.value,
                    })
                  }
                  className={`border p-2 w-full mt-1 rounded-md ${
                    key === "source_url" ? "bg-gray-100" : ""
                  }`}
                />
              </div>
            ))}
            <div>
              <label className="font-semibold text-sm">キーワード</label>
              <input
                type="text"
                value={extractedResource.keywords.join(", ")}
                onChange={(e) =>
                  setExtractedResource({
                    ...extractedResource,
                    keywords: e.target.value.split(",").map((k) => k.trim()),
                  })
                }
                className="border p-2 w-full mt-1 rounded-md"
                placeholder="カンマ区切りで入力"
              />
            </div>
          </div>
          <Button onClick={handleSave} className="mt-4">
            保存
          </Button>
        </div>
      )}
    </div>
  );
}
