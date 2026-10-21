import { FiuuPaymentProviderService } from "../service"
import { buildRefundRequestSignature, buildSkey, buildVcode } from "../utils/signature"

const options = {
  merchantId: "ACME",
  verifyKey: "verify-key-value",
  secretKey: "secret-key-value",
  sandbox: true,
  apiBaseUrl: "https://sandbox-api.fiuu.com",
  extendedVcode: true,
  currency: "MYR",
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function createProvider() {
  return new (FiuuPaymentProviderService as any)({ logger }, options)
}

function customerContext(email = "buyer@example.com") {
  return {
    customer: {
      id: "cus_1",
      email,
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+60123456789",
      billing_address: { country_code: "MY" },
    },
  }
}

describe("FiuuPaymentProviderService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("initiatePayment", () => {
    it("returns a hosted payment URL with the required fields", async () => {
      const provider = createProvider()

      const result = await provider.initiatePayment({
        amount: 10,
        currency_code: "myr",
        data: {},
        context: customerContext(),
      })

      const url = new URL(result.data.checkout_url as string)

      expect(result.id).toMatch(/^[0-9a-f]{32}$/)
      expect(result.data.status).toBe("pending")
      expect(result.data.amount).toBe("10.00")
      expect(url.origin).toBe("https://sandbox-payment.fiuu.com")
      expect(url.pathname).toBe("/RMS/pay/ACME/")
      expect(url.searchParams.get("amount")).toBe("10.00")
      expect(url.searchParams.get("orderid")).toBe(result.id)
      expect(url.searchParams.get("currency")).toBe("MYR")
      expect(url.searchParams.get("bill_email")).toBe("buyer@example.com")
      expect(url.searchParams.get("bill_name")).toBe("Ada Lovelace")
      expect(url.searchParams.get("metadata")).toBe(
        JSON.stringify({ session_id: result.id })
      )
      expect(url.searchParams.get("vcode")).toBe(
        buildVcode({
          amount: "10.00",
          merchantId: "ACME",
          orderId: result.id as string,
          verifyKey: options.verifyKey,
          currency: "MYR",
          extended: true,
        })
      )
    })

    it("rejects when no customer email is available", async () => {
      const provider = createProvider()

      await expect(
        provider.initiatePayment({
          amount: 10,
          currency_code: "MYR",
          data: {},
          context: { customer: { id: "cus_1", email: "" } },
        })
      ).rejects.toThrow(/email/i)
    })
  })

  describe("authorizePayment", () => {
    it("keeps unpaid sessions pending for the webhook", async () => {
      const provider = createProvider()

      const result = await provider.authorizePayment({
        data: { session_id: "s1", status: "pending" },
      })

      expect(result.status).toBe("pending_authorization")
    })

    it("returns captured for paid sessions", async () => {
      const provider = createProvider()

      const result = await provider.authorizePayment({
        data: { session_id: "s1", status: "paid", transaction_id: "t1" },
      })

      expect(result.status).toBe("captured")
    })
  })

  describe("getPaymentStatus", () => {
    it.each([
      ["paid", "captured"],
      ["failed", "error"],
      ["canceled", "canceled"],
      ["pending", "pending"],
    ])("maps %s to %s", async (stored, expected) => {
      const provider = createProvider()

      const result = await provider.getPaymentStatus({
        data: { session_id: "s1", status: stored },
      })

      expect(result.status).toBe(expected)
    })
  })

  describe("getWebhookActionAndData", () => {
    const basePayload = {
      tranID: "65234",
      orderid: "session_1",
      status: "00",
      domain: "ACME",
      amount: "10.00",
      currency: "MYR",
      appcode: "A1",
      paydate: "2026-10-21 10:00:00",
    }

    function signed(payload: Record<string, string>) {
      return {
        ...payload,
        skey: buildSkey({
          transactionId: payload.tranID,
          orderId: payload.orderid,
          status: payload.status,
          domain: payload.domain,
          amount: payload.amount,
          currency: payload.currency,
          appcode: payload.appcode,
          paydate: payload.paydate,
          secretKey: options.secretKey,
        }),
      }
    }

    it("marks a valid successful payment as captured", async () => {
      const provider = createProvider()

      const result = await provider.getWebhookActionAndData({
        data: signed(basePayload),
        rawData: "",
        headers: {},
      })

      expect(result.action).toBe("captured")
      expect(result.data?.session_id).toBe("session_1")
      expect(Number(result.data?.amount)).toBe(10)
    })

    it("returns pending for status 22", async () => {
      const provider = createProvider()

      const result = await provider.getWebhookActionAndData({
        data: signed({ ...basePayload, status: "22" }),
        rawData: "",
        headers: {},
      })

      expect(result.action).toBe("pending")
    })

    it("returns failed for declined payments", async () => {
      const provider = createProvider()

      const result = await provider.getWebhookActionAndData({
        data: signed({ ...basePayload, status: "11" }),
        rawData: "",
        headers: {},
      })

      expect(result.action).toBe("failed")
    })

    it("rejects a tampered amount", async () => {
      const provider = createProvider()

      const result = await provider.getWebhookActionAndData({
        data: { ...signed(basePayload), amount: "0.01" },
        rawData: "",
        headers: {},
      })

      expect(result.action).toBe("not_supported")
    })

    it("rejects payloads from another merchant", async () => {
      const provider = createProvider()

      const result = await provider.getWebhookActionAndData({
        data: signed({ ...basePayload, domain: "OTHER" }),
        rawData: "",
        headers: {},
      })

      expect(result.action).toBe("not_supported")
    })

    it("parses raw urlencoded bodies", async () => {
      const provider = createProvider()
      const payload = signed(basePayload)
      const rawData = new URLSearchParams(payload).toString()

      const result = await provider.getWebhookActionAndData({
        data: undefined,
        rawData,
        headers: {},
      })

      expect(result.action).toBe("captured")
    })
  })

  describe("refundPayment", () => {
    it("posts a signed refund request and records it", async () => {
      const fetchMock = jest.fn(async (_url: string, init: any) => {
        const body = new URLSearchParams(init.body)

        return {
          ok: true,
          json: async () => ({
            RefundType: "P",
            MerchantID: "ACME",
            RefID: body.get("RefID"),
            RefundID: "refund_1",
            TxnID: "txn_1",
            Amount: "5.00",
            Status: "22",
          }),
        }
      })

      ;(global as any).fetch = fetchMock

      const provider = createProvider()

      const result = await provider.refundPayment({
        amount: 5,
        data: { session_id: "s1", status: "paid", transaction_id: "txn_1" },
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)

      const [requestUrl, requestInit] = fetchMock.mock.calls[0]
      const body = new URLSearchParams(requestInit.body)

      expect(requestUrl).toBe(
        "https://sandbox-api.fiuu.com/RMS/API/refundAPI/index.php"
      )
      expect(body.get("RefundType")).toBe("P")
      expect(body.get("TxnID")).toBe("txn_1")
      expect(body.get("Amount")).toBe("5.00")
      expect(body.get("Signature")).toBe(
        buildRefundRequestSignature({
          refundType: "P",
          merchantId: "ACME",
          refId: body.get("RefID") as string,
          transactionId: "txn_1",
          amount: "5.00",
          secretKey: options.secretKey,
        })
      )

      expect(result.data.refunds).toHaveLength(1)
      expect(result.data.refunds?.[0].status).toBe("22")
    })

    it("throws when the transaction id is missing", async () => {
      const provider = createProvider()

      await expect(
        provider.refundPayment({ amount: 5, data: { session_id: "s1" } })
      ).rejects.toThrow(/transaction ID/i)
    })
  })
})
