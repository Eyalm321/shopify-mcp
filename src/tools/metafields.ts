import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField } from "./_shared.js";

const GET_METAFIELDS_QUERY = `
query GetMetafields($ownerId: ID!, $first: Int!, $after: String, $namespace: String) {
  node(id: $ownerId) {
    id
    ... on HasMetafields {
      metafields(first: $first, after: $after, namespace: $namespace) {
        nodes { id namespace key value type updatedAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const SET_METAFIELDS_MUTATION = `
mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value type }
    userErrors { field message }
  }
}`;

const DELETE_METAFIELDS_MUTATION = `
mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields { ownerId namespace key }
    userErrors { field message }
  }
}`;

export const metafieldTools = [
  {
    name: "shopify_get_metafields",
    description:
      "List metafields on any resource that supports them (Product, ProductVariant, Customer, Order, Collection, Shop, ...). Requires the owner's full GID, e.g. gid://shopify/Product/123.",
    inputSchema: z.object({
      ownerId: z
        .string()
        .describe("Full GID of the owner resource, e.g. gid://shopify/Product/123."),
      namespace: z.string().optional().describe("Filter to one metafield namespace."),
      first: firstField,
      after: afterField,
      account: accountField,
    }),
    handler: async (args: {
      ownerId: string;
      namespace?: string;
      first?: number;
      after?: string;
      account?: string;
    }) => {
      return adminGraphql(
        GET_METAFIELDS_QUERY,
        {
          ownerId: args.ownerId,
          first: args.first ?? 20,
          after: args.after,
          namespace: args.namespace,
        },
        args.account
      );
    },
  },
  {
    name: "shopify_set_metafields",
    description:
      "Create or update metafields on one or more resources (upsert by owner+namespace+key). Each entry needs the owner's full GID, namespace, key, value, and type (e.g. single_line_text_field, number_integer, json, boolean).",
    inputSchema: z.object({
      metafields: z
        .array(
          z.object({
            ownerId: z
              .string()
              .describe("Full GID of the owner resource, e.g. gid://shopify/Product/123."),
            namespace: z.string().describe("Metafield namespace, e.g. \"custom\"."),
            key: z.string().describe("Metafield key."),
            value: z
              .string()
              .describe("Metafield value as a string (JSON-encoded for list/json types)."),
            type: z
              .string()
              .describe(
                "Metafield type, e.g. single_line_text_field, multi_line_text_field, number_integer, number_decimal, boolean, json, date, url."
              ),
          })
        )
        .min(1)
        .describe("Metafields to set."),
      account: accountField,
    }),
    handler: async (args: {
      metafields: Array<{
        ownerId: string;
        namespace: string;
        key: string;
        value: string;
        type: string;
      }>;
      account?: string;
    }) => {
      return adminGraphql(SET_METAFIELDS_MUTATION, { metafields: args.metafields }, args.account);
    },
  },
  {
    name: "shopify_delete_metafields",
    description:
      "Delete metafields identified by owner GID + namespace + key.",
    inputSchema: z.object({
      metafields: z
        .array(
          z.object({
            ownerId: z
              .string()
              .describe("Full GID of the owner resource, e.g. gid://shopify/Product/123."),
            namespace: z.string().describe("Metafield namespace."),
            key: z.string().describe("Metafield key."),
          })
        )
        .min(1)
        .describe("Metafields to delete."),
      account: accountField,
    }),
    handler: async (args: {
      metafields: Array<{ ownerId: string; namespace: string; key: string }>;
      account?: string;
    }) => {
      return adminGraphql(
        DELETE_METAFIELDS_MUTATION,
        { metafields: args.metafields },
        args.account
      );
    },
  },
];
