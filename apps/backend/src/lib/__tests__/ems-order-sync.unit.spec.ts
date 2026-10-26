import { createHmac } from "node:crypto"
import { buildEmsOrderPayload, isSyncableOrder, signEmsBody, syncOrderToEms } from "../ems-order-sync"

const order = (overrides: Record<string, any> = {}) => ({
  id: "order_01ABC",
  email: "parent@example.test",
  currency_code: "php",
  total: 7673,
  payment_status: "captured",
  metadata: { child_name: "Mia", ignored: "drop-me" },
  customer: { first_name: "Ana", last_name: "Cruz", phone: "+639171234567" },
  items: [{ variant_sku: "LC-NUR-GRP-50-P1", unit_price: 7673, quantity: 1 }],
  payment_collections: [
    {
      payments: [
        {
          id: "pay_01ABC",
          provider_id: "pp_fiuu_fiuu",
          amount: 7673,
          captured_at: "2026-10-26T10:00:00.000Z",
          data: { transaction_id: "tran-123" },
        },
      ],
    },
  ],
  ...overrides,
})

describe("buildEmsOrderPayload", () => {
  it("maps a captured order to the EMS ingest body", () => {
    const built = buildEmsOrderPayload(order())
    expect(built).toEqual({
      payload: {
        medusaOrderId: "order_01ABC",
        email: "parent@example.test",
        currency: "PHP",
        total: 7673,
        payment: {
          provider: "pp_fiuu_fiuu",
          medusaPaymentId: "pay_01ABC",
          transactionId: "tran-123",
          amount: 7673,
          capturedAt: "2026-10-26T10:00:00.000Z",
        },
        customer: { firstName: "Ana", lastName: "Cruz", mobile: "+639171234567" },
        metadata: { child_name: "Mia" },
        items: [{ sku: "LC-NUR-GRP-50-P1", amount: 7673, quantity: 1 }],
      },
    })
  })

  it("uses the payment capture time, not the computed payment_status", () => {
    const built: any = buildEmsOrderPayload(order({ payment_status: "unknown" }))
    expect(built.payload.medusaOrderId).toBe("order_01ABC")
    expect(built.payload.payment.capturedAt).toBe("2026-10-26T10:00:00.000Z")
  })

  it("skips a payment that has not been captured", () => {
    const built = buildEmsOrderPayload(
      order({
        payment_collections: [
          { payments: [{ id: "pay_01ABC", provider_id: "pp_fiuu_fiuu", amount: 7673, data: {} }] },
        ],
      })
    )
    expect(built).toEqual({ skip: "payment-not-captured" })
  })

  it("skips orders without a mapped variant SKU", () => {
    const built = buildEmsOrderPayload(
      order({ items: [{ variant_sku: null, unit_price: 7673, quantity: 1 }] })
    )
    expect(built).toEqual({ skip: "missing-variant-sku" })
  })

  it("sends the development DEV0 order so EMS can record it", () => {
    const built: any = buildEmsOrderPayload(
      order({
        items: [{ variant_sku: "DEV0", unit_price: 1, quantity: 1 }],
        total: 1,
        payment_collections: [
          {
            payments: [
              {
                id: "pay_dev",
                provider_id: "pp_fiuu_fiuu",
                amount: 1,
                captured_at: "2026-10-26T10:00:00.000Z",
                data: { transaction_id: "tran-dev" },
              },
            ],
          },
        ],
      })
    )
    expect(built.payload.items).toEqual([{ sku: "DEV0", amount: 1, quantity: 1 }])
    expect(built.payload.total).toBe(1)
    expect(built.payload.payment.amount).toBe(1)
  })

  it("falls back to the payment id when the provider stores no transaction id", () => {
    const built: any = buildEmsOrderPayload(
      order({
        payment_collections: [
          {
            payments: [
              {
                id: "pay_01ABC",
                provider_id: "pp_fiuu_fiuu",
                amount: 7673,
                captured_at: "2026-10-26T10:00:00.000Z",
                data: {},
              },
            ],
          },
        ],
      })
    )
    expect(built.payload.payment.transactionId).toBe("pay_01ABC")
  })

  it("omits customer and metadata when empty", () => {
    const built: any = buildEmsOrderPayload(order({ customer: null, metadata: {} }))
    expect(built.payload.customer).toBeUndefined()
    expect(built.payload.metadata).toBeUndefined()
  })
})

describe("isSyncableOrder", () => {
  const withPayment = (capturedAt?: string) => ({
    id: "order_1",
    payment_collections: [{ payments: [{ id: "pay_1", captured_at: capturedAt }] }],
  })

  it("requires an id and a captured payment", () => {
    expect(isSyncableOrder(withPayment("2026-10-26T10:00:00.000Z"))).toBe(true)
    expect(isSyncableOrder(withPayment(undefined))).toBe(false)
    expect(isSyncableOrder({ id: "order_1", payment_status: "captured" })).toBe(false)
    expect(isSyncableOrder({ payment_collections: [] })).toBe(false)
    expect(isSyncableOrder(null)).toBe(false)
  })
})

describe("signEmsBody", () => {
  it("produces the sha256=<hex> header EMS verifies", () => {
    const raw = JSON.stringify({ a: 1 })
    const expected = createHmac("sha256", "s".repeat(32)).update(raw).digest("hex")
    expect(signEmsBody(raw, "s".repeat(32))).toBe("sha256=" + expected)
  })
})

describe("syncOrderToEms", () => {
  const container = (data: any[]) => ({
    resolve: () => ({ graph: async () => ({ data }) }),
  })

  beforeEach(() => {
    process.env.EMS_ORDER_INGEST_URL = "https://ems.test/api/internal/medusa/orders"
    process.env.EMS_MEDUSA_SHARED_SECRET = "s".repeat(32)
  })

  afterEach(() => {
    delete process.env.EMS_ORDER_INGEST_URL
    delete process.env.EMS_MEDUSA_SHARED_SECRET
  })

  it("posts the signed payload and reports sent", async () => {
    const calls: any[] = []
    const fetchImpl: any = async (url: string, init: any) => {
      calls.push({ url, init })
      return { ok: true, status: 201 }
    }

    const result = await syncOrderToEms({
      container: container([order()]) as any,
      orderId: "order_01ABC",
      fetchImpl,
    })

    expect(result).toBe("sent")
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://ems.test/api/internal/medusa/orders")
    const raw = calls[0].init.body
    expect(calls[0].init.headers["x-medusa-signature"]).toBe(
      signEmsBody(raw, "s".repeat(32))
    )
    expect(JSON.parse(raw).medusaOrderId).toBe("order_01ABC")
  })

  it("does not retry a 4xx rejection", async () => {
    let calls = 0
    const fetchImpl: any = async () => {
      calls += 1
      return { ok: false, status: 422 }
    }

    const result = await syncOrderToEms({
      container: container([order()]) as any,
      orderId: "order_01ABC",
      fetchImpl,
    })

    expect(result).toBe("failed")
    expect(calls).toBe(1)
  })

  it("skips when the order has no captured payment", async () => {
    const result = await syncOrderToEms({
      container: container([
        order({
          payment_collections: [
            { payments: [{ id: "pay_01ABC", provider_id: "pp_fiuu_fiuu", amount: 7673, data: {} }] },
          ],
        }),
      ]) as any,
      orderId: "order_01ABC",
      fetchImpl: (async () => {
        throw new Error("must not be called")
      }) as any,
    })
    expect(result).toBe("skipped")
  })

  it("skips when the EMS sync is not configured", async () => {
    delete process.env.EMS_ORDER_INGEST_URL
    const result = await syncOrderToEms({
      container: container([order()]) as any,
      orderId: "order_01ABC",
      fetchImpl: (async () => {
        throw new Error("must not be called")
      }) as any,
    })
    expect(result).toBe("skipped")
  })
})
