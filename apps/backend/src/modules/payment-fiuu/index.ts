import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FiuuPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [FiuuPaymentProviderService],
})
