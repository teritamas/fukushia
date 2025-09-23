import React, { useState } from "react";

interface MemoFormProps {
  clients?: { id: string; name: string }[];
  defaultClientName?: string;
  initialContent?: string;
  onSave: (memo: {
    clientName: string;
    speaker: string;
    content: string;
  }) => void;
  onCancel: () => void;
}

const MemoForm: React.FC<MemoFormProps> = ({
  clients,
  defaultClientName,
  initialContent = "",
  onSave,
  onCancel,
}) => {
  const [clientName, setClientName] = useState(
    defaultClientName || clients?.[0]?.name || "",
  );
  const [speaker, setSpeaker] = useState("");
  const [content, setContent] = useState(initialContent);

  const handleSave = () => {
    if (!content.trim() || !clientName) return;
    onSave({ clientName, speaker, content });
    setSpeaker("");
    setContent("");
  };

  return (
    <div className="p-4 rounded-lg bg-[var(--surface)]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {clients && (
          <div>
            <label className="text-sm font-medium text-[var(--foreground)] block mb-1">
              対象クライアント
            </label>
            <select
              className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--muted)] w-16">発言者</label>
          <input
            className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="例: 本人 / 家族"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="bg-[var(--gbtn-hover-bg)] text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale text-[var(--foreground)]"
              onClick={() => setSpeaker("本人")}
            >
              本人
            </button>
            <button
              type="button"
              className="bg-[var(--gbtn-hover-bg)] text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale text-[var(--foreground)]"
              onClick={() => setSpeaker("家族")}
            >
              家族
            </button>
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="text-sm font-medium text-[var(--foreground)] block mb-1">
          メモ内容
        </label>
        <textarea
          className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="活動や気づき、課題など"
          rows={4}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="bg-[var(--brand-600)] hover:bg-[var(--brand-700)] text-white px-4 py-2 rounded-lg hover-scale"
          onClick={handleSave}
        >
          保存
        </button>
        <button
          className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded-lg hover-scale"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
};

export default MemoForm;
