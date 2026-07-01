import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_CUSTOMERS_QUERY = `
query ListCustomers($first: Int!, $query: String, $after: String) {
  customers(first: $first, query: $query, after: $after) {
    nodes {
      id displayName email phone numberOfOrders
      amountSpent { amount currencyCode }
      createdAt tags
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const GET_CUSTOMER_QUERY = `
query GetCustomer($id: ID!) {
  customer(id: $id) {
    id displayName firstName lastName email phone note tags numberOfOrders
    amountSpent { amount currencyCode }
    createdAt updatedAt
    defaultAddress { name address1 address2 city provinceCode zip countryCode phone }
    orders(first: 10) {
      nodes { id name createdAt displayFinancialStatus totalPriceSet { shopMoney { amount currencyCode } } }
    }
  }
}`;

const CREATE_CUSTOMER_MUTATION = `
mutation CreateCustomer($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id displayName email phone }
    userErrors { field message }
  }
}`;

const UPDATE_CUSTOMER_MUTATION = `
mutation UpdateCustomer($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer { id displayName email phone note tags }
    userErrors { field message }
  }
}`;

export const customerTools = [
  {
    name: "shopify_list_customers",
    description:
      "List customers in a store. Supports Shopify search query syntax (e.g. \"email:jane@example.com\", \"state:enabled\") and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_CUSTOMERS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_get_customer",
    description:
      "Get a single customer with contact info, default address, and recent orders. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Customer ID (numeric or gid://shopify/Customer/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(GET_CUSTOMER_QUERY, { id: toGid("Customer", args.id) }, args.account);
    },
  },
  {
    name: "shopify_create_customer",
    description: "Create a new customer. Returns the created customer and any userErrors.",
    inputSchema: z.object({
      email: z.string().optional().describe("Customer email."),
      firstName: z.string().optional().describe("First name."),
      lastName: z.string().optional().describe("Last name."),
      phone: z.string().optional().describe("Phone number (E.164, e.g. +15551234567)."),
      note: z.string().optional().describe("Internal note about the customer."),
      tags: z.array(z.string()).optional().describe("Tags to apply."),
      account: accountField,
    }),
    handler: async (args: {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      note?: string;
      tags?: string[];
      account?: string;
    }) => {
      const { account, ...input } = args;
      return adminGraphql(CREATE_CUSTOMER_MUTATION, { input }, account);
    },
  },
  {
    name: "shopify_update_customer",
    description:
      "Update fields on an existing customer (email, name, phone, note, tags). Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Customer ID (numeric or gid://shopify/Customer/...)."),
      email: z.string().optional().describe("New email."),
      firstName: z.string().optional().describe("New first name."),
      lastName: z.string().optional().describe("New last name."),
      phone: z.string().optional().describe("New phone number (E.164)."),
      note: z.string().optional().describe("New internal note."),
      tags: z.array(z.string()).optional().describe("Replacement tag list."),
      account: accountField,
    }),
    handler: async (args: {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      note?: string;
      tags?: string[];
      account?: string;
    }) => {
      const { account, id, ...rest } = args;
      const input = { id: toGid("Customer", id), ...rest };
      return adminGraphql(UPDATE_CUSTOMER_MUTATION, { input }, account);
    },
  },
];
