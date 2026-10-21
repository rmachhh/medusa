import {
  buildRefundRequestSignature,
  buildSkey,
  buildVcode,
  md5,
  safeCompare,
  verifySkey,
} from "../utils/signature"

describe("Fiuu signatures", () => {
  const verifyKey = "f5bb0c8de146c67b44babbf4e6584cc0"
  const secretKey = "secret-key-value"

  it("builds the extended vcode from the documented example", () => {
    const vcode = buildVcode({
      amount: "27.60",
      merchantId: "ACME",
      orderId: "OD8842",
      verifyKey,
      currency: "MYR",
      extended: true,
    })

    expect(vcode).toBe("5bf33e6500a53830d4f80087b67e13de")
  })

  it("omits the currency when extended vcode is disabled", () => {
    const plain = buildVcode({
      amount: "27.60",
      merchantId: "ACME",
      orderId: "OD8842",
      verifyKey,
    })
    const extended = buildVcode({
      amount: "27.60",
      merchantId: "ACME",
      orderId: "OD8842",
      verifyKey,
      currency: "MYR",
      extended: true,
    })

    expect(plain).toBe(md5(`27.60ACMEOD8842${verifyKey}`))
    expect(plain).not.toBe(extended)
  })

  it("verifies a valid skey", () => {
    const payload = {
      tranID: "65234",
      orderid: "order_123",
      status: "00",
      domain: "ACME",
      amount: "10.00",
      currency: "MYR",
      appcode: "A1",
      paydate: "2026-10-21 10:00:00",
      skey: "",
    }

    payload.skey = buildSkey({
      transactionId: payload.tranID,
      orderId: payload.orderid,
      status: payload.status,
      domain: payload.domain,
      amount: payload.amount,
      currency: payload.currency,
      appcode: payload.appcode,
      paydate: payload.paydate,
      secretKey,
    })

    expect(verifySkey(payload, secretKey)).toBe(true)
  })

  it("rejects tampered or missing skey values", () => {
    const payload = {
      tranID: "65234",
      orderid: "order_123",
      status: "00",
      domain: "ACME",
      amount: "10.00",
      currency: "MYR",
      appcode: "A1",
      paydate: "2026-10-21 10:00:00",
      skey: buildSkey({
        transactionId: "65234",
        orderId: "order_123",
        status: "00",
        domain: "ACME",
        amount: "10.00",
        currency: "MYR",
        appcode: "A1",
        paydate: "2026-10-21 10:00:00",
        secretKey,
      }),
    }

    expect(verifySkey({ ...payload, amount: "99.00" }, secretKey)).toBe(false)
    expect(verifySkey({ ...payload, skey: undefined }, secretKey)).toBe(false)
  })

  it("compares hashes without leaking timing or case differences", () => {
    expect(safeCompare("ABCDEF", "abcdef")).toBe(true)
    expect(safeCompare("ABCDEF", "abcde0")).toBe(false)
    expect(safeCompare("short", "longer-value")).toBe(false)
  })

  it("signs refund requests in the documented order", () => {
    const signature = buildRefundRequestSignature({
      refundType: "P",
      merchantId: "ACME",
      refId: "refund_1",
      transactionId: "65234",
      amount: "5.00",
      secretKey,
    })

    expect(signature).toBe(md5(`PACMErefund_1652345.00${secretKey}`))
  })
})
