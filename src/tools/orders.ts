import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_ORDERS_QUERY = `
query ListOrders($first: Int!, $query: String, $after: String) {
  orders(first: $first, query: $query, after: $after) {
    nodes {
      id name createdAt displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id displayName email }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const GET_ORDER_QUERY = `
query GetOrder($id: ID!) {
  order(id: $id) {
    id name email phone createdAt processedAt closedAt cancelledAt
    displayFinancialStatus displayFulfillmentStatus note tags
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalPriceSet { shopMoney { amount currencyCode } }
    totalShippingPriceSet { shopMoney { amount currencyCode } }
    totalTaxSet { shopMoney { amount currencyCode } }
    customer { id displayName email }
    shippingAddress { name address1 address2 city provinceCode zip countryCode phone }
    lineItems(first: 100) {
      nodes {
        id title quantity sku
        variant { id }
        originalUnitPriceSet { shopMoney { amount currencyCode } }
      }
    }
    fulfillments(first: 10) {
      id status createdAt
      trackingInfo { number url company }
    }
  }
}`;

export const orderTools = [
  {
    name: "shopify_list_orders",
    description:
      "List orders in a store. Supports Shopify search query syntax (e.g. \"financial_status:paid\", \"fulfillment_status:unfulfilled\", \"created_at:>2026-01-01\") and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_ORDERS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_get_order",
    description:
      "Get a single order with totals, customer, shipping address, line items, and fulfillments (tracking info). Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Order ID (numeric or gid://shopify/Order/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(GET_ORDER_QUERY, { id: toGid("Order", args.id) }, args.account);
    },
  },
];
