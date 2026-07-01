import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, toGid } from "./_shared.js";

const RUN_BULK_QUERY_MUTATION = `
mutation BulkQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

const BULK_FIELDS = `id status errorCode createdAt completedAt objectCount fileSize url partialDataUrl type query`;

const CURRENT_BULK_QUERY = `
query CurrentBulkOperation {
  currentBulkOperation { ${BULK_FIELDS} }
}`;

const BULK_BY_ID_QUERY = `
query BulkOperationById($id: ID!) {
  node(id: $id) {
    ... on BulkOperation { ${BULK_FIELDS} }
  }
}`;

const CANCEL_BULK_MUTATION = `
mutation BulkCancel($id: ID!) {
  bulkOperationCancel(id: $id) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

export const bulkTools = [
  {
    name: "shopify_run_bulk_query",
    description:
      "Start an asynchronous bulk query — Shopify runs the GraphQL query over the entire dataset (no pagination limits) and produces a JSONL file. Wrap the connection query in { ... } with no first/after args. Poll with shopify_get_bulk_operation; only one bulk query runs at a time per store.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "GraphQL query to run in bulk, e.g. \"{ products { edges { node { id title } } } }\"."
        ),
      account: accountField,
    }),
    handler: async (args: { query: string; account?: string }) => {
      return adminGraphql(RUN_BULK_QUERY_MUTATION, { query: args.query }, args.account);
    },
  },
  {
    name: "shopify_get_bulk_operation",
    description:
      "Get the status of a bulk operation — the current one (omit id) or a specific one by ID. When status is COMPLETED, 'url' is a signed JSONL download link (fetch it with any HTTP client).",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe(
          "Bulk operation ID (numeric or gid://shopify/BulkOperation/...). Omit for the current operation."
        ),
      account: accountField,
    }),
    handler: async (args: { id?: string; account?: string }) => {
      if (args.id) {
        return adminGraphql(
          BULK_BY_ID_QUERY,
          { id: toGid("BulkOperation", args.id) },
          args.account
        );
      }
      return adminGraphql(CURRENT_BULK_QUERY, undefined, args.account);
    },
  },
  {
    name: "shopify_cancel_bulk_operation",
    description: "Cancel a running bulk operation. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z
        .string()
        .describe("Bulk operation ID (numeric or gid://shopify/BulkOperation/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(
        CANCEL_BULK_MUTATION,
        { id: toGid("BulkOperation", args.id) },
        args.account
      );
    },
  },
];
