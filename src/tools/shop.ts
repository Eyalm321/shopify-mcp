import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField } from "./_shared.js";

const GET_SHOP_QUERY = `
query GetShop {
  shop {
    id
    name
    email
    myshopifyDomain
    primaryDomain { url host }
    currencyCode
    ianaTimezone
    plan { displayName partnerDevelopment shopifyPlus }
    billingAddress { formatted }
  }
}`;

export const shopTools = [
  {
    name: "shopify_get_shop",
    description:
      "Get basic information about a store: name, domains, currency, timezone, and plan (including whether it is a partner development store).",
    inputSchema: z.object({
      account: accountField,
    }),
    handler: async (args: { account?: string }) => {
      return adminGraphql(GET_SHOP_QUERY, undefined, args.account);
    },
  },
];
