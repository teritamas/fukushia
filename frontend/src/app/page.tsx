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
  const [assessmentEditTarget, setAssessmentEditTarget] = useState<{
    category?: string;
    form?: string;
  } | null>(null);
  const [homeNavSignal, setHomeNavSignal] = useState(0);
  const [assessmentRefreshSignal, setAssessmentRefreshSignal] = useState(0);
  const requestAssessmentEdit = (target?: {
    category?: string;
    form?: string;
  }) => {
    setAssessmentEditTarget(target || null);
    setAssessmentEditSignal((s) => s + 1);
    // Switch to assessment tab immediately
    setSelectedTab("clients"); // ensure in workspace
  };
  const requestGoToBasicInfo = () => {
    // Ensure workspace is active, then signal inner tab to go to basic info
    setSelectedTab("clients");
    setHomeNavSignal((s) => s + 1);
  };
  const notifyAssessmentUpdated = () => {
    setAssessmentRefreshSignal((s) => s + 1);
  };

  return (
    <ClientContext.Provider
      value={{
        currentClient,
        setCurrentClient,
        assessmentEditSignal,
        assessmentEditTarget,
        requestAssessmentEdit,
        homeNavSignal,
        requestGoToBasicInfo,
        assessmentRefreshSignal,
        notifyAssessmentUpdated,
      }}
    >
      <div className="min-h-screen flex flex-col bg-[var(--background)]">
        <AppHeader active={selectedTab} onChange={setSelectedTab} />
        <main className="flex-1 w-full max-w-7xl mx-auto px-6 sm:px-6 py-6">
          <div className="surface card-shadow border border-[var(--border)] p-6">
            {selectedTab === "clients" && <ClientWorkspace />}
            {selectedTab === "notes" && <MemoTaskManager />}
            {selectedTab === "resources" && <ResourceManager />}
          </div>
        </main>
      </div>
    </ClientContext.Provider>
  );
}
