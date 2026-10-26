export type FiuuOptions = {
  merchantId: string
  verifyKey: string
  secretKey: string
  sandbox?: boolean
  paymentBaseUrl?: string
  apiBaseUrl?: string
  currency?: string
  country?: string
  channel?: string
  returnUrl?: string
  notifyUrl?: string
  callbackUrl?: string
  cancelUrl?: string
  // Origins allowed to override the return/cancel URL per payment session.
  // Empty means every session uses the configured returnUrl/cancelUrl.
  allowedReturnOrigins?: string[]
  extendedVcode?: boolean
  testAmount?: string | number
}

export type FiuuPaymentStatus = "pending" | "paid" | "failed" | "canceled"

export type FiuuRefundRecord = {
  ref_id: string
  amount: string
  status: string
  refund_id?: string
  created_at: string
}

export type FiuuPaymentData = {
  session_id: string
  amount: string
  currency: string
  status: FiuuPaymentStatus
  checkout_url: string
  transaction_id?: string
  paydate?: string
  appcode?: string
  channel?: string
  bill_email?: string
  bill_name?: string
  bill_mobile?: string
  // Per-session storefront URLs, already validated against the allowlist.
  return_url?: string
  cancel_url?: string
  refunds?: FiuuRefundRecord[]
}

export type FiuuWebhookPayload = Record<string, string | undefined>

export type FiuuRefundResponse = {
  RefundType?: string
  MerchantID?: string
  RefID?: string
  RefundID?: string
  TxnID?: string
  Amount?: string
  Status?: string
  Signature?: string
  reason?: string
  error_code?: string
  error_desc?: string
}

export type FiuuStatusQueryResponse = {
  StatCode?: string
  StatName?: string
  OrderID?: string
  Amount?: string
  TranID?: string
  Domain?: string
  BillingDate?: string
  VrfKey?: string
  Channel?: string
  Currency?: string
  ErrorCode?: string
  ErrorDesc?: string
}
