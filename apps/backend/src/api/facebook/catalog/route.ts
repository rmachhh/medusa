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
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.calculated_price",
    ],
    filters: {
      status: "published",
    },
    context: {
      variants: {
        calculated_price: QueryContext({
          currency_code: options.currency.toLowerCase(),
        }),
      },
    },
  })

  const products = data as unknown as CatalogProduct[]

  if (req.query.debug === "1") {
    res.status(200).json({
      currency: options.currency,
      productCount: products.length,
      sample: products.slice(0, 2).map((product) => ({
        id: product.id,
        handle: product.handle,
        thumbnail: product.thumbnail,
        imageCount: product.images?.length ?? 0,
        variantCount: product.variants?.length ?? 0,
        variants: (product.variants ?? []).slice(0, 2).map((variant) => ({
          id: variant.id,
          calculated_price: variant.calculated_price,
          prices: (variant as any).prices,
          manage_inventory: variant.manage_inventory,
          inventory_quantity: variant.inventory_quantity,
        })),
      })),
    })
    return
  }

  const tsv = buildCatalogTsv(products, options)

  res.setHeader("content-type", "text/tab-separated-values; charset=utf-8")
  res.setHeader("cache-control", "public, max-age=300")
  res.send(tsv)
}
