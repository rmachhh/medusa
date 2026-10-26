import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncOrderStatusToEms } from "../lib/ems-order-sync"

// A canceled Medusa order must not stay "Captured" in EMS. The mirrored payment
// moves to Cancelled through the status endpoint.
export default async function orderCanceledEmsSync({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    await syncOrderStatusToEms({ orderId: data.id, status: "canceled", logger })
  } catch (error: any) {
    logger.error(`EMS order status sync crashed for ${data.id}: ${error?.message ?? "error"}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
