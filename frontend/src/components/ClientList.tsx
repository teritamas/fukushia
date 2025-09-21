import { useState } from "react";
import { clientApi, Client } from "../lib/api-client";

interface ClientListProps {
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  clients: Client[];
  setClients: (clients: Client[]) => void;
}

export default function ClientList({
  selectedClient,
  setSelectedClient,
  clients,
  setClients,
}: ClientListProps) {
  const [newClient, setNewClient] = useState("");

  // 新規支援者追加
  const handleAddClient = async () => {
    if (!newClient.trim()) return;
    try {
      const createdClient = await clientApi.create({ name: newClient.trim() });
      setClients([...clients, createdClient]);
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
              selectedClient === c.name
                ? "bg-[var(--brand-600)] text-white border-transparent"
                : "bg-[var(--chip-bg)] text-[var(--foreground)] border-[var(--border)]"
            }`}
            onClick={() => setSelectedClient(c.name)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
