"use client";
import { createContext, useContext } from "react";

export interface ClientData {
  id: string;
  name: string;
  photoUrl?: string;
  basicInfo?: string;
}

export interface ClientContextValue {
  clients: ClientData[];
  refetchClients: () => Promise<void>;
  currentClient: ClientData | null;
  setCurrentClient: (client: ClientData | null) => void;
  assessmentEditSignal: number; // increments when an external edit request is fired
  assessmentEditTarget: { category?: string; form?: string } | null;
  requestAssessmentEdit: (target?: {
    category?: string;
    form?: string;
  }) => void;
  homeNavSignal: number; // increments when user clicks Dashboard title to go home (basic info)
  requestGoToBasicInfo: () => void;
  assessmentRefreshSignal: number;
  notifyAssessmentUpdated: () => void;
  taskRefreshSignal: number;
  notifyTaskUpdated: () => void;
  sendChatMessage: (message: string) => void;
  chatMessage: string;
  clearChatMessage: () => void;
  requestChatOpen: () => void;
  chatOpenSignal: number;
  newClientSignal: number;
  notifyNewClient: () => void;
  suggestionSignal: number;
  suggestedTask: string;
  suggestedMemo: string;
  setSuggestion: (task: string, memo: string) => void;
  clearSuggestion: () => void;
}

export const ClientContext = createContext<ClientContextValue | undefined>(
  undefined,
);

export function useClientContext(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    return {
      clients: [],
      refetchClients: async () => {},
      currentClient: null,
      setCurrentClient: () => {},
      assessmentEditSignal: 0,
      assessmentEditTarget: null,
      requestAssessmentEdit: () => {},
      homeNavSignal: 0,
      requestGoToBasicInfo: () => {},
      assessmentRefreshSignal: 0,
      notifyAssessmentUpdated: () => {},
      taskRefreshSignal: 0,
      notifyTaskUpdated: () => {},
      sendChatMessage: () => {},
      chatMessage: "",
      clearChatMessage: () => {},
      requestChatOpen: () => {},
      chatOpenSignal: 0,
      newClientSignal: 0,
      notifyNewClient: () => {},
      suggestionSignal: 0,
      suggestedTask: "",
      suggestedMemo: "",
      setSuggestion: () => {},
      clearSuggestion: () => {},
    };
  }
  return ctx;
}
