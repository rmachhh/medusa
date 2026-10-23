import {
  buildCatalogRow,
  buildCatalogTsv,
  catalogHeaders,
  CatalogProduct,
} from "../catalog/row"

const options = {
  storefrontUrl: "https://demo.chanlabs.dev/",
  brand: "Chanlabs",
  currency: "PHP",
  backendUrl: "https://medusa.lca-app.com",
}

const product: CatalogProduct = {
  id: "prod_1",
  title: "Test Shirt",
  handle: "test-shirt",
  description: "A\tsoft\nshirt",
  thumbnail: "/uploads/shirt.jpg",
  images: [{ url: "/uploads/shirt-2.jpg" }],
  variants: [
    {
      id: "variant_1",
      title: "Default",
      sku: "SKU-1",
      barcode: "1234567890123",
      manage_inventory: true,
      inventory_quantity: 5,
      calculated_price: {
        calculated_amount: 2999,
        original_amount: 3499,
        currency_code: "php",
      },
    },
  ],
}

describe("buildCatalogRow", () => {
  it("maps a Medusa variant to Meta catalog fields", () => {
    const row = buildCatalogRow(product, product.variants![0], options)

    expect(row?.split("\t")).toEqual([
      "variant_1",
      "prod_1",
      "Test Shirt",
      "A soft shirt",
      "in stock",
      "new",
      "3499.00 php",
      "2999.00 php",
      "https://demo.chanlabs.dev/products/test-shirt",
      "https://medusa.lca-app.com/uploads/shirt.jpg",
      "Chanlabs",
      "1234567890123",
      "SKU-1",
      "5",
    ])
  })

  it("marks zero inventory as out of stock", () => {
    const variant = {
      ...product.variants![0],
      inventory_quantity: 0,
    }

    const row = buildCatalogRow(product, variant, options)

    expect(row?.split("\t")[4]).toBe("out of stock")
  })

  it("keeps preorder-style untracked inventory in stock", () => {
    const variant = {
      ...product.variants![0],
      manage_inventory: false,
      inventory_quantity: 0,
    }

    const row = buildCatalogRow(product, variant, options)

    expect(row?.split("\t")[4]).toBe("in stock")
  })

  it("leaves sale_price empty without a discount", () => {
    const variant = {
      ...product.variants![0],
      calculated_price: {
        calculated_amount: 2999,
        original_amount: 2999,
        currency_code: "PHP",
      },
    }

    const row = buildCatalogRow(product, variant, options)

    expect(row?.split("\t")[6]).toBe("2999.00 PHP")
    expect(row?.split("\t")[7]).toBe("")
  })

  it("skips variants without a price, image, or handle", () => {
    expect(
      buildCatalogRow(
        product,
        { ...product.variants![0], calculated_price: null },
        options
      )
    ).toBeUndefined()
    expect(
      buildCatalogRow({ ...product, thumbnail: null, images: [] }, product.variants![0], options)
    ).toBeUndefined()
    expect(
      buildCatalogRow({ ...product, handle: null }, product.variants![0], options)
    ).toBeUndefined()
  })

  it("strips tabs and newlines from field values", () => {
    const row = buildCatalogRow(product, product.variants![0], options)
    const fields = row!.split("\t")

    expect(fields[3]).toBe("A soft shirt")
    expect(fields.every((field) => !field.includes("\n"))).toBe(true)
  })
})

describe("buildCatalogTsv", () => {
  it("writes a header and one row per variant", () => {
    const tsv = buildCatalogTsv([product], options)
    const lines = tsv.trimEnd().split("\n")

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(catalogHeaders().join("\t"))
  })

  it("returns only the header for an empty catalog", () => {
    expect(buildCatalogTsv([], options).trimEnd()).toBe(
      catalogHeaders().join("\t")
    )
  })
})
