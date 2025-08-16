export interface AdvancedSuggestedResource {
  resource_id: string;
  service_name: string;
  score: number;
  matched_keywords: string[];
  excerpt?: string;
}
export interface AdvancedSuggestResponse {
  query_tokens: string[];
  resources: AdvancedSuggestedResource[];
  used_summary: boolean;
}

export async function fetchAdvancedSuggestions(
  assessmentData: any,
  top_k = 8
): Promise<AdvancedSuggestResponse | null> {
  try {
    const API_BASE_URL =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    const res = await fetch(`${API_BASE_URL}/resources/advanced/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessment_data: assessmentData,
        top_k,
        use_llm_summary: true,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("advanced suggestion fetch failed", e);
    return null;
  }
}
