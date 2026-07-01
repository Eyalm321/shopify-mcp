import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_COLLECTIONS_QUERY = `
query ListCollections($first: Int!, $query: String, $after: String) {
  collections(first: $first, query: $query, after: $after) {
    nodes { id title handle updatedAt productsCount { count } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const GET_COLLECTION_QUERY = `
query GetCollection($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    id title handle descriptionHtml updatedAt
    products(first: $first, after: $after) {
      nodes { id title handle status }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export const collectionTools = [
  {
    name: "shopify_list_collections",
    description:
      "List collections in a store (custom and smart). Supports Shopify search query syntax and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_COLLECTIONS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_get_collection",
    description:
      "Get a single collection with its products. Accepts a numeric ID or full GID. Product list is cursor-paginated via first/after.",
    inputSchema: z.object({
      id: z.string().describe("Collection ID (numeric or gid://shopify/Collection/...)."),
      first: firstField,
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { id: string; first?: number; after?: string; account?: string }) => {
      return adminGraphql(
        GET_COLLECTION_QUERY,
        { id: toGid("Collection", args.id), first: args.first ?? 20, after: args.after },
        args.account
      );
    },
  },
];
