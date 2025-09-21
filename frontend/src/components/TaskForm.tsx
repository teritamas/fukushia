import React, { useState } from "react";

interface TaskFormProps {
  clients?: { id: string; name: string }[];
  defaultClientName?: string;
  onSave: (task: {
    clientName: string;
    text: string;
    dueDate: string;
  }) => void;
  onCancel: () => void;
}

const TaskForm: React.FC<TaskFormProps> = ({
  clients,
  defaultClientName,
  onSave,
  onCancel,
}) => {
  const [clientName, setClientName] = useState(
    defaultClientName || clients?.[0]?.name || "",
  );
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleSave = () => {
    if (!text.trim() || !clientName) return;
    onSave({ clientName, text, dueDate });
    setText("");
    setDueDate("");
  };

  return (
    <div className="p-4 rounded-lg bg-[var(--surface)] mb-4">
      <div className="space-y-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2">
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
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--foreground)] block mb-1">
            タスク内容
          </label>
          <textarea
            rows={3}
            className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="タスク内容を入力"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] block mb-1">
            期限
          </label>
          <input
            type="date"
            className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
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

export default TaskForm;
