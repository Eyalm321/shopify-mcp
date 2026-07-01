import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_WEBHOOKS_QUERY = `
query ListWebhooks($first: Int!, $after: String) {
  webhookSubscriptions(first: $first, after: $after) {
    nodes {
      id topic format createdAt updatedAt
      apiVersion { handle }
      endpoint {
        __typename
        ... on WebhookHttpEndpoint { callbackUrl }
        ... on WebhookEventBridgeEndpoint { arn }
        ... on WebhookPubSubEndpoint { pubSubProject pubSubTopic }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CREATE_WEBHOOK_MUTATION = `
mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription {
      id topic format
      endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
    }
    userErrors { field message }
  }
}`;

const DELETE_WEBHOOK_MUTATION = `
mutation DeleteWebhook($id: ID!) {
  webhookSubscriptionDelete(id: $id) {
    deletedWebhookSubscriptionId
    userErrors { field message }
  }
}`;

export const webhookTools = [
  {
    name: "shopify_list_webhooks",
    description:
      "List webhook subscriptions with topic, endpoint (HTTP/EventBridge/PubSub), format, and API version.",
    inputSchema: z.object({
      first: firstField,
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_WEBHOOKS_QUERY,
        { first: args.first ?? 20, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_create_webhook",
    description:
      "Create an HTTP webhook subscription for a topic (e.g. ORDERS_CREATE, PRODUCTS_UPDATE, INVENTORY_LEVELS_UPDATE). Optional filter narrows which events fire; includeFields trims the payload.",
    inputSchema: z.object({
      topic: z
        .string()
        .describe("WebhookSubscriptionTopic enum value, e.g. \"ORDERS_CREATE\"."),
      callbackUrl: z.string().describe("HTTPS URL that will receive the webhook POSTs."),
      format: z
        .enum(["JSON", "XML"])
        .optional()
        .describe("Payload format (default JSON)."),
      includeFields: z
        .array(z.string())
        .optional()
        .describe("Only include these fields in the payload."),
      filter: z
        .string()
        .optional()
        .describe("Event filter expression, e.g. \"total_price:>=100.00\"."),
      account: accountField,
    }),
    handler: async (args: {
      topic: string;
      callbackUrl: string;
      format?: "JSON" | "XML";
      includeFields?: string[];
      filter?: string;
      account?: string;
    }) => {
      const webhookSubscription: Record<string, unknown> = {
        callbackUrl: args.callbackUrl,
        format: args.format ?? "JSON",
      };
      if (args.includeFields) webhookSubscription.includeFields = args.includeFields;
      if (args.filter) webhookSubscription.filter = args.filter;
      return adminGraphql(
        CREATE_WEBHOOK_MUTATION,
        { topic: args.topic, webhookSubscription },
        args.account
      );
    },
  },
  {
    name: "shopify_delete_webhook",
    description: "Delete a webhook subscription. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z
        .string()
        .describe("Webhook subscription ID (numeric or gid://shopify/WebhookSubscription/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(
        DELETE_WEBHOOK_MUTATION,
        { id: toGid("WebhookSubscription", args.id) },
        args.account
      );
    },
  },
];
