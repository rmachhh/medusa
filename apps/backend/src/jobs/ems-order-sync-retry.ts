import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isSyncableOrder, syncOrderToEms } from "../lib/ems-order-sync"

const LOOKBACK_HOURS = 48
const BATCH_SIZE = 50

// Safety net for the order.placed subscriber: an order whose Fiuu capture
// landed after placement, or whose subscriber delivery crashed, is picked up on
// the next run. EMS is idempotent on the Medusa order id, so re-sending an order
// that was already recorded is a no-op there.
export default async function emsOrderSyncRetry(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (!process.env.EMS_ORDER_INGEST_URL || !process.env.EMS_MEDUSA_SHARED_SECRET) {
    return
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)
  const { data } = await query.graph({
    entity: "order",
    // order.payment_status is computed and comes back "unknown" from the graph,
    // so capture is read from the payment rows and filtered in code.
    fields: ["id", "status", "payment_collections.payments.captured_at"],
    filters: {
      created_at: { $gte: since.toISOString() },
    },
    pagination: { take: BATCH_SIZE },
  })

  const orders = (data ?? []).filter(isSyncableOrder)
  if (!orders.length) return

  logger.info(`EMS order sync retry: checking ${orders.length} captured order(s).`)
  for (const order of orders) {
    try {
      await syncOrderToEms({ container, orderId: order.id, logger })
    } catch (error: any) {
      logger.error(`EMS order sync retry failed for ${order.id}: ${error?.message ?? "error"}`)
    }
  }
}

export const config = {
  name: "ems-order-sync-retry",
  schedule: "*/10 * * * *",
}
