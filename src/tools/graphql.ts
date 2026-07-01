import { z } from "zod";
import { adminGraphql, storefrontGraphql } from "../client.js";
import { accountField } from "./_shared.js";

export const graphqlTools = [
  {
    name: "shopify_admin_graphql",
    description:
      "Execute an arbitrary GraphQL query or mutation against a store's Admin API. Escape hatch for anything not covered by the dedicated tools (metafields, discounts, fulfillment, webhooks, bulk operations, ...).",
    inputSchema: z.object({
      query: z.string().describe("GraphQL query or mutation."),
      variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("GraphQL variables object."),
      account: accountField,
    }),
    handler: async (args: {
      query: string;
      variables?: Record<string, unknown>;
      account?: string;
    }) => {
      return adminGraphql(args.query, args.variables, args.account);
    },
  },
  {
    name: "shopify_storefront_graphql",
    description:
      "Execute an arbitrary GraphQL query against a store's Storefront API (public product/collection/cart data as customers see it). Requires storefrontAccessToken on the store account.",
    inputSchema: z.object({
      query: z.string().describe("GraphQL query."),
      variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("GraphQL variables object."),
      account: accountField,
    }),
    handler: async (args: {
      query: string;
      variables?: Record<string, unknown>;
      account?: string;
    }) => {
      return storefrontGraphql(args.query, args.variables, args.account);
    },
  },
];
