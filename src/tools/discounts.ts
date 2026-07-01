import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_DISCOUNTS_QUERY = `
query ListDiscounts($first: Int!, $query: String, $after: String) {
  discountNodes(first: $first, query: $query, after: $after) {
    nodes {
      id
      discount {
        __typename
        ... on DiscountCodeBasic { title status summary startsAt endsAt usageLimit asyncUsageCount codes(first: 5) { nodes { code } } }
        ... on DiscountCodeBxgy { title status summary startsAt endsAt codes(first: 5) { nodes { code } } }
        ... on DiscountCodeFreeShipping { title status summary startsAt endsAt codes(first: 5) { nodes { code } } }
        ... on DiscountAutomaticBasic { title status summary startsAt endsAt }
        ... on DiscountAutomaticBxgy { title status summary startsAt endsAt }
        ... on DiscountAutomaticFreeShipping { title status summary startsAt endsAt }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CREATE_BASIC_CODE_MUTATION = `
mutation CreateBasicCode($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode {
      id
      codeDiscount { ... on DiscountCodeBasic { title status startsAt endsAt codes(first: 1) { nodes { code } } } }
    }
    userErrors { field message }
  }
}`;

const TOGGLE_MUTATIONS = {
  code_activate: `
mutation ActivateCode($id: ID!) {
  discountCodeActivate(id: $id) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`,
  code_deactivate: `
mutation DeactivateCode($id: ID!) {
  discountCodeDeactivate(id: $id) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`,
  automatic_activate: `
mutation ActivateAutomatic($id: ID!) {
  discountAutomaticActivate(id: $id) {
    automaticDiscountNode { id }
    userErrors { field message }
  }
}`,
  automatic_deactivate: `
mutation DeactivateAutomatic($id: ID!) {
  discountAutomaticDeactivate(id: $id) {
    automaticDiscountNode { id }
    userErrors { field message }
  }
}`,
} as const;

const DELETE_MUTATIONS = {
  code: `
mutation DeleteCode($id: ID!) {
  discountCodeDelete(id: $id) {
    deletedCodeDiscountId
    userErrors { field message }
  }
}`,
  automatic: `
mutation DeleteAutomatic($id: ID!) {
  discountAutomaticDelete(id: $id) {
    deletedAutomaticDiscountId
    userErrors { field message }
  }
}`,
} as const;

function isAutomaticDiscount(id: string, flag?: boolean): boolean {
  if (id.includes("DiscountAutomatic")) return true;
  if (id.includes("DiscountCode")) return false;
  return flag ?? false;
}

export const discountTools = [
  {
    name: "shopify_list_discounts",
    description:
      "List discounts (code and automatic; basic, buy-x-get-y, free shipping) with status, summary, dates, and codes. Supports Shopify search query syntax and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_DISCOUNTS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_create_discount_code",
    description:
      "Create a basic discount code (percentage or fixed amount off all items, all customers). For buy-x-get-y, free shipping, item/customer restrictions, or combinations, use shopify_admin_graphql.",
    inputSchema: z.object({
      title: z.string().describe("Internal discount title."),
      code: z.string().describe("The code customers enter, e.g. \"SUMMER20\"."),
      percentage: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Percent off (0-100). Provide either percentage or amountOff."),
      amountOff: z
        .string()
        .optional()
        .describe("Fixed amount off in shop currency, e.g. \"10.00\". Provide either percentage or amountOff."),
      startsAt: z
        .string()
        .optional()
        .describe("ISO 8601 start datetime (default: now)."),
      endsAt: z.string().optional().describe("ISO 8601 end datetime (default: no end)."),
      usageLimit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Total number of times the code can be used."),
      appliesOncePerCustomer: z
        .boolean()
        .optional()
        .describe("Limit to one use per customer."),
      account: accountField,
    }),
    handler: async (args: {
      title: string;
      code: string;
      percentage?: number;
      amountOff?: string;
      startsAt?: string;
      endsAt?: string;
      usageLimit?: number;
      appliesOncePerCustomer?: boolean;
      account?: string;
    }) => {
      if ((args.percentage === undefined) === (args.amountOff === undefined)) {
        throw new Error("Provide exactly one of percentage or amountOff");
      }
      const value =
        args.percentage !== undefined
          ? { percentage: args.percentage / 100 }
          : { discountAmount: { amount: args.amountOff, appliesOnEachItem: false } };
      const basicCodeDiscount: Record<string, unknown> = {
        title: args.title,
        code: args.code,
        startsAt: args.startsAt ?? new Date().toISOString(),
        customerSelection: { all: true },
        customerGets: { value, items: { all: true } },
      };
      if (args.endsAt) basicCodeDiscount.endsAt = args.endsAt;
      if (args.usageLimit !== undefined) basicCodeDiscount.usageLimit = args.usageLimit;
      if (args.appliesOncePerCustomer !== undefined) {
        basicCodeDiscount.appliesOncePerCustomer = args.appliesOncePerCustomer;
      }
      return adminGraphql(CREATE_BASIC_CODE_MUTATION, { basicCodeDiscount }, args.account);
    },
  },
  {
    name: "shopify_toggle_discount",
    description:
      "Activate or deactivate a discount. Kind (code vs automatic) is detected from the GID; pass automatic=true for bare numeric IDs of automatic discounts.",
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          "Discount node ID (gid://shopify/DiscountCodeNode/... or gid://shopify/DiscountAutomaticNode/...)."
        ),
      activate: z.boolean().describe("true to activate, false to deactivate."),
      automatic: z
        .boolean()
        .optional()
        .describe("Set true when passing a bare numeric ID of an automatic discount."),
      account: accountField,
    }),
    handler: async (args: {
      id: string;
      activate: boolean;
      automatic?: boolean;
      account?: string;
    }) => {
      const automatic = isAutomaticDiscount(args.id, args.automatic);
      const id = toGid(automatic ? "DiscountAutomaticNode" : "DiscountCodeNode", args.id);
      const key = `${automatic ? "automatic" : "code"}_${args.activate ? "activate" : "deactivate"}` as const;
      return adminGraphql(TOGGLE_MUTATIONS[key], { id }, args.account);
    },
  },
  {
    name: "shopify_delete_discount",
    description:
      "Delete a discount permanently. Kind (code vs automatic) is detected from the GID; pass automatic=true for bare numeric IDs of automatic discounts.",
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          "Discount node ID (gid://shopify/DiscountCodeNode/... or gid://shopify/DiscountAutomaticNode/...)."
        ),
      automatic: z
        .boolean()
        .optional()
        .describe("Set true when passing a bare numeric ID of an automatic discount."),
      account: accountField,
    }),
    handler: async (args: { id: string; automatic?: boolean; account?: string }) => {
      const automatic = isAutomaticDiscount(args.id, args.automatic);
      const id = toGid(automatic ? "DiscountAutomaticNode" : "DiscountCodeNode", args.id);
      return adminGraphql(DELETE_MUTATIONS[automatic ? "automatic" : "code"], { id }, args.account);
    },
  },
];
