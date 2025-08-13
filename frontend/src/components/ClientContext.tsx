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
	assessmentEditSignal: number; // increments when an external edit request is fired
	assessmentEditTarget: { category?: string; form?: string } | null;
	requestAssessmentEdit: (target?: { category?: string; form?: string }) => void;
}

export const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function useClientContext(): ClientContextValue {
	const ctx = useContext(ClientContext);
	if (!ctx) {
	return { 
		currentClient: null, 
		setCurrentClient: () => {}, 
		assessmentEditSignal: 0, 
		assessmentEditTarget: null,
		requestAssessmentEdit: () => {},
	};
	}
	return ctx;
}
