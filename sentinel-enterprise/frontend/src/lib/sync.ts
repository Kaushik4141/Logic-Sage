const DEFAULT_BLUEPRINTS_API_URL = "http://localhost:8787/blueprints";

export type BlueprintSyncInput = {
  title: string;
  developer_id?: string;
  branch?: string;
  source_query?: string;
  blueprint_text: string;
  metadata?: Record<string, unknown>;
};

export type BlueprintSyncResult = {
  success: boolean;
  status: number;
  id?: string;
  error?: string;
};

type CloudflareBlueprintCreateResponse = {
  status?: string;
  id?: string;
  message?: string;
};

export async function syncBlueprintToCloud(
  blueprintData: BlueprintSyncInput,
  apiUrl = DEFAULT_BLUEPRINTS_API_URL,
): Promise<BlueprintSyncResult> {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(blueprintData),
    });

    let payload: CloudflareBlueprintCreateResponse | null = null;
    try {
      payload = (await response.json()) as CloudflareBlueprintCreateResponse;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: payload?.message ?? "Cloud sync failed.",
      };
    }

    return {
      success: true,
      status: response.status,
      id: payload?.id,
    };
  } catch {
    return {
      success: false,
      status: 0,
      error: "Network error while syncing blueprint.",
    };
  }
}
