/** Format validation only; it does not verify that an account exists at a bank. */
export function isPayrollBankAccountValid(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string') return false;
  const account = value.trim();
  return /^\d+$/.test(account) && /[1-9]/.test(account);
}
