export type RevisionVoucherType = "IMPORT" | "EXPORT" | "TRANSFER";

export interface RevisionVoucher {
  id: string;
  status: string;
  creator_id: string;
  warehouse_id?: string;
  source_warehouse_id?: string;
  reference_type?: string | null;
}

export function canReviseRejectedVoucher(
  type: RevisionVoucherType,
  voucher: RevisionVoucher,
  userId: string | undefined,
  hasPermission: (action: string, warehouseId?: string) => boolean,
): boolean {
  const warehouseId = type === "TRANSFER" ? voucher.source_warehouse_id : voucher.warehouse_id;
  return voucher.status === "REJECTED" && !!userId && voucher.creator_id === userId &&
    !!warehouseId && hasPermission(type === "TRANSFER" ? "transfers.write" : "vouchers.write", warehouseId) &&
    (voucher.reference_type !== "EXTERNAL_QUEUE_BATCH" || hasPermission("external_scan.manage_queue", warehouseId));
}
