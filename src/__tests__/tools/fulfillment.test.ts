import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { fulfillmentTools } from "../../tools/fulfillment.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = fulfillmentTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("fulfillmentTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 3 tools", () => {
    expect(fulfillmentTools).toHaveLength(3);
  });

  describe("shopify_list_fulfillment_orders", () => {
    it("expands the order ID and defaults first to 10", async () => {
      await tool("shopify_list_fulfillment_orders").handler({ orderId: "555" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("fulfillmentOrders(first: $first)");
      expect(variables).toEqual({ orderId: "gid://shopify/Order/555", first: 10 });
    });
  });

  describe("shopify_create_fulfillment", () => {
    it("fulfills everything with notifyCustomer defaulting to false", async () => {
      await tool("shopify_create_fulfillment").handler({ fulfillmentOrderId: "10" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("fulfillmentCreate(fulfillment: $fulfillment");
      expect(variables).toEqual({
        fulfillment: {
          lineItemsByFulfillmentOrder: [
            { fulfillmentOrderId: "gid://shopify/FulfillmentOrder/10" },
          ],
          notifyCustomer: false,
        },
        message: undefined,
      });
    });

    it("includes partial line items and tracking info", async () => {
      await tool("shopify_create_fulfillment").handler({
        fulfillmentOrderId: "10",
        lineItems: [{ id: "3", quantity: 1 }],
        trackingNumber: "1Z999",
        trackingCompany: "UPS",
        notifyCustomer: true,
      });
      const variables = mockAdmin.mock.calls[0][1] as { fulfillment: Record<string, unknown> };
      expect(variables.fulfillment).toEqual({
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: "gid://shopify/FulfillmentOrder/10",
            fulfillmentOrderLineItems: [
              { id: "gid://shopify/FulfillmentOrderLineItem/3", quantity: 1 },
            ],
          },
        ],
        notifyCustomer: true,
        trackingInfo: { number: "1Z999", company: "UPS" },
      });
    });
  });

  describe("shopify_update_tracking", () => {
    it("expands the fulfillment ID and builds FulfillmentTrackingInput", async () => {
      await tool("shopify_update_tracking").handler({
        fulfillmentId: "77",
        trackingNumber: "1Z999",
        trackingUrl: "https://track.example.com/1Z999",
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId");
      expect(variables).toEqual({
        fulfillmentId: "gid://shopify/Fulfillment/77",
        trackingInfoInput: { number: "1Z999", url: "https://track.example.com/1Z999" },
        notifyCustomer: false,
      });
    });
  });
});
