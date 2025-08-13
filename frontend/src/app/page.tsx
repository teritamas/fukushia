"use client";
import { useState } from "react";
import MemoTaskManager from "../components/MemoTaskManager";
import ResourceManager from "../components/ResourceManager";
import AppHeader from "../components/AppHeader";
import ClientWorkspace from "../components/ClientWorkspace";
import { ClientContext, ClientData } from "../components/ClientContext";

export default function Page() {
  const [selectedTab, setSelectedTab] = useState("clients");
  const [currentClient, setCurrentClient] = useState<ClientData | null>(null);
  const [assessmentEditSignal, setAssessmentEditSignal] = useState(0);
  const [assessmentEditTarget, setAssessmentEditTarget] = useState<{ category?: string; form?: string } | null>(null);
  const requestAssessmentEdit = (target?: { category?: string; form?: string }) => {
    setAssessmentEditTarget(target || null);
    setAssessmentEditSignal(s => s + 1);
    // Switch to assessment tab immediately
    setSelectedTab('clients'); // ensure in workspace
  };

  return (
  <ClientContext.Provider value={{ currentClient, setCurrentClient, assessmentEditSignal, assessmentEditTarget, requestAssessmentEdit }}>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <AppHeader active={selectedTab} onChange={setSelectedTab} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-6">
          <div className="bg-white rounded shadow p-6">
            {selectedTab === "clients" && <ClientWorkspace />}
            {selectedTab === "notes" && <MemoTaskManager />}
            {selectedTab === "resources" && <ResourceManager />}
          </div>
        </main>
      </div>
    </ClientContext.Provider>
  );
}
