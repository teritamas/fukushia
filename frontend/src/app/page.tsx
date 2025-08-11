
"use client";
import { useState } from "react";
import MemoTaskManager from "../components/MemoTaskManager";
import AssessmentAssistant from "../components/AssessmentAssistant";
import ClientDetail from "../components/ClientDetail";


// .env.localからAPP_ID, USER_IDを取得
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";

export default function Page() {
  const [selectedTab, setSelectedTab] = useState("clients");

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-2 sm:px-8">
      <h1 className="text-2xl font-bold mb-6 text-center">社会福祉士アシスタント ダッシュボード</h1>
      <div className="flex justify-center gap-4 mb-8">
        <button className={`px-4 py-2 rounded ${selectedTab === "clients" ? "bg-blue-500 text-white" : "bg-white border"}`} onClick={() => setSelectedTab("clients")}>支援者管理</button>
        <button className={`px-4 py-2 rounded ${selectedTab === "notes" ? "bg-blue-500 text-white" : "bg-white border"}`} onClick={() => setSelectedTab("notes")}>メモ・TODO管理</button>
      </div>

      <div className="bg-white rounded shadow p-6 max-w-3xl mx-auto">
        {selectedTab === "clients" && (
          <ClientDetail />
        )}
        {selectedTab === "notes" && (
          <MemoTaskManager />
        )}
      </div>
    </div>
  );
}