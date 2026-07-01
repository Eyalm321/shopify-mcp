import { describe, it, expect } from "vitest";
import { accountsTools } from "../tools/accounts.js";
import { shopTools } from "../tools/shop.js";
import { productTools } from "../tools/products.js";
import { orderTools } from "../tools/orders.js";
import { customerTools } from "../tools/customers.js";
import { inventoryTools } from "../tools/inventory.js";
import { collectionTools } from "../tools/collections.js";
import { metafieldTools } from "../tools/metafields.js";
import { draftOrderTools } from "../tools/draft_orders.js";
import { discountTools } from "../tools/discounts.js";
import { webhookTools } from "../tools/webhooks.js";
import { fulfillmentTools } from "../tools/fulfillment.js";
import { mediaTools } from "../tools/media.js";
import { bulkTools } from "../tools/bulk.js";
import { graphqlTools } from "../tools/graphql.js";
import { partnerTools } from "../tools/partner.js";

const allTools = [
  ...accountsTools,
  ...shopTools,
  ...productTools,
  ...orderTools,
  ...customerTools,
  ...inventoryTools,
  ...collectionTools,
  ...metafieldTools,
  ...draftOrderTools,
  ...discountTools,
  ...webhookTools,
  ...fulfillmentTools,
  ...mediaTools,
  ...bulkTools,
  ...graphqlTools,
  ...partnerTools,
];

describe("Tool Registration", () => {
  it("has no duplicate tool names across all modules", () => {
    const names = allTools.map((t) => t.name);
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it("all tools have required properties", () => {
    for (const tool of allTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("all tool names follow shopify_ naming convention", () => {
    for (const tool of allTools) {
      expect(tool.name).toMatch(/^shopify_/);
    }
  });

  it("registers the expected total number of tools (49)", () => {
    expect(allTools.length).toBe(49);
  });

  it("each module exports a non-empty array", () => {
    const modules = [
      accountsTools, shopTools, productTools, orderTools, customerTools,
      inventoryTools, collectionTools, metafieldTools, draftOrderTools,
      discountTools, webhookTools, fulfillmentTools, mediaTools, bulkTools,
      graphqlTools, partnerTools,
    ];
    for (const mod of modules) {
      expect(Array.isArray(mod)).toBe(true);
      expect(mod.length).toBeGreaterThan(0);
    }
  });
});
