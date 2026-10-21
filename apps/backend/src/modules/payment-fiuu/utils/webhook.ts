import { FiuuPaymentStatus, FiuuWebhookPayload } from "../types"

function toPayloadEntries(value: string): FiuuWebhookPayload {
  const params = new URLSearchParams(value)
  const payload: FiuuWebhookPayload = {}

  params.forEach((paramValue, key) => {
    payload[key] = paramValue
  })

  return payload
}

function normalizeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  return Array.isArray(value) ? String(value[0]) : String(value)
}

export function normalizeWebhookPayload(
  data: unknown,
  rawData?: string
): FiuuWebhookPayload {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return Object.entries(data as Record<string, unknown>).reduce(
      (payload, [key, value]) => {
        payload[key] = normalizeValue(value)
        return payload
      },
      {} as FiuuWebhookPayload
    )
  }

  if (typeof data === "string" && data.length > 0) {
    return toPayloadEntries(data)
  }

  if (rawData) {
    return toPayloadEntries(rawData)
  }

  return {}
}

export function mapFiuuStatus(status?: string): FiuuPaymentStatus {
  if (status === "00") {
    return "paid"
  }

  if (status === "22") {
    return "pending"
  }

  return "failed"
}
