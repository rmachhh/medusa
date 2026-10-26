import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncOrderToEms } from "../lib/ems-order-sync"

// Mirror a paid Medusa order into EMS once it is placed. Fiuu captures during
// checkout, so a placed order normally arrives here with payment_status
// "captured"; unpaid orders are skipped by the builder.
export default async function orderPlacedEmsSync({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    await syncOrderToEms({ container, orderId: data.id, logger })
  } catch (error: any) {
    // Never fail the order workflow because EMS was unreachable.
    logger.error(`EMS order sync crashed for ${data.id}: ${error?.message ?? "error"}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
