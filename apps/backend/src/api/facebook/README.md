# Facebook / Meta catalog feed

Public TSV feed for Meta Commerce Manager.

```
GET /facebook/catalog?token=<FACEBOOK_CATALOG_TOKEN>
```

Environment:

| Variable | Purpose |
| --- | --- |
| `FACEBOOK_CATALOG_TOKEN` | Required. Random secret in the URL; request without it returns 403. |
| `FACEBOOK_CATALOG_CURRENCY` | Currency for calculated prices, default `PHP`. |
| `FACEBOOK_CATALOG_BRAND` | Brand value written for every item. |
| `STOREFRONT_URL` | Base URL used to build product links. |
| `MEDUSA_BACKEND_URL` | Base URL used to make relative image paths absolute. |

Behavior:

- One row per variant, `item_group_id` = product id.
- Only `published` products.
- `price` uses the original amount; `sale_price` is set when the calculated price is lower.
- `availability` is `out of stock` when inventory is tracked and quantity is zero.
- Rows without a price, handle, or image are skipped, since Meta rejects them.
- Tabs and newlines are stripped from field values.
- Response is cached by Meta for five minutes (`Cache-Control: max-age=300`).

Commerce Manager setup: Data sources → Add data source → Data feed → Scheduled feed,
URL `https://<backend>/facebook/catalog?token=<token>`, currency PHP, hourly fetch.
