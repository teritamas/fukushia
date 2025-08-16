import { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

interface ClientListProps {
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  clients: string[];
  setClients: (clients: string[]) => void;
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
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID =
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    await addDoc(
      collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`),
      {
        name: newClient.trim(),
        createdAt: Timestamp.now(),
      },
    );
    setClients([...clients, newClient.trim()]);
    setNewClient("");
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newClient}
          onChange={(e) => setNewClient(e.target.value)}
          placeholder="新しい支援者名"
          className="border px-2 py-1 rounded"
        />
        <button
          onClick={handleAddClient}
          className="bg-blue-500 text-white px-3 py-1 rounded"
        >
          追加
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {clients.map((c) => (
          <button
            key={c}
            className={`px-3 py-1 rounded border ${
              selectedClient === c
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setSelectedClient(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
