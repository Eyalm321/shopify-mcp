import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_LOCATIONS_QUERY = `
query ListLocations($first: Int!) {
  locations(first: $first) {
    nodes { id name isActive fulfillsOnlineOrders address { formatted } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const INVENTORY_LEVELS_QUERY = `
query InventoryLevels($locationId: ID!, $first: Int!, $after: String) {
  location(id: $locationId) {
    id name
    inventoryLevels(first: $first, after: $after) {
      nodes {
        id
        quantities(names: ["available", "on_hand", "committed"]) { name quantity }
        item {
          id sku
          variant { id displayName product { id title } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const ADJUST_INVENTORY_MUTATION = `
mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt reason
      changes { name delta quantityAfterChange item { id sku } }
    }
    userErrors { field message }
  }
}`;

export const inventoryTools = [
  {
    name: "shopify_list_locations",
    description: "List inventory locations in a store.",
    inputSchema: z.object({
      first: firstField,
      account: accountField,
    }),
    handler: async (args: { first?: number; account?: string }) => {
      return adminGraphql(LIST_LOCATIONS_QUERY, { first: args.first ?? 20 }, args.account);
    },
  },
  {
    name: "shopify_get_inventory_levels",
    description:
      "Get inventory levels (available, on-hand, committed) at a location, including the SKU/variant/product of each item. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      locationId: z.string().describe("Location ID (numeric or gid://shopify/Location/...)."),
      first: firstField,
      after: afterField,
      account: accountField,
    }),
    handler: async (args: {
      locationId: string;
      first?: number;
      after?: string;
      account?: string;
    }) => {
      return adminGraphql(
        INVENTORY_LEVELS_QUERY,
        {
          locationId: toGid("Location", args.locationId),
          first: args.first ?? 20,
          after: args.after,
        },
        args.account
      );
    },
  },
  {
    name: "shopify_adjust_inventory",
    description:
      "Adjust available inventory quantities by a delta at a location for one or more inventory items. Accepts numeric IDs or full GIDs.",
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe(
          "Reason for the adjustment (default \"correction\"; e.g. \"received\", \"damaged\", \"restock\")."
        ),
      changes: z
        .array(
          z.object({
            inventoryItemId: z
              .string()
              .describe("Inventory item ID (numeric or gid://shopify/InventoryItem/...)."),
            locationId: z
              .string()
              .describe("Location ID (numeric or gid://shopify/Location/...)."),
            delta: z.number().int().describe("Quantity change, positive or negative."),
          })
        )
        .min(1)
        .describe("Adjustments to apply."),
      account: accountField,
    }),
    handler: async (args: {
      reason?: string;
      changes: Array<{ inventoryItemId: string; locationId: string; delta: number }>;
      account?: string;
    }) => {
      const input = {
        reason: args.reason ?? "correction",
        name: "available",
        changes: args.changes.map((c) => ({
          inventoryItemId: toGid("InventoryItem", c.inventoryItemId),
          locationId: toGid("Location", c.locationId),
          delta: c.delta,
        })),
      };
      return adminGraphql(ADJUST_INVENTORY_MUTATION, { input }, args.account);
    },
  },
];
