/** Keep Graph diagnostics free of tokens, profile data and upstream free text. */
export function logZaloGraphFailure(
  operation: "identity" | "phone",
  httpStatus: number,
  payload: unknown,
) {
  const body = payload && typeof payload === "object"
    ? payload as Record<string, unknown> : {};
  const error = body.error;
  const nested = error && typeof error === "object"
    ? error as Record<string, unknown> : {};
  const rawCode = nested.code ?? error ?? body.code;
  const code = typeof rawCode === "number" && Number.isSafeInteger(rawCode)
    ? rawCode : typeof rawCode === "string" && /^-?\d{1,8}$/.test(rawCode)
      ? Number(rawCode) : null;
  console.warn(JSON.stringify({
    severity: "WARNING",
    message: "Zalo Graph verification failed",
    event: "zalo_graph_verification_failed",
    operation,
    httpStatus,
    graphErrorCode: code,
    hasUserId: typeof body.id === "string" && body.id.length > 0,
    graphErrorType: typeof error,
    responseFormat: payload === null ? "unreadable" : "json",
  }));
}
