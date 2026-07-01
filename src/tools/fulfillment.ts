import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, toGid } from "./_shared.js";

const FULFILLMENT_ORDERS_QUERY = `
query FulfillmentOrders($orderId: ID!, $first: Int!) {
  order(id: $orderId) {
    id name
    fulfillmentOrders(first: $first) {
      nodes {
        id status requestStatus
        assignedLocation { name location { id } }
        destination { name address1 city zip countryCode }
        lineItems(first: 50) {
          nodes { id remainingQuantity totalQuantity lineItem { title sku } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const CREATE_FULFILLMENT_MUTATION = `
mutation CreateFulfillment($fulfillment: FulfillmentInput!, $message: String) {
  fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
    fulfillment { id status trackingInfo { number url company } }
    userErrors { field message }
  }
}`;

const UPDATE_TRACKING_MUTATION = `
mutation UpdateTracking($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
  fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) {
    fulfillment { id status trackingInfo { number url company } }
    userErrors { field message }
  }
}`;

export const fulfillmentTools = [
  {
    name: "shopify_list_fulfillment_orders",
    description:
      "List the fulfillment orders of an order — the fulfillable units per location, with their line items and remaining quantities. Needed before creating a fulfillment. Accepts a numeric order ID or full GID.",
    inputSchema: z.object({
      orderId: z.string().describe("Order ID (numeric or gid://shopify/Order/...)."),
      first: firstField,
      account: accountField,
    }),
    handler: async (args: { orderId: string; first?: number; account?: string }) => {
      return adminGraphql(
        FULFILLMENT_ORDERS_QUERY,
        { orderId: toGid("Order", args.orderId), first: args.first ?? 10 },
        args.account
      );
    },
  },
  {
    name: "shopify_create_fulfillment",
    description:
      "Fulfill a fulfillment order (fully, or partially via lineItems), optionally with tracking info. notifyCustomer defaults to false — set true to email the customer a shipping confirmation.",
    inputSchema: z.object({
      fulfillmentOrderId: z
        .string()
        .describe("Fulfillment order ID (numeric or gid://shopify/FulfillmentOrder/...)."),
      lineItems: z
        .array(
          z.object({
            id: z
              .string()
              .describe(
                "Fulfillment order line item ID (numeric or gid://shopify/FulfillmentOrderLineItem/...)."
              ),
            quantity: z.number().int().min(1).describe("Quantity to fulfill."),
          })
        )
        .optional()
        .describe("Specific line items to fulfill. Omit to fulfill everything remaining."),
      trackingNumber: z.string().optional().describe("Tracking number."),
      trackingUrl: z.string().optional().describe("Tracking URL."),
      trackingCompany: z.string().optional().describe("Carrier name, e.g. \"UPS\"."),
      notifyCustomer: z
        .boolean()
        .optional()
        .describe("Email the customer a shipping confirmation (default false)."),
      message: z.string().optional().describe("Optional message for the fulfillment."),
      account: accountField,
    }),
    handler: async (args: {
      fulfillmentOrderId: string;
      lineItems?: Array<{ id: string; quantity: number }>;
      trackingNumber?: string;
      trackingUrl?: string;
      trackingCompany?: string;
      notifyCustomer?: boolean;
      message?: string;
      account?: string;
    }) => {
      const byFulfillmentOrder: Record<string, unknown> = {
        fulfillmentOrderId: toGid("FulfillmentOrder", args.fulfillmentOrderId),
      };
      if (args.lineItems) {
        byFulfillmentOrder.fulfillmentOrderLineItems = args.lineItems.map((li) => ({
          id: toGid("FulfillmentOrderLineItem", li.id),
          quantity: li.quantity,
        }));
      }
      const fulfillment: Record<string, unknown> = {
        lineItemsByFulfillmentOrder: [byFulfillmentOrder],
        notifyCustomer: args.notifyCustomer ?? false,
      };
      const trackingInfo: Record<string, string> = {};
      if (args.trackingNumber) trackingInfo.number = args.trackingNumber;
      if (args.trackingUrl) trackingInfo.url = args.trackingUrl;
      if (args.trackingCompany) trackingInfo.company = args.trackingCompany;
      if (Object.keys(trackingInfo).length > 0) fulfillment.trackingInfo = trackingInfo;
      return adminGraphql(
        CREATE_FULFILLMENT_MUTATION,
        { fulfillment, message: args.message },
        args.account
      );
    },
  },
  {
    name: "shopify_update_tracking",
    description:
      "Update tracking info on an existing fulfillment. notifyCustomer defaults to false — set true to email the customer.",
    inputSchema: z.object({
      fulfillmentId: z
        .string()
        .describe("Fulfillment ID (numeric or gid://shopify/Fulfillment/...)."),
      trackingNumber: z.string().optional().describe("Tracking number."),
      trackingUrl: z.string().optional().describe("Tracking URL."),
      trackingCompany: z.string().optional().describe("Carrier name, e.g. \"UPS\"."),
      notifyCustomer: z
        .boolean()
        .optional()
        .describe("Email the customer the updated tracking (default false)."),
      account: accountField,
    }),
    handler: async (args: {
      fulfillmentId: string;
      trackingNumber?: string;
      trackingUrl?: string;
      trackingCompany?: string;
      notifyCustomer?: boolean;
      account?: string;
    }) => {
      const trackingInfoInput: Record<string, string> = {};
      if (args.trackingNumber) trackingInfoInput.number = args.trackingNumber;
      if (args.trackingUrl) trackingInfoInput.url = args.trackingUrl;
      if (args.trackingCompany) trackingInfoInput.company = args.trackingCompany;
      return adminGraphql(
        UPDATE_TRACKING_MUTATION,
        {
          fulfillmentId: toGid("Fulfillment", args.fulfillmentId),
          trackingInfoInput,
          notifyCustomer: args.notifyCustomer ?? false,
        },
        args.account
      );
    },
  },
];
