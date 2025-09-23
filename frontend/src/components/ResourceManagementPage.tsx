"use client";

import { useState, useEffect, useMemo } from "react";
import apiClient from "@/lib/api-client";
import { ResourceManager } from "@/components/ResourceManager";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";

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

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Resource[]>("/resources/");
      setResources(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

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
    setEditFormData(resource);
    setIsEditing(false);
  };

  const handleCloseModal = () => {
    setSelectedResource(null);
    setEditFormData(null);
    setIsEditing(false);
  };

  const handleUpdate = async () => {
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

  const handleDelete = async () => {
    if (!selectedResource || !selectedResource.id) return;
    if (
      window.confirm(`「${selectedResource.service_name}」を削除しますか？`)
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

  return (
    <div>
      <div className="mb-8 p-4 border rounded-lg bg-gray-50">
        <ResourceManager />
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-bold mb-4">登録済み社会資源一覧</h3>
        <input
          type="text"
          placeholder="登録済み資源を検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border p-2 mb-4 w-full rounded-md"
        />
        {loading && <p>読み込み中...</p>}
        {error && <p className="text-red-500">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map((resource) => (
            <div
              key={resource.id}
              className="border p-4 rounded-lg shadow-sm flex flex-col justify-between"
            >
              <div>
                <h4 className="font-bold text-lg">{resource.service_name}</h4>
                <p className="text-sm text-gray-600 mt-1">
                  {resource.category}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {resource.description?.substring(0, 100)}...
                </p>
              </div>
              <Button
                onClick={() => handleOpenModal(resource)}
                className="mt-4 w-full"
              >
                詳細・編集
              </Button>
            </div>
          ))}
        </div>
      </div>

      {selectedResource && (
        <Modal isOpen={!!selectedResource} onClose={handleCloseModal}>
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">
              {selectedResource.service_name}
            </h2>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {Object.keys(fieldLabels).map((key) => {
                const resourceKey = key as keyof Resource;
                const label = fieldLabels[key];
                const value = editFormData?.[resourceKey];
                if (value === undefined) return null;

                return (
                  <div key={key}>
                    <label className="font-semibold text-sm">{label}</label>
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
                          className="border p-2 w-full mt-1 rounded-md"
                        />
                      ) : (
                        <textarea
                          value={String(value)}
                          onChange={(e) =>
                            handleFormChange(resourceKey, e.target.value)
                          }
                          className="border p-2 w-full mt-1 rounded-md h-24"
                          rows={3}
                        />
                      )
                    ) : (
                      <p className="p-2 bg-gray-100 rounded-md mt-1 text-sm whitespace-pre-wrap">
                        {Array.isArray(value)
                          ? value.join(", ")
                          : String(value)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              {isEditing ? (
                <>
                  <Button onClick={() => setIsEditing(false)} variant="outline">
                    キャンセル
                  </Button>
                  <Button onClick={handleUpdate}>保存</Button>
                </>
              ) : (
                <>
                  <Button onClick={handleDelete} variant="destructive">
                    削除
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>編集</Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
