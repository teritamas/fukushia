// frontend/src/lib/client.ts
import { clientApi } from "./api-client";

export interface Client {
  id: string;
  name: string;
}

const CLIENT_STORAGE_KEY = "currentClient";

export async function getAvailableClients(): Promise<Client[]> {
  try {
    const clients = await clientApi.getAll();
    return clients.map((c) => ({ id: c.id || "", name: c.name || "" }));
  } catch (error) {
    console.error("Failed to fetch available clients", error);
    return [];
  }
}

export async function getCurrentClient(): Promise<Client | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const clientJson = localStorage.getItem(CLIENT_STORAGE_KEY);
    if (clientJson) {
      return JSON.parse(clientJson) as Client;
    }

    const clients = await getAvailableClients();
    if (clients.length > 0) {
      const defaultClient = clients[0];
      localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(defaultClient));
      return defaultClient;
    }
    return null;
  } catch (error) {
    console.error("Failed to get current client", error);
    return null;
  }
}

export function setCurrentClient(client: Client): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(client));
    window.dispatchEvent(new Event("clientChanged"));
  } catch (error) {
    console.error("Failed to set current client in localStorage", error);
  }
}
