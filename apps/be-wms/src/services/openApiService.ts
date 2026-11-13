import { createHash } from "crypto";
import { resolveOpenApiConfig } from "./openApiConfigService.js";

export interface OpenApiActionResponse {
  success?: boolean;
  code?: number;
  msg?: string;
  desc?: string;
  data?: unknown;
  [key: string]: unknown;
}

export class OpenApiActionError extends Error {
  constructor(
    action: string,
    public readonly status: number,
    public readonly response: OpenApiActionResponse | null,
  ) {
    super(
      `[openApiService] ${action} failed: ${response?.msg || response?.desc || `HTTP ${status}`}`,
    );
  }
}

const buildActionUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/openapi/action")
    ? trimmed
    : `${trimmed}/openapi/action`;
};

const signOpenApiPayload = (params: {
  appId: string;
  action: string;
  version: string;
  timestamp: string;
  body: string;
  secretKey: string;
}) =>
  createHash("md5")
    .update(
      `${params.appId}${params.action}${params.version}${params.timestamp}${params.body}${params.secretKey}`,
    )
    .digest("hex")
    .toUpperCase();

const getActionVersion = (
  config: Awaited<ReturnType<typeof resolveOpenApiConfig>>,
  action: string,
) => config.action_versions?.[action] || config.api_version;

export const callOpenApiAction = async (
  warehouseId: string,
  action: string,
  body: Record<string, unknown> = {},
  options?: { signal: AbortSignal; requireHttps?: boolean },
): Promise<OpenApiActionResponse> => {
  const config = await resolveOpenApiConfig(warehouseId);
  const version = getActionVersion(config, action);
  return sendOpenApiAction(config, action, version, body, options);
};

export const sendOpenApiAction = async (
  config: Pick<Awaited<ReturnType<typeof resolveOpenApiConfig>>, "app_id" | "secret_key" | "base_url">,
  action: string,
  version: string,
  body: Record<string, unknown>,
  options?: { signal: AbortSignal; requireHttps?: boolean },
): Promise<OpenApiActionResponse> => {
  const timestamp = String(Date.now());
  const bodyText = JSON.stringify(body);
  const payload = {
    appId: config.app_id,
    action,
    version,
    timestamp,
    sign: signOpenApiPayload({
      appId: config.app_id,
      action,
      version,
      timestamp,
      body: bodyText,
      secretKey: config.secret_key,
    }),
    body: bodyText,
  };

  const url = buildActionUrl(config.base_url);
  if (options?.requireHttps && new URL(url).protocol !== "https:") {
    throw new Error("Member OpenAPI requires HTTPS");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(options && { signal: options.signal, redirect: "error" as const }),
  });
  const json = (await response
    .json()
    .catch(() => null)) as OpenApiActionResponse | null;

  if (!response.ok || !json) {
    if (options) throw new OpenApiActionError(action, response.status, json);
    throw new Error(
      `[openApiService] ${action} failed: HTTP ${response.status}`,
    );
  }
  if (json.success === false) {
    if (options) throw new OpenApiActionError(action, response.status, json);
    throw new Error(
      `[openApiService] ${action} failed: ${json.msg || json.desc || "unknown error"}`,
    );
  }
  return json;
};

export const testOpenApiConnection = async (warehouseId: string) => {
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return callOpenApiAction(warehouseId, "report_revenue_summary", {
    startDate: day,
    endDate: day,
  });
};
