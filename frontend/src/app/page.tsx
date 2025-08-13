"use client";
import { useState } from "react";
import MemoTaskManager from "../components/MemoTaskManager";
import ClientDetail from "../components/ClientDetail";
import AssessmentAssistant from "../components/AssessmentAssistant";
import ResourceManager from "../components/ResourceManager";
import AppHeader from "../components/AppHeader";

// .env.localからAPP_ID, USER_IDを取得

export default function Page() {
  const [selectedTab, setSelectedTab] = useState("clients");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader active={selectedTab} onChange={setSelectedTab} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-6">
        <div className="bg-white rounded shadow p-6">
          {selectedTab === "clients" && <ClientDetail />}
          {selectedTab === "notes" && <MemoTaskManager />}
          {selectedTab === "assessment" && <AssessmentAssistant />}
          {selectedTab === "resources" && <ResourceManager />}
        </div>
      </main>
    </div>
  );
}
