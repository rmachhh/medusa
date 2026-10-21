import { BigNumber } from "@medusajs/framework/utils"
import type { BigNumberInput } from "@medusajs/framework/types"

export function formatFiuuAmount(amount: BigNumberInput): string {
  const value = new BigNumber(amount)
  const formatter = value.bigNumber ?? value.numeric

  return formatter.toFixed(2)
}
