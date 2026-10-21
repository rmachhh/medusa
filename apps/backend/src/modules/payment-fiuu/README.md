# Fiuu payment provider

Medusa v2 payment provider for [Fiuu](https://fiuu.com) (formerly Razer Merchant
Services / MOLPay), using the hosted payment page.

## Configuration

Register the provider under the payment module in `medusa-config.ts` (already
done) and set these environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `FIUU_MERCHANT_ID` | yes | Merchant ID from the Fiuu portal |
| `FIUU_VERIFY_KEY` | yes | Verify Key (used for the `vcode` request hash) |
| `FIUU_SECRET_KEY` | yes | Secret Key (used to verify `skey` responses) |
| `FIUU_SANDBOX` | no | `true` uses `sandbox-payment.fiuu.com` |
| `FIUU_EXTENDED_VCODE` | no | `true` if "Use extended format for Verify Payment" is enabled in the portal |
| `FIUU_CURRENCY` | no | Default currency, defaults to `MYR` |
| `FIUU_COUNTRY` | no | Default buyer country, defaults to `MY` |
| `FIUU_CHANNEL` | no | Preselect a channel, e.g. `FPX_MB2U` |
| `FIUU_PAYMENT_BASE_URL` | no | Override the hosted payment page origin |
| `FIUU_API_BASE_URL` | no | Required for refunds in sandbox |
| `FIUU_RETURN_URL` | no | Buyer redirect after payment |
| `FIUU_CALLBACK_URL` | no | Fiuu callback/notification URL |
| `FIUU_CANCEL_URL` | no | Buyer redirect on cancel |

## Webhook

Fiuu sends the notification as `application/x-www-form-urlencoded` POST. Point
the portal's Notification URL and Callback URL to:

```
https://<backend-domain>/hooks/payment/fiuu_fiuu
```

The provider verifies the `skey` signature, checks the merchant `domain`, and
maps the status:

| Fiuu status | Medusa action |
| --- | --- |
| `00` | `captured` |
| `22` | `pending` |
| other | `failed` |

Invalid or replayed signatures return `not_supported`, so they never mark a
payment as paid.

## Flow

1. Storefront creates a payment session with provider `pp_fiuu_fiuu`.
2. `initiatePayment` returns `data.checkout_url` and the session id.
3. Storefront redirects the buyer to `checkout_url`. Guest email and name can be
   supplied when creating the session as `data.bill_email`, `data.bill_name`,
   and `data.bill_mobile`.
4. Fiuu redirects back and POSTs the status to the webhook; the webhook
   authorizes/captures the payment in Medusa.

`authorizePayment` returns `pending_authorization` until the webhook confirms the
payment.

## Limitations

- Fiuu sale transactions are captured immediately. `capturePayment` is a no-op.
- `cancelPayment` only updates local data; there is no void/reversal call.
- Refunds use the Advanced Full/Partial Refund API and require a stored
  transaction id. Sandbox refunds need `FIUU_API_BASE_URL`.
- Payment notifications are idempotent; Fiuu may send the same status more than
  once.

## Tests

```
cd apps/backend
npm run test:unit
```

Covers vcode/skey/refund signatures, hosted URL construction, status mapping,
webhook verification (tampered amount, wrong merchant, raw urlencoded body), and
the refund request payload.
