"use client";
import { createContext, useContext } from 'react';

export interface ClientData {
	id: string;
	name: string;
	photoUrl?: string;
	basicInfo?: string;
}

export interface ClientContextValue {
	currentClient: ClientData | null;
	setCurrentClient: (client: ClientData | null) => void;
}

export const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function useClientContext(): ClientContextValue {
	const ctx = useContext(ClientContext);
	if (!ctx) {
	return { currentClient: null, setCurrentClient: () => {} };
	}
	return ctx;
}
