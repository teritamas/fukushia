"use client";
import { useState, useEffect, useCallback } from "react";
import { clientApi } from "../lib/api-client";
import MemoTaskManager from "../components/MemoTaskManager";
import ResourceManager from "../components/ResourceManager";
import AppHeader from "../components/AppHeader";
import ClientWorkspace from "../components/ClientWorkspace";
import { ClientContext, ClientData } from "../components/ClientContext";

export default function Page() {
  const [selectedTab, setSelectedTab] = useState("clients");
  const [clients, setClients] = useState<ClientData[]>([]);
  const [currentClient, setCurrentClient] = useState<ClientData | null>(null);
  const [assessmentEditSignal, setAssessmentEditSignal] = useState(0);
  const [assessmentEditTarget, setAssessmentEditTarget] = useState<{
    category?: string;
    form?: string;
  } | null>(null);
  const [homeNavSignal, setHomeNavSignal] = useState(0);
  const [assessmentRefreshSignal, setAssessmentRefreshSignal] = useState(0);
  const [taskRefreshSignal, setTaskRefreshSignal] = useState(0);
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
  const notifyTaskUpdated = () => {
    setTaskRefreshSignal((s) => s + 1);
  };

  const fetchClients = useCallback(async () => {
    try {
      const apiClients = await clientApi.getAll();
      const list: ClientData[] = apiClients.map((client) => ({
        id: client.id,
        name: client.name,
      }));
      setClients(list);

      // If there is no current client or the current client is no longer in the list, set a new one.
      const currentClientStillExists = list.some(
        (c) => c.id === currentClient?.id,
      );
      if ((!currentClient || !currentClientStillExists) && list.length > 0) {
        setCurrentClient(list[0]);
      } else if (list.length === 0) {
        setCurrentClient(null);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      setClients([]); // Clear clients on error
    }
  }, [currentClient]);

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ClientContext.Provider
      value={{
        clients,
        refetchClients: fetchClients,
        currentClient,
        setCurrentClient,
        assessmentEditSignal,
        assessmentEditTarget,
        requestAssessmentEdit,
        homeNavSignal,
        requestGoToBasicInfo,
        assessmentRefreshSignal,
        notifyAssessmentUpdated,
        taskRefreshSignal,
        notifyTaskUpdated,
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
