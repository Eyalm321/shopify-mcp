# shopify-multi-mcp

MCP server for Shopify with **multi-account support** — talk to multiple stores (Admin API + Storefront API) and partner organizations (Partner API) from one server. Every tool takes an optional `account` parameter to pick which configured account to use.

## Features

- **Multiple accounts of different kinds** in one server:
  - `store` accounts → Admin GraphQL API (products, orders, customers, inventory, collections, shop info, raw GraphQL) and optionally the Storefront GraphQL API
  - `partner` accounts → Partner GraphQL API (transactions, app events, raw GraphQL)
- **49 tools**, all namespaced `shopify_*`
- Raw GraphQL escape hatches for all three APIs — anything not covered by a dedicated tool is still reachable
- Numeric IDs auto-expand to Shopify GIDs (`123` → `gid://shopify/Product/123`)
- Tokens are never returned by any tool

## Configuration

Accounts are configured via environment variables, a JSON accounts file, or both.

### Single store (env vars)

```json
{
  "mcpServers": {
    "shopify": {
      "command": "npx",
      "args": ["-y", "shopify-multi-mcp"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_..."
      }
    }
  }
}
```

Optional: `SHOPIFY_API_VERSION` (default `2026-04`), `SHOPIFY_STOREFRONT_ACCESS_TOKEN`.

### Single partner organization (env vars)

```
SHOPIFY_PARTNER_ORGANIZATION_ID=1234567
SHOPIFY_PARTNER_ACCESS_TOKEN=prtapi_...
```

Optional: `SHOPIFY_PARTNER_API_VERSION` (default `2026-07`).

### Multiple accounts (accounts file)

Set `SHOPIFY_ACCOUNTS_FILE` to the path of a JSON file:

```json
[
  {
    "name": "sunsations-dev",
    "type": "store",
    "storeDomain": "sunsations-dev.myshopify.com",
    "accessToken": "shpat_...",
    "apiVersion": "2026-04",
    "storefrontAccessToken": "optional..."
  },
  {
    "name": "sunsations-prod",
    "type": "store",
    "storeDomain": "sunsations-usa.myshopify.com",
    "accessToken": "shpat_..."
  },
  {
    "name": "iola-partners",
    "type": "partner",
    "organizationId": "1234567",
    "accessToken": "prtapi_..."
  }
]
```

Notes:

- `type` may be omitted when it is inferable (`storeDomain` present → store; `organizationId` present → partner)
- `storeDomain` accepts a bare handle (`sunsations-dev`) or a full domain; aliases `domain` / `store` / `shop` work too; `token` is an alias for `accessToken`
- Account names are matched case-insensitively; duplicates are rejected
- Entries in the file **override** env-var accounts with the same name (`default` for the env store, `partner` for the env partner org)

### Account selection

- Tools default to the account named `default` (store tools) or `partner` (partner tools)
- When exactly one account of the required type is configured, it is used automatically
- Otherwise, pass `account: "<name>"` — `shopify_list_accounts` shows what is configured

## Getting tokens

- **Store Admin token** (`shpat_...`): store admin → Settings → Apps and sales channels → Develop apps → create a custom app → Admin API access token. Grant the scopes you need (e.g. `read_products`, `write_products`, `read_orders`, ...).
- **Storefront token**: same custom app → Storefront API access token.
- **Partner token** (`prtapi_...`): Partner Dashboard → Settings → Partner API clients (organization owners only). Rate limit: 4 req/s.

## Tools

| Module | Tools |
| --- | --- |
| Accounts | `shopify_list_accounts` |
| Shop | `shopify_get_shop` |
| Products | `shopify_list_products`, `shopify_get_product`, `shopify_create_product`, `shopify_update_product`, `shopify_delete_product`, `shopify_update_variants` |
| Orders | `shopify_list_orders`, `shopify_get_order` |
| Customers | `shopify_list_customers`, `shopify_get_customer`, `shopify_create_customer`, `shopify_update_customer` |
| Inventory | `shopify_list_locations`, `shopify_get_inventory_levels`, `shopify_adjust_inventory` |
| Collections | `shopify_list_collections`, `shopify_get_collection` |
| Metafields | `shopify_get_metafields`, `shopify_set_metafields`, `shopify_delete_metafields` |
| Draft orders | `shopify_list_draft_orders`, `shopify_get_draft_order`, `shopify_create_draft_order`, `shopify_complete_draft_order`, `shopify_delete_draft_order` |
| Discounts | `shopify_list_discounts`, `shopify_create_discount_code`, `shopify_toggle_discount`, `shopify_delete_discount` |
| Webhooks | `shopify_list_webhooks`, `shopify_create_webhook`, `shopify_delete_webhook` |
| Fulfillment | `shopify_list_fulfillment_orders`, `shopify_create_fulfillment`, `shopify_update_tracking` |
| Files/Media | `shopify_list_files`, `shopify_upload_file`, `shopify_attach_product_media`, `shopify_delete_files` |
| Bulk | `shopify_run_bulk_query`, `shopify_get_bulk_operation`, `shopify_cancel_bulk_operation` |
| GraphQL | `shopify_admin_graphql`, `shopify_storefront_graphql` |
| Partner | `shopify_partner_graphql`, `shopify_partner_transactions`, `shopify_partner_app_events` |

List tools support Shopify's [search query syntax](https://shopify.dev/docs/api/usage/search-syntax) via the `query` parameter and cursor pagination via `first` / `after`.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc → dist/
```

## License

MIT
