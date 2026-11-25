import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test(
  "POS invoice sync freezes payment data and still links the latest HK identity",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const [
      { db },
      { invoiceOrderRepository },
      { syncPosInvoiceOrdersForDate },
    ] = await Promise.all([
      import("../config/firebase.js"),
      import("./invoiceOrderRepository.js"),
      import("../services/invoicePosOrderSyncService.js"),
    ]);
    const suffix = randomUUID();
    const warehouseId = `store-${suffix}`;
    const localOrderId = `order-${suffix}`;
    const accountKey = `hk-account-${suffix}`;
    const businessDate = "2026-11-25";
    const paidAt = `${businessDate}T07:00:00.000Z`;
    const posOrder = db.collection("pos_orders").doc(localOrderId);
    await posOrder.set({
      localOrderId,
      warehouseId,
      hkOrderNumber: null,
      status: "LOCAL_PAID",
      paymentStatus: "PAID",
      createdAt: paidAt,
      paidAt,
      totalAmount: 2000,
      items: [],
    });
    await posOrder
      .collection("invoice_snapshots")
      .doc("payment")
      .create({
        schemaVersion: 1,
        localOrderId,
        warehouseId,
        shopId: 1,
        createdAt: paidAt,
        paidAt,
        totalAmount: 1800,
        discountAmount: 200,
        paymentMethod: "CASH",
        paymentMethodId: "CASH",
        paymentMethodName: "Tiền mặt",
        items: [
          {
            goodsId: "sku",
            goodsName: "Vé",
            price: 2000,
            quantity: 1,
            vatRateName: "0%",
          },
        ],
        vouchers: [],
      });
    const sync = () =>
      syncPosInvoiceOrdersForDate({
        warehouseId,
        businessDate,
        runId: randomUUID(),
        storeConfig: null,
        account: null,
        externalSourceAccountKey: accountKey,
      });
    const first = (await sync()).writes[0]!;
    assert.equal(first.projection.real_money, 1800);
    assert.equal(first.projection.discount_money, 200);
    assert.equal(first.projection.external_order_number, null);

    const legacyPosId = `old-pos-${suffix}`;
    await db
      .collection("pos_orders")
      .doc(legacyPosId)
      .set({
        ...(await posOrder.get()).data()!,
        localOrderId: legacyPosId,
        totalAmount: 700,
      });

    await posOrder.update({
      hkOrderNumber: "HK-LATE",
      status: "SYNC_SUCCESS",
      totalAmount: 3000,
    });
    const writesAfterHk = (await sync()).writes;
    const second = writesAfterHk.find(
      (write) => write.source_order_id === localOrderId,
    )!;
    assert.equal(second.source_payload_hash, first.source_payload_hash);
    assert.equal(second.projection.real_money, 1800);
    assert.equal(second.projection.external_order_number, "HK-LATE");
    assert.equal(second.projection.external_source_account_key, accountKey);
    assert.equal(
      writesAfterHk.find((write) => write.source_order_id === legacyPosId)
        ?.projection.real_money,
      700,
    );

    await invoiceOrderRepository.upsertOrders(
      warehouseId,
      randomUUID(),
      [
        {
          source_order_id: "legacy",
          source_payload_hash: "b".repeat(64),
          raw_payload: {},
          projection: {
            warehouse_id: warehouseId,
            source_system: "JOYWORLD",
            order_number: "HK-LEGACY",
            business_date: businessDate,
            source_action_time: new Date(paidAt),
          },
        },
      ],
      new Date(),
    );
    await posOrder.update({ hkOrderNumber: "HK-LEGACY" });
    assert.deepEqual(
      (await sync()).writes.map((write) => write.source_order_id),
      [legacyPosId],
    );
  },
);

test(
  "global HK account and order identity rejects a second warehouse source",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const [{ db }, repositoryModule] = await Promise.all([
      import("../config/firebase.js"),
      import("./invoiceOrderRepository.js"),
    ]);
    const { invoiceOrderRepository, invoiceSourceOrderDocumentId } =
      repositoryModule;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const accountKey = `hk-account-${suffix}`;
    const orderNumber = `HK-${suffix}`;
    const firstWarehouse = `lm81-${suffix}`;
    const secondWarehouse = `aeon-${suffix}`;
    const write = (warehouseId: string) => ({
      source_order_id: orderNumber,
      source_payload_hash: "a".repeat(64),
      raw_payload: { orderNumber },
      projection: {
        warehouse_id: warehouseId,
        source_system: "JOYWORLD",
        external_source_account_key: accountKey,
        external_order_number: orderNumber,
      },
    });

    await invoiceOrderRepository.upsertOrders(
      firstWarehouse,
      `run-first-${suffix}`,
      [write(firstWarehouse)],
      new Date(),
    );
    await assert.rejects(
      invoiceOrderRepository.upsertOrders(
        secondWarehouse,
        `run-second-${suffix}`,
        [write(secondWarehouse)],
        new Date(),
      ),
      /DUPLICATE_GLOBAL_SOURCE_ORDER/,
    );

    const [first, second] = await Promise.all([
      db
        .collection("invoice_source_orders")
        .doc(invoiceSourceOrderDocumentId(firstWarehouse, orderNumber))
        .get(),
      db
        .collection("invoice_source_orders")
        .doc(invoiceSourceOrderDocumentId(secondWarehouse, orderNumber))
        .get(),
    ]);
    assert.equal(first.exists, true);
    assert.equal(second.exists, false);
  },
);
