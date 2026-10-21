import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Only register Fiuu when credentials exist, so deployments without them
// still boot. Enable by setting FIUU_MERCHANT_ID, FIUU_VERIFY_KEY and
// FIUU_SECRET_KEY.
const fiuuEnabled = Boolean(
  process.env.FIUU_MERCHANT_ID &&
    process.env.FIUU_VERIFY_KEY &&
    process.env.FIUU_SECRET_KEY
)

const fiuuProvider = {
  resolve: "./src/modules/payment-fiuu",
  id: "fiuu",
  options: {
    merchantId: process.env.FIUU_MERCHANT_ID,
    verifyKey: process.env.FIUU_VERIFY_KEY,
    secretKey: process.env.FIUU_SECRET_KEY,
    sandbox: process.env.FIUU_SANDBOX === "true",
    extendedVcode: process.env.FIUU_EXTENDED_VCODE === "true",
    currency: process.env.FIUU_CURRENCY || "MYR",
    country: process.env.FIUU_COUNTRY,
    channel: process.env.FIUU_CHANNEL,
    paymentBaseUrl: process.env.FIUU_PAYMENT_BASE_URL,
    apiBaseUrl: process.env.FIUU_API_BASE_URL,
    returnUrl: process.env.FIUU_RETURN_URL,
    callbackUrl: process.env.FIUU_CALLBACK_URL,
    cancelUrl: process.env.FIUU_CANCEL_URL,
  },
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Coolify's managed Postgres has SSL off. Without this, the migration
    // path re-derives driver defaults from the URL with ssl_mode stripped
    // and forces a TLS handshake that the server rejects.
    databaseDriverOptions:
      process.env.DATABASE_SSL === "true"
        ? undefined
        : { connection: { ssl: false } },
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "worker"
      | "server") || "shared",
    // Framework forces `secure: true` in production, which drops the session
    // cookie on plain HTTP origins. Set COOKIE_SECURE=true once the app is
    // served over HTTPS.
    cookieOptions: {
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax" as const,
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: fiuuEnabled ? [fiuuProvider] : [],
      },
    },
  ],
})
