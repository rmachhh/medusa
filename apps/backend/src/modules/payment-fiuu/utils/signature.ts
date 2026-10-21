import { createHash, timingSafeEqual } from "node:crypto"
import { FiuuWebhookPayload } from "../types"

export function md5(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex")
}

export function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left.toLowerCase(), "utf8")
  const rightBuffer = Buffer.from(right.toLowerCase(), "utf8")

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

type VcodeInput = {
  amount: string
  merchantId: string
  orderId: string
  verifyKey: string
  currency?: string
  extended?: boolean
}

export function buildVcode(input: VcodeInput): string {
  const base = `${input.amount}${input.merchantId}${input.orderId}${input.verifyKey}`

  return input.extended ? md5(`${base}${input.currency ?? ""}`) : md5(base)
}

type SkeyInput = {
  transactionId: string
  orderId: string
  status: string
  domain: string
  amount: string
  currency: string
  appcode: string
  paydate: string
  secretKey: string
}

export function buildSkey(input: SkeyInput): string {
  const first = md5(
    `${input.transactionId}${input.orderId}${input.status}${input.domain}${input.amount}${input.currency}`
  )

  return md5(
    `${input.paydate}${input.domain}${first}${input.appcode}${input.secretKey}`
  )
}

export function verifySkey(
  payload: FiuuWebhookPayload,
  secretKey: string
): boolean {
  const received = payload.skey

  if (!received) {
    return false
  }

  const expected = buildSkey({
    transactionId: payload.tranID ?? "",
    orderId: payload.orderid ?? "",
    status: payload.status ?? "",
    domain: payload.domain ?? "",
    amount: payload.amount ?? "",
    currency: payload.currency ?? "",
    appcode: payload.appcode ?? "",
    paydate: payload.paydate ?? "",
    secretKey,
  })

  return safeCompare(received, expected)
}

export function buildRefundRequestSignature(input: {
  refundType: string
  merchantId: string
  refId: string
  transactionId: string
  amount: string
  secretKey: string
}): string {
  return md5(
    `${input.refundType}${input.merchantId}${input.refId}${input.transactionId}${input.amount}${input.secretKey}`
  )
}

export function buildRefundResponseSignature(input: {
  refundType: string
  merchantId: string
  refId: string
  refundId: string
  transactionId: string
  amount: string
  status: string
  secretKey: string
}): string {
  return md5(
    `${input.refundType}${input.merchantId}${input.refId}${input.refundId}${input.transactionId}${input.amount}${input.status}${input.secretKey}`
  )
}
