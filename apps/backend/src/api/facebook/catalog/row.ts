export type CatalogVariant = {
  id: string
  title?: string | null
  sku?: string | null
  barcode?: string | null
  manage_inventory?: boolean | null
  inventory_quantity?: number | null
  prices?: {
    amount?: number | null
    currency_code?: string | null
  }[] | null
  calculated_price?: {
    calculated_amount?: number | null
    original_amount?: number | null
    currency_code?: string | null
  } | null
}

export type CatalogProduct = {
  id: string
  title: string
  handle?: string | null
  description?: string | null
  thumbnail?: string | null
  images?: { url?: string | null }[] | null
  variants?: CatalogVariant[] | null
}

export type CatalogRowOptions = {
  storefrontUrl: string
  brand: string
  currency: string
  backendUrl: string
}

const TAB = "\t"
const NEWLINE = "\n"

export function catalogHeaders(): string[] {
  return [
    "id",
    "item_group_id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "sale_price",
    "link",
    "image_link",
    "brand",
    "gtin",
    "mpn",
    "quantity_to_sell_on_facebook",
  ]
}

function sanitize(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim()
}

function absoluteUrl(url: string | null | undefined, backendUrl: string): string | undefined {
  if (!url) {
    return undefined
  }

  if (/^https?:\/\//i.test(url)) {
    return url
  }

  return `${backendUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`
}

function formatPrice(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`
}

export function buildCatalogRow(
  product: CatalogProduct,
  variant: CatalogVariant,
  options: CatalogRowOptions
): string | undefined {
  const image = absoluteUrl(
    product.thumbnail ?? product.images?.find((entry) => entry.url)?.url,
    options.backendUrl
  )

  if (!image || !product.handle) {
    return undefined
  }

  const directPrice = variant.prices?.find(
    (price) =>
      price.currency_code?.toLowerCase() === options.currency.toLowerCase()
  )

  const price =
    variant.calculated_price?.calculated_amount ?? directPrice?.amount
  const original = variant.calculated_price?.original_amount
  const currency = (
    variant.calculated_price?.currency_code ??
    directPrice?.currency_code ??
    options.currency
  ).toUpperCase()

  if (typeof price !== "number") {
    return undefined
  }

  const trackedInventory = variant.manage_inventory !== false
  const quantity = trackedInventory ? variant.inventory_quantity ?? 0 : undefined
  const availability =
    !trackedInventory || (quantity ?? 0) > 0 ? "in stock" : "out of stock"

  const variantTitle =
    variant.title && variant.title.toLowerCase() !== "default"
      ? ` - ${variant.title}`
      : ""

  const hasSale = typeof original === "number" && original > price

  const values: (string | number | undefined)[] = [
    variant.id,
    product.id,
    `${product.title}${variantTitle}`,
    product.description ?? product.title,
    availability,
    "new",
    formatPrice(hasSale ? (original as number) : price, currency),
    hasSale ? formatPrice(price, currency) : undefined,
    `${options.storefrontUrl.replace(/\/$/, "")}/products/${product.handle}`,
    image,
    options.brand,
    variant.barcode ?? undefined,
    variant.sku ?? undefined,
    quantity,
  ]

  return values
    .map((value) =>
      value === undefined ? "" : sanitize(String(value))
    )
    .join(TAB)
}

export function buildCatalogTsv(
  products: CatalogProduct[],
  options: CatalogRowOptions
): string {
  const lines = [catalogHeaders().join(TAB)]

  for (const product of products) {
    for (const variant of product.variants ?? []) {
      const row = buildCatalogRow(product, variant, options)

      if (row) {
        lines.push(row)
      }
    }
  }

  return `${lines.join(NEWLINE)}${NEWLINE}`
}
