"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { clientApi } from "../lib/api-client";
import { useClientContext, ClientData } from "./ClientContext";

interface AppHeaderProps {
  active: string;
  onChange: (key: string) => void;
}

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: "notes", label: "タスク一覧" },
  { key: "resources", label: "社会資源" },
];

export default function AppHeader({ active, onChange }: AppHeaderProps) {
  const {
    clients,
    refetchClients,
    currentClient,
    setCurrentClient,
    requestGoToBasicInfo,
    notifyNewClient,
  } = useClientContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [adding, setAdding] = useState(false);

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
      const newClient = await clientApi.create({
        name: newName.trim(),
      });
      await refetchClients();
      setCurrentClient(newClient); // 作成したクライアントを即座に設定
      notifyNewClient(); // 新規クライアント作成を通知
      // After creating/selecting a new client, switch to ClientWorkspace
      onChange("clients");
      setShowAdd(false);
      setNewName("");
      setNewPhotoUrl("");
    } catch (error) {
      console.error("Failed to add client:", error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <header className="w-full sticky top-0 z-30 bg-gradient-to-r from-[var(--brand-600)] to-[var(--brand-700)] text-white header-shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-row items-center justify-between gap-3">
        <button
          className="text-left text-lg font-semibold tracking-wide hover:opacity-90 flex items-center py-2"
          onClick={() => {
            onChange("clients");
            requestGoToBasicInfo();
          }}
          title="ダッシュボードに戻る"
        >
          <img
            src="/favicon.ico"
            alt="フクシア"
            className="block md:hidden h-6 w-6 flex-shrink-0 object-contain"
          />
          <span className="hidden md:block">フクシア</span>
        </button>
        <div className="flex items-center gap-3">
          <nav className="flex flex-wrap items-center gap-2">
            {/* カスタムドロップダウン（hoverで展開、メニューは白） */}
            <div
              className="relative group order-3 md:order-1"
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
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm min-w-0 md:min-w-[240px] justify-between shadow-md hover-scale ${active === "clients" ? "bg-[var(--brand-600)] text-white border-transparent" : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)]"}`}
              >
                <span className="truncate max-w-[170px]">
                  {currentClient?.name || "利用者を選択"}
                </span>
                <span className="text-xs opacity-80">▾</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-0 w-[min(300px,90vw)] rounded-md rounded-t-none border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl ring-1 ring-[var(--ring)] z-50"
                  onMouseEnter={() => setMenuOpen(true)}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="max-h-[60vh] overflow-auto py-1">
                    {clients.length === 0 && (
                      <div className="px-3 py-2 text-xs text-[var(--muted)]">
                        利用者がいません
                      </div>
                    )}
                    {clients.map((c) => {
                      const isSelected = currentClient?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelect(c.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--chip-bg)] hover-scale flex items-center justify-between ${isSelected ? "bg-[var(--chip-bg)] text-[var(--brand-700)] font-medium" : "text-[var(--foreground)]"}`}
                          aria-current={isSelected ? "true" : undefined}
                        >
                          <span className="truncate">{c.name}</span>
                          {isSelected && (
                            <span className="ml-2 text-[var(--brand-600)]">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t" />
                    <button
                      onClick={() => onSelect("__add__")}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--brand-600)] hover:bg-[var(--gbtn-hover-bg)] hover-scale"
                    >
                      新しい利用者を追加
                    </button>
                  </div>
                </div>
              )}
            </div>
            {NAV_ITEMS.map((item, index) => (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                aria-current={active === item.key ? "page" : undefined}
                className={`px-3 py-2 rounded-full text-sm transition border shadow-sm hover-scale ${index === 0 ? "order-1 md:order-2" : "order-2 md:order-3"} ${active === item.key ? "bg-[var(--brand-600)] text-white border-[var(--brand-600)]" : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface)]"} `}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        {/* 追加モーダル */}
        {showAdd &&
          typeof window !== "undefined" &&
          typeof document !== "undefined" &&
          document.body &&
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
                  新しい利用者を追加
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
            document.body,
          )}
      </div>
    </header>
  );
}
