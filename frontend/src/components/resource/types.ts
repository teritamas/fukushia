export interface ResourceRecord {
  id?: string;
  service_name: string;
  category?: string;
  description?: string;
  keywords?: string[];
  provider?: string;
  eligibility?: string;
  application_process?: string;
  last_verified_at?: number;
  target_users?: string;
  location?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_url?: string;
}

export interface SuggestionMeta {
  // Optional flags/metadata for rendering
  badge?: string; // e.g., 'AI'
  matched?: string[];
  score?: number;
  alreadyUsed?: boolean;
  reason?: string;
  taskSuggestion?: string;
}
