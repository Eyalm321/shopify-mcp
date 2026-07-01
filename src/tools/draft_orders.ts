import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_DRAFT_ORDERS_QUERY = `
query ListDraftOrders($first: Int!, $query: String, $after: String) {
  draftOrders(first: $first, query: $query, after: $after) {
    nodes {
      id name status createdAt updatedAt invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id displayName email }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const GET_DRAFT_ORDER_QUERY = `
query GetDraftOrder($id: ID!) {
  draftOrder(id: $id) {
    id name status createdAt updatedAt completedAt invoiceUrl email note2 tags
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalPriceSet { shopMoney { amount currencyCode } }
    totalTaxSet { shopMoney { amount currencyCode } }
    customer { id displayName email }
    shippingAddress { name address1 address2 city provinceCode zip countryCode phone }
    lineItems(first: 100) {
      nodes {
        id title quantity sku custom
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        variant { id }
      }
    }
    order { id name }
  }
}`;

const CREATE_DRAFT_ORDER_MUTATION = `
mutation CreateDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id name status invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
    }
    userErrors { field message }
  }
}`;

const COMPLETE_DRAFT_ORDER_MUTATION = `
mutation CompleteDraftOrder($id: ID!, $paymentPending: Boolean) {
  draftOrderComplete(id: $id, paymentPending: $paymentPending) {
    draftOrder { id name status order { id name } }
    userErrors { field message }
  }
}`;

const DELETE_DRAFT_ORDER_MUTATION = `
mutation DeleteDraftOrder($input: DraftOrderDeleteInput!) {
  draftOrderDelete(input: $input) {
    deletedId
    userErrors { field message }
  }
}`;

export const draftOrderTools = [
  {
    name: "shopify_list_draft_orders",
    description:
      "List draft orders. Supports Shopify search query syntax (e.g. \"status:open\") and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_DRAFT_ORDERS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_get_draft_order",
    description:
      "Get a single draft order with totals, customer, line items, and the completed order (if any). Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Draft order ID (numeric or gid://shopify/DraftOrder/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(GET_DRAFT_ORDER_QUERY, { id: toGid("DraftOrder", args.id) }, args.account);
    },
  },
  {
    name: "shopify_create_draft_order",
    description:
      "Create a draft order from variant line items and/or custom line items (title + originalUnitPrice). Returns the draft with its invoiceUrl (not sent to the customer automatically).",
    inputSchema: z.object({
      lineItems: z
        .array(
          z.object({
            variantId: z
              .string()
              .optional()
              .describe("Variant ID (numeric or GID) for catalog items."),
            quantity: z.number().int().min(1).describe("Quantity."),
            title: z.string().optional().describe("Title for custom (non-catalog) line items."),
            originalUnitPrice: z
              .string()
              .optional()
              .describe("Unit price for custom line items, e.g. \"25.00\"."),
          })
        )
        .min(1)
        .describe("Line items — variantId for catalog items, title+originalUnitPrice for custom."),
      customerId: z
        .string()
        .optional()
        .describe("Attach to an existing customer (numeric ID or GID)."),
      email: z.string().optional().describe("Customer email for the draft."),
      note: z.string().optional().describe("Internal note."),
      tags: z.array(z.string()).optional().describe("Tags to apply."),
      shippingAddress: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("MailingAddressInput object (address1, city, provinceCode, zip, countryCode, ...)."),
      account: accountField,
    }),
    handler: async (args: {
      lineItems: Array<{
        variantId?: string;
        quantity: number;
        title?: string;
        originalUnitPrice?: string;
      }>;
      customerId?: string;
      email?: string;
      note?: string;
      tags?: string[];
      shippingAddress?: Record<string, unknown>;
      account?: string;
    }) => {
      const input: Record<string, unknown> = {
        lineItems: args.lineItems.map((li) => {
          const item: Record<string, unknown> = { quantity: li.quantity };
          if (li.variantId) item.variantId = toGid("ProductVariant", li.variantId);
          if (li.title) item.title = li.title;
          if (li.originalUnitPrice) item.originalUnitPrice = li.originalUnitPrice;
          return item;
        }),
      };
      if (args.customerId) {
        input.purchasingEntity = { customerId: toGid("Customer", args.customerId) };
      }
      if (args.email) input.email = args.email;
      if (args.note) input.note = args.note;
      if (args.tags) input.tags = args.tags;
      if (args.shippingAddress) input.shippingAddress = args.shippingAddress;
      return adminGraphql(CREATE_DRAFT_ORDER_MUTATION, { input }, args.account);
    },
  },
  {
    name: "shopify_complete_draft_order",
    description:
      "Complete a draft order, turning it into a real order. paymentPending=true marks the order as payment pending instead of paid.",
    inputSchema: z.object({
      id: z.string().describe("Draft order ID (numeric or gid://shopify/DraftOrder/...)."),
      paymentPending: z
        .boolean()
        .optional()
        .describe("Mark the resulting order as payment pending (default false = paid)."),
      account: accountField,
    }),
    handler: async (args: { id: string; paymentPending?: boolean; account?: string }) => {
      return adminGraphql(
        COMPLETE_DRAFT_ORDER_MUTATION,
        { id: toGid("DraftOrder", args.id), paymentPending: args.paymentPending },
        args.account
      );
    },
  },
  {
    name: "shopify_delete_draft_order",
    description: "Delete a draft order permanently. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Draft order ID (numeric or gid://shopify/DraftOrder/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(
        DELETE_DRAFT_ORDER_MUTATION,
        { input: { id: toGid("DraftOrder", args.id) } },
        args.account
      );
    },
  },
];
