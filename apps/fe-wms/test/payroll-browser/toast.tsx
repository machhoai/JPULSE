// Functional UI tests replace only toast animation; async operations still run.
export const gooeyToast = { promise: async <T,>(operation: Promise<T>) => await operation,
  success: () => {}, error: () => {}, warning: () => {} };
export function GooeyToaster() { return null; }
