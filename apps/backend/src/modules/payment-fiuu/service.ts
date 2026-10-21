import { randomBytes, randomUUID } from "node:crypto"
import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  FiuuOptions,
  FiuuPaymentData,
  FiuuPaymentStatus,
  FiuuRefundResponse,
} from "./types"
import { formatFiuuAmount } from "./utils/amount"
import {
  buildRefundRequestSignature,
  buildRefundResponseSignature,
  buildVcode,
  safeCompare,
  verifySkey,
} from "./utils/signature"
import { mapFiuuStatus, normalizeWebhookPayload } from "./utils/webhook"

type InjectedDependencies = {
  logger?: {
    info: (message: string) => void
    warn: (message: string) => void
    error: (message: string) => void
  }
}

function createOrderId(): string {
  // Fiuu accepts alphanumeric order IDs only. Hex keeps it unique and
  // avoids the hyphens from a UUID.
  return randomBytes(16).toString("hex")
}

const PRODUCTION_PAYMENT_URL = "https://pay.fiuu.com"
const SANDBOX_PAYMENT_URL = "https://sandbox-payment.fiuu.com"
const PRODUCTION_API_URL = "https://api.fiuu.com"

export class FiuuPaymentProviderService extends AbstractPaymentProvider<FiuuOptions> {
  static identifier = "fiuu"

  protected readonly options_: FiuuOptions
  protected readonly logger_?: InjectedDependencies["logger"]

  constructor(cradle: InjectedDependencies, options: FiuuOptions) {
    super(cradle, options)

    this.options_ = options
    this.logger_ = cradle.logger
  }

  static validateOptions(options: Record<string, any>): void {
    const required = ["merchantId", "verifyKey", "secretKey"]

    for (const key of required) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Fiuu payment provider requires the "${key}" option.`
        )
      }
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const sessionId = createOrderId()
    const amount = formatFiuuAmount(input.amount)
    const currency = this.resolveCurrency(input.currency_code)
    const data = this.getData(input.data)

    const checkoutUrl = this.buildCheckoutUrl({
      sessionId,
      amount,
      currency,
      context: input.context,
      extra: data,
    })

    return {
      id: sessionId,
      data: {
        session_id: sessionId,
        amount,
        currency,
        status: "pending",
        checkout_url: checkoutUrl,
      } satisfies FiuuPaymentData,
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    const data = this.getData(input.data)

    if (data.status === "paid") {
      return { data }
    }

    const amount = formatFiuuAmount(input.amount)
    const currency = this.resolveCurrency(input.currency_code)

    const checkoutUrl = this.buildCheckoutUrl({
      sessionId: data.session_id,
      amount,
      currency,
      context: input.context,
      extra: data,
    })

    return {
      data: {
        ...data,
        amount,
        currency,
        checkout_url: checkoutUrl,
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = this.getData(input.data)

    if (data.status === "paid") {
      return { status: "captured", data }
    }

    if (data.status === "failed") {
      return { status: "error", data }
    }

    if (data.status === "canceled") {
      return { status: "canceled", data }
    }

    return { status: "pending_authorization", data }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = this.getData(input.data)

    // Fiuu captures sale transactions immediately. Pre-authorized
    // transactions require the Capture Request API, which this provider
    // does not enable yet.
    return { data }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    const data = this.getData(input.data)

    return {
      data: {
        ...data,
        status: "canceled" as FiuuPaymentStatus,
      },
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = this.getData(input.data)

    switch (data.status) {
      case "paid":
        return { status: "captured", data }
      case "failed":
        return { status: "error", data }
      case "canceled":
        return { status: "canceled", data }
      default:
        return { status: "pending", data }
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const data = this.getData(input.data)
    const transactionId = data.transaction_id

    if (!transactionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cannot refund a Fiuu payment without a transaction ID."
      )
    }

    const refundType = "P"
    const refId = `refund_${randomUUID()}`
    const amount = formatFiuuAmount(input.amount)
    const signature = buildRefundRequestSignature({
      refundType,
      merchantId: this.options_.merchantId,
      refId,
      transactionId,
      amount,
      secretKey: this.options_.secretKey,
    })

    const body = new URLSearchParams({
      RefundType: refundType,
      MerchantID: this.options_.merchantId,
      RefID: refId,
      TxnID: transactionId,
      Amount: amount,
      Signature: signature,
    })

    const response = await fetch(`${this.getApiBaseUrl()}/RMS/API/refundAPI/index.php`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    })

    const result = (await response.json()) as FiuuRefundResponse

    if (!response.ok || result.error_code) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Fiuu refund failed: ${result.error_desc ?? response.statusText}`
      )
    }

    this.assertRefundResponseSignature(result)

    return {
      data: {
        ...data,
        refunds: [
          ...(data.refunds ?? []),
          {
            ref_id: refId,
            amount,
            status: result.Status ?? "22",
            refund_id: result.RefundID,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const rawData =
      typeof payload.rawData === "string"
        ? payload.rawData
        : payload.rawData?.toString()

    const data = normalizeWebhookPayload(payload.data, rawData)

    if (data.domain && data.domain !== this.options_.merchantId) {
      this.logger_?.warn(
        `Fiuu webhook for unknown merchant domain: ${data.domain}`
      )

      return { action: "not_supported" }
    }

    if (!verifySkey(data, this.options_.secretKey)) {
      this.logger_?.warn("Fiuu webhook failed signature verification")

      return { action: "not_supported" }
    }

    const sessionId = data.orderid
    const amount = new BigNumber(data.amount ?? "0")

    if (!sessionId) {
      return { action: "not_supported" }
    }

    const status = mapFiuuStatus(data.status)

    if (status === "paid") {
      return {
        action: "captured",
        data: { session_id: sessionId, amount },
      }
    }

    if (status === "pending") {
      return {
        action: "pending",
        data: { session_id: sessionId, amount },
      }
    }

    return {
      action: "failed",
      data: { session_id: sessionId, amount },
    }
  }

  private getData(data?: Record<string, unknown>): FiuuPaymentData {
    return (data ?? {}) as unknown as FiuuPaymentData
  }

  private resolveCurrency(currencyCode?: string): string {
    return (currencyCode || this.options_.currency || "MYR").toUpperCase()
  }

  private getPaymentBaseUrl(): string {
    if (this.options_.paymentBaseUrl) {
      return this.options_.paymentBaseUrl
    }

    return this.options_.sandbox
      ? SANDBOX_PAYMENT_URL
      : PRODUCTION_PAYMENT_URL
  }

  private getApiBaseUrl(): string {
    if (this.options_.apiBaseUrl) {
      return this.options_.apiBaseUrl
    }

    if (this.options_.sandbox) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Fiuu sandbox refunds require the apiBaseUrl option (FIUU_API_BASE_URL)."
      )
    }

    return PRODUCTION_API_URL
  }

  private buildCheckoutUrl(params: {
    sessionId: string
    amount: string
    currency: string
    context: InitiatePaymentInput["context"]
    extra: FiuuPaymentData
  }): string {
    const { sessionId, amount, currency, context, extra } = params
    const customer = context?.customer
    const address = customer?.billing_address

    const email = extra.bill_email ?? customer?.email

    if (!email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Fiuu requires a customer email. Create the payment session with data.bill_email or complete the cart with an email."
      )
    }

    const name =
      extra.bill_name ??
      ([customer?.first_name, customer?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
        customer?.company_name ||
        "Guest")

    const mobile = extra.bill_mobile ?? customer?.phone ?? "0000000000"
    const country = address?.country_code ?? this.options_.country ?? "MY"

    const vcode = buildVcode({
      amount,
      merchantId: this.options_.merchantId,
      orderId: sessionId,
      verifyKey: this.options_.verifyKey,
      currency,
      extended: this.options_.extendedVcode,
    })

    const url = new URL(
      `${this.getPaymentBaseUrl()}/RMS/pay/${encodeURIComponent(
        this.options_.merchantId
      )}/`
    )

    const searchParams = url.searchParams
    searchParams.set("amount", amount)
    searchParams.set("orderid", sessionId)
    searchParams.set("bill_name", name.slice(0, 128))
    searchParams.set("bill_email", email.slice(0, 128))
    searchParams.set("bill_mobile", mobile.slice(0, 32))
    searchParams.set("bill_desc", `Order ${sessionId}`.slice(0, 200))
    searchParams.set("country", country.slice(0, 2))
    searchParams.set("currency", currency)
    searchParams.set("vcode", vcode)

    if (this.options_.channel) {
      searchParams.set("channel", this.options_.channel)
    }

    const urls = {
      returnurl: this.options_.returnUrl,
      callbackurl: this.options_.callbackUrl,
      cancelurl: this.options_.cancelUrl,
    }

    for (const [key, value] of Object.entries(urls)) {
      if (value) {
        searchParams.set(key, value)
      }
    }

    searchParams.set("metadata", JSON.stringify({ session_id: sessionId }))

    return url.toString()
  }

  private assertRefundResponseSignature(result: FiuuRefundResponse): void {
    if (!result.Status || !result.Signature || !result.RefundID) {
      return
    }

    const expected = buildRefundResponseSignature({
      refundType: result.RefundType ?? "P",
      merchantId: result.MerchantID ?? this.options_.merchantId,
      refId: result.RefID ?? "",
      refundId: result.RefundID,
      transactionId: result.TxnID ?? "",
      amount: result.Amount ?? "",
      status: result.Status,
      secretKey: this.options_.secretKey,
    })

    if (!safeCompare(result.Signature, expected)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Fiuu refund response failed signature verification."
      )
    }
  }
}

export default FiuuPaymentProviderService
