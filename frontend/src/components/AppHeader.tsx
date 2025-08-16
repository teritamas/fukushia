"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { useClientContext, ClientData } from "./ClientContext";

interface AppHeaderProps {
  active: string;
  onChange: (key: string) => void;
}

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: "notes", label: "メモ・TODO" },
  { key: "resources", label: "社会資源" },
];

export default function AppHeader({ active, onChange }: AppHeaderProps) {
  const { currentClient, setCurrentClient, requestGoToBasicInfo } =
    useClientContext();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
  const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";

  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const ref = collection(
          db,
          `artifacts/${APP_ID}/users/${USER_ID}/clients`
        );
        const q = query(ref, orderBy("createdAt", "asc"));
        const snap = await getDocs(q);
        const list: ClientData[] = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          photoUrl: d.data().photoUrl,
          basicInfo: d.data().basicInfo,
        }));
        setClients(list);
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (id: string) => {
    if (id === "__add__") {
      setShowAdd(true);
      return;
    }
    const next = clients.find((c) => c.id === id) || null;
    setCurrentClient(next);
    // Ensure the main view switches to ClientWorkspace just like clicking the header button
    onChange("clients");
    setMenuOpen(false);
  };

  const handleAddClient = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const ref = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/clients`
      );
      const docRef = await addDoc(ref, {
        name: newName.trim(),
        photoUrl: newPhotoUrl.trim() || null,
        createdAt: Timestamp.now(),
      });
      const data: ClientData = {
        id: docRef.id,
        name: newName.trim(),
        photoUrl: newPhotoUrl.trim() || undefined,
      };
      setClients((prev) => [...prev, data]);
      setCurrentClient(data);
      // After creating/selecting a new client, switch to ClientWorkspace
      onChange("clients");
      setShowAdd(false);
      setNewName("");
      setNewPhotoUrl("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <header className="w-full sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-blue-800 text-white header-shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
        <button
          className="text-left text-lg font-semibold tracking-wide hover:opacity-90"
          onClick={() => {
            onChange("clients");
            requestGoToBasicInfo();
          }}
          title="ダッシュボードに戻る"
        >
          福祉支援ダッシュボード
        </button>
        <div className="ml-auto flex items-center gap-3">
          <nav className="flex flex-wrap items-center gap-2">
            {/* カスタムドロップダウン（hoverで展開、メニューは白） */}
            <div
              className="relative group"
              onMouseEnter={() => setMenuOpen(true)}
            >
              <button
                type="button"
                tabIndex={0}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                onClick={() => {
                  onChange("clients");
                  setMenuOpen((v) => !v);
                }}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setMenuOpen(true);
                  } else if (e.key === "Escape") {
                    setMenuOpen(false);
                  }
                }}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm min-w-[240px] justify-between shadow-md hover-scale ${active === "clients" ? "bg-blue-600 text-white border-transparent" : "bg-white/95 text-gray-800 border-white/70 dark:bg-gray-900 dark:text-gray-200 dark:border-white/10"}`}
              >
                <span className="truncate max-w-[170px]">
                  {currentClient?.name ||
                    (loadingClients ? "読み込み中..." : "支援対象者を選択")}
                </span>
                <span className="text-xs opacity-80">▾</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-0 w-[300px] rounded-md rounded-t-none border border-gray-200 bg-white text-gray-800 shadow-2xl ring-1 ring-black/5 z-50"
                  onMouseEnter={() => setMenuOpen(true)}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="max-h-[60vh] overflow-auto py-1">
                    {clients.length === 0 && !loadingClients && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        支援対象者がいません
                      </div>
                    )}
                    {clients.map((c) => {
                      const isSelected = currentClient?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelect(c.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 hover-scale flex items-center justify-between ${isSelected ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800 dark:text-gray-200"}`}
                          aria-current={isSelected ? "true" : undefined}
                        >
                          <span className="truncate">{c.name}</span>
                          {isSelected && (
                            <span className="ml-2 text-blue-600">✓</span>
                          )}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t" />
                    <button
                      onClick={() => onSelect("__add__")}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--brand-600)] hover:bg-gray-50 dark:hover:bg-white/5 hover-scale"
                    >
                      新しい支援対象者を追加
                    </button>
                  </div>
                </div>
              )}
            </div>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                aria-current={active === item.key ? "page" : undefined}
                className={`px-3 py-2 rounded-full text-sm transition border shadow-sm hover-scale ${active === item.key ? "bg-blue-600 text-white border-blue-600" : "bg-white/95 text-gray-800 border-white/70 hover:bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-white/10 dark:hover:bg-white/5"} `}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        {/* 追加モーダル */}
        {showAdd &&
          typeof window !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-[1000] grid place-items-center bg-black/30"
              onClick={() => {
                setShowAdd(false);
                setNewName("");
                setNewPhotoUrl("");
              }}
            >
              <div
                className="surface card-shadow w-[92%] max-w-sm p-5 rounded-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold mb-3 section-title">
                  新しい支援対象者を追加
                </h3>
                <div className="space-y-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="氏名"
                    className="w-full ginput text-sm"
                  />
                  <input
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    placeholder="写真URL（任意）"
                    className="w-full ginput text-sm"
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    onClick={() => {
                      setShowAdd(false);
                      setNewName("");
                      setNewPhotoUrl("");
                    }}
                    className="gbtn text"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleAddClient}
                    disabled={adding || !newName.trim()}
                    className="gbtn primary disabled:opacity-60"
                  >
                    {adding ? "追加中..." : "追加"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </header>
  );
}
