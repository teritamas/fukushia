import { useState } from "react";
import { clientApi } from "../lib/api-client";
import { useClientContext } from "./ClientContext";

export default function ClientList() {
  const { clients, currentClient, setCurrentClient, refetchClients } =
    useClientContext();
  const [newClient, setNewClient] = useState("");

  // 新規支援者追加
  const handleAddClient = async () => {
    if (!newClient.trim()) return;
    try {
      const createdClient = await clientApi.create({ name: newClient.trim() });
      await refetchClients();
      setCurrentClient(createdClient);
      setNewClient("");
    } catch (error) {
      console.error("Failed to create client:", error);
      // エラーハンドリング - 必要に応じて追加実装
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newClient}
          onChange={(e) => setNewClient(e.target.value)}
          placeholder="新しい支援者名"
          className="border border-[var(--ginput-border)] px-2 py-1 rounded bg-[var(--surface)] text-[var(--foreground)]"
        />
        <button
          onClick={handleAddClient}
          className="bg-[var(--brand-600)] hover:bg-[var(--brand-700)] text-white px-3 py-1 rounded"
        >
          追加
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {clients.map((c) => (
          <button
            key={c.id}
            className={`px-3 py-1 rounded border ${
              currentClient?.id === c.id
                ? "bg-[var(--brand-600)] text-white border-transparent"
                : "bg-[var(--chip-bg)] text-[var(--foreground)] border-[var(--border)]"
            }`}
            onClick={() => setCurrentClient(c)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
