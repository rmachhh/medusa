import { createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Pushes a paid Medusa order into EMS through POST /api/internal/medusa/orders.
//
// Medusa stays the money-of-record; EMS records the payment and creates the
// enrollment. The EMS endpoint is idempotent on the Medusa order id, so a retry
// or a duplicate order.placed delivery cannot create a second record.
//
// Nothing here throws into the order workflow: a failed sync is logged and the
// order still completes.

export const EMS_ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "currency_code",
  "total",
  "payment_status",
  "metadata",
  "created_at",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "payment_collections.payments.id",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.data",
  "customer.first_name",
  "customer.last_name",
  "customer.phone",
]

const METADATA_KEYS = ["child_name", "child_age", "parent_name", "source"]
const RETRY_DELAYS_MS = [0, 1000, 3000]
const REQUEST_TIMEOUT_MS = 10_000

export type EmsOrderPayload = {
  medusaOrderId: string
  email: string
  currency: string
  total: number
  payment: {
    provider: string
    medusaPaymentId?: string
    transactionId: string
    amount: number
    capturedAt?: string
  }
  customer?: { firstName?: string; lastName?: string; mobile?: string }
  metadata?: Record<string, string | number | boolean>
  items: Array<{ sku: string; amount: number; quantity: number }>
}

function capturedPayment(order: any) {
  const payments = (order?.payment_collections ?? []).flatMap(
    (collection: any) => collection?.payments ?? []
  )
  return payments.find((payment: any) => Boolean(payment?.captured_at)) ?? payments[0]
}

function notificationMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object") return undefined
  const picked: Record<string, string | number | boolean> = {}
  for (const key of METADATA_KEYS) {
    const value = metadata[key]
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      picked[key] = value
    }
  }
  return Object.keys(picked).length ? picked : undefined
}

/**
 * Maps a Medusa order graph to the EMS ingest body.
 * Returns { skip } when the order is not payable yet.
 */
export function buildEmsOrderPayload(
  order: any
): { payload: EmsOrderPayload } | { skip: string } {
  if (!order?.id) return { skip: "missing-order-id" }

  // order.payment_status is a computed field: the remote-query graph returns
  // "unknown" for it, so capture is derived from the payment itself.
  const payment = capturedPayment(order)
  if (!payment?.provider_id) return { skip: "missing-payment-provider" }
  if (!payment.captured_at) return { skip: "payment-not-captured" }

  // Refunded orders keep the original capture but drop the total to zero; EMS
  // only accepts positive totals, so they must never be re-ingested.
  if (!(Number(order.total ?? 0) > 0)) return { skip: "non-positive-total" }
  if (order.status === "canceled") return { skip: "order-canceled" }

  const transactionId =
    payment.data?.transaction_id ?? payment.data?.tranID ?? payment.id
  if (!transactionId) return { skip: "missing-transaction-id" }

  // The DEV0 development product is sent too: EMS records it as the dev-test
  // program so a test order can be verified end to end.
  const items = (order.items ?? [])
    .filter((item: any) => typeof item?.variant_sku === "string")
    .map((item: any) => ({
      sku: item.variant_sku,
      amount: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 1),
    }))
  if (!items.length) return { skip: "missing-variant-sku" }

  const customer = order.customer
    ? {
        firstName: order.customer.first_name ?? undefined,
        lastName: order.customer.last_name ?? undefined,
        mobile: order.customer.phone ?? undefined,
      }
    : undefined

  return {
    payload: {
      medusaOrderId: order.id,
      email: order.email,
      currency: String(order.currency_code ?? "php").toUpperCase(),
      total: Number(order.total ?? 0),
      payment: {
        provider: payment.provider_id,
        ...(payment.id ? { medusaPaymentId: payment.id } : {}),
        transactionId: String(transactionId),
        amount: Number(payment.amount ?? order.total ?? 0),
        ...(payment.captured_at ? { capturedAt: new Date(payment.captured_at).toISOString() } : {}),
      },
      ...(customer && Object.values(customer).some(Boolean) ? { customer } : {}),
      ...(notificationMetadata(order.metadata) ? { metadata: notificationMetadata(order.metadata) } : {}),
      items,
    },
  }
}

/** True once any payment on the order carries a capture timestamp. */
export function hasCapturedPayment(order: any): boolean {
  return (order?.payment_collections ?? []).some((collection: any) =>
    (collection?.payments ?? []).some((payment: any) => Boolean(payment?.captured_at))
  )
}

/** Orders worth sending: identified, and carrying a captured payment. */
export function isSyncableOrder(order: any): boolean {
  if (typeof order?.id !== "string" || !hasCapturedPayment(order)) return false
  // Canceled orders are propagated by the cancellation subscriber instead.
  return order.status !== "canceled"
}

/** Status endpoint derived from the ingest URL: .../orders -> .../orders/:id/status */
export function statusUrlFor(ingestUrl: string, orderId: string): string | null {
  const base = (ingestUrl || "").trim().replace(/\/+$/, "")
  if (!base.endsWith("/orders")) return null
  return `${base.slice(0, -"/orders".length)}/orders/${encodeURIComponent(orderId)}/status`
}

export function signEmsBody(raw: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(raw).digest("hex")
}

type SyncDependencies = {
  container: MedusaContainer
  orderId: string
  logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void }
  fetchImpl?: typeof fetch
}

/** Resolves the order, builds the payload, and retries the EMS delivery. */
export async function syncOrderToEms({
  container,
  orderId,
  logger,
  fetchImpl = fetch,
}: SyncDependencies): Promise<"sent" | "skipped" | "failed"> {
  const url = (process.env.EMS_ORDER_INGEST_URL ?? "").trim()
  const secret = (process.env.EMS_MEDUSA_SHARED_SECRET ?? "").trim()
  if (!url || secret.length < 32) {
    logger?.warn("EMS order sync is not configured; skipping.")
    return "skipped"
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: EMS_ORDER_FIELDS,
    filters: { id: orderId },
  })
  const order = data?.[0]
  if (!order) {
    logger?.warn(`EMS order sync: order ${orderId} was not found.`)
    return "skipped"
  }

  const built = buildEmsOrderPayload(order)
  if ("skip" in built) {
    logger?.info(`EMS order sync: skipped ${orderId} (${built.skip}).`)
    return "skipped"
  }

  const raw = JSON.stringify(built.payload)
  const signature = signEmsBody(raw, secret)

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-medusa-signature": signature,
        },
        body: raw,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) {
        logger?.info(`EMS order sync: recorded ${orderId} (${response.status}).`)
        return "sent"
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        logger?.error(`EMS order sync: rejected ${orderId} (${response.status}).`)
        return "failed"
      }
      logger?.warn(`EMS order sync: retrying ${orderId} (${response.status}).`)
    } catch (error: any) {
      logger?.warn(`EMS order sync: retrying ${orderId} (${error?.name ?? "error"}).`)
    }
  }

  logger?.error(`EMS order sync: gave up on ${orderId}.`)
  return "failed"
}

/** Propagates a cancellation or refund to the mirrored EMS payment. */
export async function syncOrderStatusToEms({
  orderId,
  status,
  logger,
  fetchImpl = fetch,
}: {
  orderId: string
  status: "canceled" | "refunded"
  logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void }
  fetchImpl?: typeof fetch
}): Promise<"sent" | "skipped" | "failed"> {
  const ingestUrl = (process.env.EMS_ORDER_INGEST_URL ?? "").trim()
  const secret = (process.env.EMS_MEDUSA_SHARED_SECRET ?? "").trim()
  const url = statusUrlFor(ingestUrl, orderId)
  if (!url || secret.length < 32) {
    logger?.warn("EMS order status sync is not configured; skipping.")
    return "skipped"
  }

  const raw = JSON.stringify({ status })
  const signature = signEmsBody(raw, secret)

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-medusa-signature": signature },
        body: raw,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) {
        logger?.info(`EMS order status: ${orderId} marked ${status}.`)
        return "sent"
      }
      if (response.status === 404) {
        // Not mirrored in EMS (e.g. canceled before payment); nothing to update.
        logger?.info(`EMS order status: ${orderId} is not in EMS; nothing to update.`)
        return "skipped"
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        logger?.error(`EMS order status rejected for ${orderId} (${response.status}).`)
        return "failed"
      }
      logger?.warn(`EMS order status: retrying ${orderId} (${response.status}).`)
    } catch (error: any) {
      logger?.warn(`EMS order status: retrying ${orderId} (${error?.name ?? "error"}).`)
    }
  }

  logger?.error(`EMS order status: gave up on ${orderId}.`)
  return "failed"
}
