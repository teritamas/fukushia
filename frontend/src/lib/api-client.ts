const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Common API utility functions
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Types matching backend models
export interface Client {
  id: string;
  name: string;
  created_at: string;
}

export interface ClientCreateRequest {
  name: string;
}

// Backend API types (using snake_case as backend expects)
export interface TodoItemAPI {
  id: string;
  text: string;
  due_date: string | null;
  is_completed: boolean;
}

// Frontend UI types (using camelCase for UI convenience)
export interface TodoItem {
  id: string;
  text: string;
  dueDate: string | null;
  isCompleted: boolean;
}

export interface Note {
  id: string;
  clientName: string;
  speaker?: string;
  content?: string;
  todoItems: TodoItemAPI[];
  timestamp: string;
}

export interface InterviewRecord {
  id: string;
  clientName: string;
  speaker: string;
  content: string;
  timestamp: string;
}

export interface NoteCreateRequest {
  clientName: string;
  speaker?: string;
  content: string;
}

export interface NoteUpdateRequest {
  speaker?: string;
  content?: string;
  todoItems?: TodoItemAPI[];
}

export interface Assessment {
  id: string;
  client_name: string;
  assessment: Record<string, unknown>;
  original_script?: string;
  support_plan?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AssessmentCreateRequest {
  client_name: string;
  assessment: Record<string, unknown>;
  original_script?: string;
  support_plan?: string;
}

export interface AssessmentUpdateRequest {
  assessment?: Record<string, unknown>;
  support_plan?: string;
}

export interface SuggestionRequest {
  assessment_data: Record<string, unknown>;
}

export interface SuggestionResponse {
  suggested_tasks: string[];
  suggested_memo: string;
}

// Client Resource types
export interface ClientResource {
  id: string;
  client_name: string;
  resource_id: string;
  service_name: string;
  status: "active" | "ended";
  notes?: string;
  added_at: number;
  added_by: string;
}

export interface ClientResourceCreateRequest {
  resource_id: string;
  service_name: string;
  status?: "active" | "ended";
  notes?: string;
}

export interface ClientResourceUpdateRequest {
  status?: "active" | "ended";
  notes?: string;
}

export interface Suggestion {
  suggested_tasks: string[];
  suggested_memo: string;
}

// Client API functions
export const clientApi = {
  async getAll(): Promise<Client[]> {
    return apiRequest<Client[]>("/clients/");
  },

  async create(client: ClientCreateRequest): Promise<Client> {
    return apiRequest<Client>("/clients/", {
      method: "POST",
      body: JSON.stringify(client),
    });
  },

  // Client Resources functions
  async getResources(clientName: string): Promise<ClientResource[]> {
    return apiRequest<ClientResource[]>(
      `/clients/${encodeURIComponent(clientName)}/resources`,
    );
  },

  async addResource(
    clientName: string,
    resource: ClientResourceCreateRequest,
  ): Promise<ClientResource> {
    return apiRequest<ClientResource>(
      `/clients/${encodeURIComponent(clientName)}/resources`,
      {
        method: "POST",
        body: JSON.stringify(resource),
      },
    );
  },

  async updateResource(
    clientName: string,
    usageId: string,
    resource: ClientResourceUpdateRequest,
  ): Promise<void> {
    await apiRequest<{ message: string }>(
      `/clients/${encodeURIComponent(clientName)}/resources/${usageId}`,
      {
        method: "PATCH",
        body: JSON.stringify(resource),
      },
    );
  },

  async deleteResource(clientName: string, usageId: string): Promise<void> {
    await apiRequest<{ message: string }>(
      `/clients/${encodeURIComponent(clientName)}/resources/${usageId}`,
      {
        method: "DELETE",
      },
    );
  },

  async getSuggestion(clientName: string): Promise<Suggestion | null> {
    return apiRequest<Suggestion | null>(
      `/clients/${encodeURIComponent(clientName)}/suggestion`,
    );
  },
};

// Notes API functions
export const notesApi = {
  async getAll(clientName?: string): Promise<Note[]> {
    const params = clientName
      ? `?client_name=${encodeURIComponent(clientName)}`
      : "";
    return apiRequest<Note[]>(`/notes/${params}`);
  },

  async get(id: string): Promise<Note> {
    return apiRequest<Note>(`/notes/${id}`);
  },

  async create(note: NoteCreateRequest): Promise<Note> {
    return apiRequest<Note>("/notes/", {
      method: "POST",
      body: JSON.stringify(note),
    });
  },

  async update(id: string, note: NoteUpdateRequest): Promise<Note> {
    return apiRequest<Note>(`/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(note),
    });
  },

  async delete(id: string): Promise<void> {
    await apiRequest<void>(`/notes/${id}`, {
      method: "DELETE",
    });
  },
};

// Assessments API functions
export const assessmentsApi = {
  async getAll(clientName?: string): Promise<Assessment[]> {
    const params = clientName
      ? `?client_name=${encodeURIComponent(clientName)}`
      : "";
    return apiRequest<Assessment[]>(`/assessments/${params}`);
  },

  async getById(id: string): Promise<Assessment> {
    return apiRequest<Assessment>(`/assessments/${id}`);
  },

  async create(assessment: AssessmentCreateRequest): Promise<Assessment> {
    return apiRequest<Assessment>("/assessments/", {
      method: "POST",
      body: JSON.stringify(assessment),
    });
  },

  async update(
    id: string,
    assessment: AssessmentUpdateRequest,
  ): Promise<Assessment> {
    return apiRequest<Assessment>(`/assessments/${id}`, {
      method: "PUT",
      body: JSON.stringify(assessment),
    });
  },
};

// Interview Records API functions
export const interviewRecordsApi = {
  async getAll(clientName: string): Promise<InterviewRecord[]> {
    const params = `?client_name=${encodeURIComponent(clientName)}`;
    return apiRequest<InterviewRecord[]>(`/interview_records/${params}`);
  },
};

// Suggestions API functions
export const suggestionsApi = {
  async getFromAssessment(
    request: SuggestionRequest,
  ): Promise<SuggestionResponse> {
    return apiRequest<SuggestionResponse>("/suggestions/from_assessment", {
      method: "POST",
      body: JSON.stringify(request),
    });
  },
};

const apiClient = {
  clients: clientApi,
  notes: notesApi,
  assessments: assessmentsApi,
  interviewRecords: interviewRecordsApi,
  suggestions: suggestionsApi,

  async get<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint);
  },

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  async delete<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, {
      method: "DELETE",
    });
  },
};

export default apiClient;
