"use client";
import { useState, useEffect, useCallback } from "react";
import { clientApi } from "@/lib/api-client";
import MemoTaskManager from "@/components/MemoTaskManager";
import AppHeader from "@/components/AppHeader";
import ClientWorkspace from "@/components/ClientWorkspace";
import { ClientContext, ClientData } from "@/components/ClientContext";
import ResourceManagementPage from "@/components/ResourceManagementPage";

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
  const [chatMessage, setChatMessage] = useState<string>("");
  const [chatOpenSignal, setChatOpenSignal] = useState(0);
  const [newClientSignal, setNewClientSignal] = useState(0);
  const [suggestionSignal, setSuggestionSignal] = useState(0);
  const [suggestedTask, setSuggestedTask] = useState("");
  const [suggestedMemo, setSuggestedMemo] = useState("");

  const setSuggestion = (task: string, memo: string) => {
    setSuggestedTask(task);
    setSuggestedMemo(memo);
    setSuggestionSignal((s) => s + 1);
  };

  const clearSuggestion = () => {
    setSuggestedTask("");
    setSuggestedMemo("");
  };

  const notifyNewClient = () => {
    setNewClientSignal((s) => s + 1);
  };

  const requestChatOpen = () => {
    setChatOpenSignal((s) => s + 1);
  };

  const sendChatMessage = (message: string) => {
    setChatMessage(message);
  };

  const clearChatMessage = () => {
    setChatMessage("");
  };

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
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      setClients([]); // Clear clients on error
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (clients.length > 0) {
      const currentClientStillExists = clients.some(
        (c) => c.id === currentClient?.id,
      );
      if (!currentClient || !currentClientStillExists) {
        setCurrentClient(clients[0]);
      }
    } else {
      setCurrentClient(null);
    }
  }, [clients, currentClient]);

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
        sendChatMessage,
        chatMessage,
        clearChatMessage: () => setChatMessage(""),
        requestChatOpen: () => setChatOpenSignal((s) => s + 1),
        chatOpenSignal,
        newClientSignal,
        notifyNewClient: () => setNewClientSignal((s) => s + 1),
        suggestionSignal,
        suggestedTask,
        suggestedMemo,
        setSuggestion,
        clearSuggestion,
      }}
    >
      <div className="min-h-screen flex flex-col bg-[var(--background)]">
        <AppHeader active={selectedTab} onChange={setSelectedTab} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="surface card-shadow border border-[var(--border)] p-4 sm:p-6">
            {selectedTab === "clients" && <ClientWorkspace />}
            {selectedTab === "notes" && <MemoTaskManager />}
            {selectedTab === "resources" && <ResourceManagementPage />}
          </div>
        </main>
      </div>
    </ClientContext.Provider>
  );
}
