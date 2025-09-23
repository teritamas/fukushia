"use client";

import { useState, useEffect, useMemo } from "react";
import apiClient from "@/lib/api-client";
import { ResourceManager } from "@/components/ResourceManager";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import { PlusCircle, Search, Edit, Trash2 } from "lucide-react";

type Resource = {
  id: string;
  service_name: string;
  category?: string;
  target_users?: string;
  description?: string;
  eligibility?: string;
  application_process?: string;
  cost?: string;
  provider?: string;
  location?: string;
  contact_phone?: string;
  contact_fax?: string;
  contact_email?: string;
  contact_url?: string;
  source_url?: string;
  keywords?: string[];
};

type Memo = {
  id: string;
  resource_id: string;
  content: string;
  created_at: number;
  updated_at: number;
};

const fieldLabels: Record<string, string> = {
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
  keywords: "キーワード",
};

export default function ResourceManagementPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Resource> | null>(
    null,
  );
  const [isAdding, setIsAdding] = useState(false);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoLoading, setMemoLoading] = useState(false);
  const [newMemoContent, setNewMemoContent] = useState("");

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Resource[]>("/resources/");
      setResources(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "社会資源の読み込みに失敗しました。",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchMemos = async (resourceId: string) => {
    setMemoLoading(true);
    try {
      const data = await apiClient.get<Memo[]>(
        `/resources/${resourceId}/memos`,
      );
      setMemos(data);
    } catch (error) {
      console.error("Failed to fetch memos", error);
    } finally {
      setMemoLoading(false);
    }
  };

  useEffect(() => {
    if (selectedResource) {
      fetchMemos(selectedResource.id);
    }
  }, [selectedResource]);

  const filteredResources = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    if (!lowercasedFilter) return resources;
    return resources.filter((item) =>
      Object.values(item).some((value) =>
        String(value).toLowerCase().includes(lowercasedFilter),
      ),
    );
  }, [searchTerm, resources]);

  const handleOpenModal = (resource: Resource) => {
    setSelectedResource(resource);
    setEditFormData(JSON.parse(JSON.stringify(resource)));
    setIsEditing(false);
  };

  const handleCloseModal = () => {
    setSelectedResource(null);
    setEditFormData(null);
    setIsEditing(false);
    setMemos([]);
    setNewMemoContent("");
  };

  const handleUpdateResource = async () => {
    if (!editFormData || !editFormData.id) return;
    try {
      const updatedResource = await apiClient.patch<Resource>(
        `/resources/${editFormData.id}`,
        editFormData,
      );
      setResources(
        resources.map((r) =>
          r.id === updatedResource.id ? updatedResource : r,
        ),
      );
      handleCloseModal();
    } catch (error) {
      console.error("Failed to update resource", error);
      alert("更新に失敗しました。");
    }
  };

  const handleDeleteResource = async () => {
    if (!selectedResource || !selectedResource.id) return;
    if (
      window.confirm(
        `「${selectedResource.service_name}」を本当に削除しますか？`,
      )
    ) {
      try {
        await apiClient.delete(`/resources/${selectedResource.id}`);
        setResources(resources.filter((r) => r.id !== selectedResource.id));
        handleCloseModal();
      } catch (error) {
        console.error("Failed to delete resource", error);
        alert("削除に失敗しました。");
      }
    }
  };

  const handleFormChange = (
    field: keyof Resource,
    value: string | string[],
  ) => {
    if (editFormData) {
      setEditFormData({ ...editFormData, [field]: value });
    }
  };

  const handleAddMemo = async () => {
    if (!newMemoContent.trim() || !selectedResource) return;
    try {
      const newMemo = await apiClient.post<Memo>(
        `/resources/${selectedResource.id}/memos`,
        {
          content: newMemoContent,
        },
      );
      setMemos([...memos, newMemo]);
      setNewMemoContent("");
    } catch (error) {
      console.error("Failed to add memo", error);
      alert("メモの追加に失敗しました。");
    }
  };

  const handleUpdateMemo = async (memoId: string, oldContent: string) => {
    const newContent = window.prompt("メモを編集してください", oldContent);
    if (newContent && newContent.trim() !== oldContent) {
      try {
        const updatedMemo = await apiClient.patch<Memo>(
          `/resources/memos/${memoId}`,
          {
            content: newContent,
          },
        );
        setMemos(memos.map((m) => (m.id === memoId ? updatedMemo : m)));
      } catch (error) {
        console.error("Failed to update memo", error);
        alert("メモの更新に失敗しました。");
      }
    }
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (window.confirm("このメモを削除しますか？")) {
      try {
        await apiClient.delete(`/resources/memos/${memoId}`);
        setMemos(memos.filter((m) => m.id !== memoId));
      } catch (error) {
        console.error("Failed to delete memo", error);
        alert("メモの削除に失敗しました。");
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">社会資源管理</h2>
          <Button
            onClick={() => setIsAdding(!isAdding)}
            variant="default"
            size="sm"
            className="gbtn tonal text-sm"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            {isAdding ? "閉じる" : "URLから新規追加"}
          </Button>
        </div>
        {isAdding && (
          <div className="p-4 border rounded-lg bg-gray-50 animate-fade-in-down">
            <ResourceManager />
          </div>
        )}
      </div>

      <div>
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="キーワードで検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border p-2 pl-10 w-full rounded-md focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>
        {loading && (
          <p className="text-center text-gray-500 py-10">読み込み中...</p>
        )}
        {error && <p className="text-center text-red-500 py-10">{error}</p>}
        {!loading &&
          !error &&
          (filteredResources.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredResources.map((resource) => (
                <div
                  key={resource.id}
                  className="border border-gray-200 rounded-xl shadow-sm flex flex-col bg-white hover:shadow-lg transition-shadow duration-300 cursor-pointer group"
                  onClick={() => handleOpenModal(resource)}
                >
                  <div className="p-5 flex-grow">
                    <h4 className="font-bold text-lg text-gray-900 group-hover:text-indigo-600 transition-colors">
                      {resource.service_name}
                    </h4>
                    <p className="text-sm text-indigo-600 mt-1 font-medium">
                      {resource.category}
                    </p>
                    <p className="text-sm text-gray-600 mt-3 h-20 overflow-hidden text-ellipsis">
                      {resource.description}
                    </p>
                  </div>
                  <div className="px-5 py-3 bg-gray-50 rounded-b-xl text-center">
                    <span className="text-sm font-semibold text-indigo-600">
                      詳細を見る →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-10">
              該当する社会資源はありません。
            </p>
          ))}
      </div>

      {selectedResource && (
        <Modal isOpen={!!selectedResource} onClose={handleCloseModal}>
          <div className="p-1 sm:p-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              {editFormData?.service_name}
            </h2>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-3">
              {Object.keys(fieldLabels).map((key) => {
                const resourceKey = key as keyof Resource;
                const label = fieldLabels[key];
                const value = editFormData?.[resourceKey];
                if (value === undefined || value === null) return null;
                return (
                  <div key={key}>
                    <label className="font-semibold text-sm text-gray-600">
                      {label}
                    </label>
                    {isEditing ? (
                      Array.isArray(value) ? (
                        <input
                          type="text"
                          value={value.join(", ")}
                          onChange={(e) =>
                            handleFormChange(
                              resourceKey,
                              e.target.value.split(",").map((k) => k.trim()),
                            )
                          }
                          className="border p-2 w-full mt-1 rounded-md focus:ring-2 focus:ring-indigo-500"
                          placeholder="カンマ区切りで入力"
                        />
                      ) : (
                        <textarea
                          value={String(value)}
                          onChange={(e) =>
                            handleFormChange(resourceKey, e.target.value)
                          }
                          className="border p-2 w-full mt-1 rounded-md h-24 focus:ring-2 focus:ring-indigo-500"
                          rows={3}
                        />
                      )
                    ) : (
                      <div className="p-2 rounded-md mt-1 text-sm text-gray-800 whitespace-pre-wrap bg-gray-100 min-h-[40px]">
                        {Array.isArray(value)
                          ? value.join(", ")
                          : String(value)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-md text-gray-700 mb-2">
                  メモ
                </h3>
                {memoLoading ? (
                  <p className="text-sm text-gray-500">メモを読み込み中...</p>
                ) : (
                  <div className="space-y-2">
                    {memos.map((memo) => (
                      <div
                        key={memo.id}
                        className="text-sm bg-white border rounded-md p-2 group"
                      >
                        <p className="whitespace-pre-wrap text-gray-800">
                          {memo.content}
                        </p>
                        <div className="text-right mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() =>
                              handleUpdateMemo(memo.id, memo.content)
                            }
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            編集
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-red-500"
                            onClick={() => handleDeleteMemo(memo.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            削除
                          </Button>
                        </div>
                      </div>
                    ))}
                    {memos.length === 0 && (
                      <p className="text-xs text-gray-500">
                        まだメモはありません。
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <textarea
                    value={newMemoContent}
                    onChange={(e) => setNewMemoContent(e.target.value)}
                    placeholder="新しいメモを追加..."
                    className="border p-2 w-full mt-1 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                  />
                  <Button
                    onClick={handleAddMemo}
                    disabled={!newMemoContent.trim()}
                    className="self-end"
                  >
                    追加
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              {isEditing ? (
                <>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setEditFormData(selectedResource);
                    }}
                    variant="outline"
                  >
                    キャンセル
                  </Button>
                  <Button onClick={handleUpdateResource}>この内容で保存</Button>
                </>
              ) : (
                <>
                  <Button onClick={handleDeleteResource} variant="destructive">
                    削除
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>編集する</Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
