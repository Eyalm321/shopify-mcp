import { z } from "zod";
import { partnerGraphql } from "../client.js";
import { accountField, afterField } from "./_shared.js";

const TRANSACTIONS_QUERY = `
query Transactions($first: Int!, $after: String, $createdAtMin: DateTime, $createdAtMax: DateTime) {
  transactions(first: $first, after: $after, createdAtMin: $createdAtMin, createdAtMax: $createdAtMax) {
    edges {
      cursor
      node {
        id createdAt __typename
        ... on AppSubscriptionSale {
          netAmount { amount currencyCode }
          app { id name }
          shop { id myshopifyDomain }
        }
        ... on AppOneTimeSale {
          netAmount { amount currencyCode }
          app { id name }
          shop { id myshopifyDomain }
        }
        ... on AppUsageSale {
          netAmount { amount currencyCode }
          app { id name }
          shop { id myshopifyDomain }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

const APP_EVENTS_QUERY = `
query AppEvents($id: ID!, $first: Int!, $after: String, $types: [AppEventTypes!], $shopId: ID, $occurredAtMin: DateTime, $occurredAtMax: DateTime) {
  app(id: $id) {
    id name
    events(first: $first, after: $after, types: $types, shopId: $shopId, occurredAtMin: $occurredAtMin, occurredAtMax: $occurredAtMax) {
      edges {
        cursor
        node { type occurredAt shop { id myshopifyDomain } }
      }
      pageInfo { hasNextPage }
    }
  }
}`;

const partnerFirstField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Number of items to return (default 20, max 100).");

export const partnerTools = [
  {
    name: "shopify_partner_graphql",
    description:
      "Execute an arbitrary GraphQL query against the Partner API of a partner organization (transactions, apps, app events, Experts Marketplace jobs/conversations). Escape hatch for anything not covered by the dedicated partner tools. Rate limit: 4 req/s.",
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
      return partnerGraphql(args.query, args.variables, args.account);
    },
  },
  {
    name: "shopify_partner_transactions",
    description:
      "List Partner Dashboard transactions (app sales, theme sales, service sales, referrals) for a partner organization. App sales include net amount, app, and shop. Paginate with the last edge's cursor as 'after'.",
    inputSchema: z.object({
      first: partnerFirstField,
      after: afterField,
      createdAtMin: z
        .string()
        .optional()
        .describe("Only transactions created at or after this ISO 8601 datetime."),
      createdAtMax: z
        .string()
        .optional()
        .describe("Only transactions created at or before this ISO 8601 datetime."),
      account: accountField,
    }),
    handler: async (args: {
      first?: number;
      after?: string;
      createdAtMin?: string;
      createdAtMax?: string;
      account?: string;
    }) => {
      return partnerGraphql(
        TRANSACTIONS_QUERY,
        {
          first: args.first ?? 20,
          after: args.after,
          createdAtMin: args.createdAtMin,
          createdAtMax: args.createdAtMax,
        },
        args.account
      );
    },
  },
  {
    name: "shopify_partner_app_events",
    description:
      "List lifecycle events for one of the organization's apps (installs, uninstalls, charges, credits). Requires the app's GID (gid://partners/App/<id>). Paginate with the last edge's cursor as 'after'.",
    inputSchema: z.object({
      appId: z.string().describe("App GID, e.g. gid://partners/App/1234567."),
      first: partnerFirstField,
      after: afterField,
      types: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by AppEventTypes enum values, e.g. [\"RELATIONSHIP_INSTALLED\", \"RELATIONSHIP_UNINSTALLED\"]."
        ),
      shopId: z
        .string()
        .optional()
        .describe("Filter to events from one shop (gid://partners/Shop/<id>)."),
      occurredAtMin: z
        .string()
        .optional()
        .describe("Only events at or after this ISO 8601 datetime."),
      occurredAtMax: z
        .string()
        .optional()
        .describe("Only events at or before this ISO 8601 datetime."),
      account: accountField,
    }),
    handler: async (args: {
      appId: string;
      first?: number;
      after?: string;
      types?: string[];
      shopId?: string;
      occurredAtMin?: string;
      occurredAtMax?: string;
      account?: string;
    }) => {
      return partnerGraphql(
        APP_EVENTS_QUERY,
        {
          id: args.appId,
          first: args.first ?? 20,
          after: args.after,
          types: args.types,
          shopId: args.shopId,
          occurredAtMin: args.occurredAtMin,
          occurredAtMax: args.occurredAtMax,
        },
        args.account
      );
    },
  },
];
