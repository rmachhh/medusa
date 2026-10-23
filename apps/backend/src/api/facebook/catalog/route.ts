import { timingSafeEqual } from "node:crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  QueryContext,
} from "@medusajs/framework/utils"
import {
  buildCatalogTsv,
  CatalogProduct,
  CatalogRowOptions,
} from "./row"

function tokensMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

function getOptions(req: MedusaRequest): CatalogRowOptions {
  const host = req.get("host") ?? "localhost"
  const backendUrl =
    process.env.MEDUSA_BACKEND_URL ?? `${req.protocol}://${host}`

  return {
    storefrontUrl: process.env.STOREFRONT_URL ?? "https://demo.chanlabs.dev",
    brand: process.env.FACEBOOK_CATALOG_BRAND ?? "Chanlabs",
    currency: process.env.FACEBOOK_CATALOG_CURRENCY ?? "PHP",
    backendUrl,
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const expectedToken = process.env.FACEBOOK_CATALOG_TOKEN
  const receivedToken =
    typeof req.query.token === "string" ? req.query.token : ""

  if (!expectedToken || !tokensMatch(expectedToken, receivedToken)) {
    res.status(403).json({ message: "Forbidden" })
    return
  }

  const options = getOptions(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "description",
      "thumbnail",
      "status",
      "images.url",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.barcode",
      "variants.manage_inventory",
      "variants.inventory_quantity",
      "variants.calculated_price",
    ],
    filters: {
      status: "published",
    },
    context: {
      variants: {
        calculated_price: QueryContext({
          currency_code: options.currency,
        }),
      },
    },
  })

  const products = data as unknown as CatalogProduct[]
  const tsv = buildCatalogTsv(products, options)

  res.setHeader("content-type", "text/tab-separated-values; charset=utf-8")
  res.setHeader("cache-control", "public, max-age=300")
  res.send(tsv)
}
