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
  extendedVcode?: boolean
  devAmount?: string
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
  bill_country?: string
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
