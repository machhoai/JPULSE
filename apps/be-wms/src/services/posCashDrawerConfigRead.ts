import type { PosCashDrawerSettings } from "@bduck/shared-types";

/** An optional drawer read must not reject the existing payment/print config response. */
export async function readCashDrawerConfigSafely(read: () => Promise<PosCashDrawerSettings | null>) {
  try {
    return { loaded: true, settings: await read() };
  } catch (error: unknown) {
    console.error("[cashDrawerConfig] Optional drawer config read failed:", error);
    return { loaded: false, settings: null };
  }
}
