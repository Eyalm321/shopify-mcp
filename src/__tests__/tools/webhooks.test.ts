import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { webhookTools } from "../../tools/webhooks.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = webhookTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("webhookTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 3 tools", () => {
    expect(webhookTools).toHaveLength(3);
  });

  describe("shopify_list_webhooks", () => {
    it("queries webhookSubscriptions with endpoint fragments", async () => {
      await tool("shopify_list_webhooks").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("webhookSubscriptions(first: $first");
      expect(query).toContain("... on WebhookHttpEndpoint");
      expect(variables).toEqual({ first: 20, after: undefined });
    });
  });

  describe("shopify_create_webhook", () => {
    it("defaults format to JSON and passes the topic enum via variables", async () => {
      await tool("shopify_create_webhook").handler({
        topic: "ORDERS_CREATE",
        callbackUrl: "https://example.com/hooks/orders",
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("webhookSubscriptionCreate(topic: $topic");
      expect(variables).toEqual({
        topic: "ORDERS_CREATE",
        webhookSubscription: {
          callbackUrl: "https://example.com/hooks/orders",
          format: "JSON",
        },
      });
    });

    it("includes filter and includeFields when given", async () => {
      await tool("shopify_create_webhook").handler({
        topic: "ORDERS_CREATE",
        callbackUrl: "https://example.com/h",
        includeFields: ["id", "total_price"],
        filter: "total_price:>=100.00",
      });
      const variables = mockAdmin.mock.calls[0][1] as {
        webhookSubscription: Record<string, unknown>;
      };
      expect(variables.webhookSubscription.includeFields).toEqual(["id", "total_price"]);
      expect(variables.webhookSubscription.filter).toBe("total_price:>=100.00");
    });
  });

  describe("shopify_delete_webhook", () => {
    it("expands numeric IDs to WebhookSubscription GIDs", async () => {
      await tool("shopify_delete_webhook").handler({ id: "5" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("webhookSubscriptionDelete(id: $id)");
      expect(variables).toEqual({ id: "gid://shopify/WebhookSubscription/5" });
    });
  });
});
