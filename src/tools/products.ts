import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_PRODUCTS_QUERY = `
query ListProducts($first: Int!, $query: String, $after: String) {
  products(first: $first, query: $query, after: $after) {
    nodes {
      id title handle status vendor productType tags totalInventory createdAt updatedAt
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const GET_PRODUCT_QUERY = `
query GetProduct($id: ID!) {
  product(id: $id) {
    id title handle descriptionHtml status vendor productType tags totalInventory createdAt updatedAt
    options { name values }
    variants(first: 100) {
      nodes {
        id title sku price compareAtPrice inventoryQuantity
        selectedOptions { name value }
        inventoryItem { id }
      }
    }
    media(first: 10) {
      nodes { ... on MediaImage { id image { url altText } } }
    }
  }
}`;

const CREATE_PRODUCT_MUTATION = `
mutation CreateProduct($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id title handle status }
    userErrors { field message }
  }
}`;

const UPDATE_PRODUCT_MUTATION = `
mutation UpdateProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status vendor productType tags }
    userErrors { field message }
  }
}`;

const DELETE_PRODUCT_MUTATION = `
mutation DeleteProduct($input: ProductDeleteInput!) {
  productDelete(input: $input) {
    deletedProductId
    userErrors { field message }
  }
}`;

const UPDATE_VARIANTS_MUTATION = `
mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id title sku price compareAtPrice }
    userErrors { field message }
  }
}`;

const productStatusField = z
  .enum(["ACTIVE", "ARCHIVED", "DRAFT"])
  .optional()
  .describe("Product status.");

export const productTools = [
  {
    name: "shopify_list_products",
    description:
      "List products in a store. Supports Shopify search query syntax (e.g. \"status:active\", \"title:*shirt*\", \"vendor:Nike\") and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_PRODUCTS_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_get_product",
    description:
      "Get a single product with its options, variants (price, SKU, inventory), and images. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Product ID (numeric or gid://shopify/Product/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(GET_PRODUCT_QUERY, { id: toGid("Product", args.id) }, args.account);
    },
  },
  {
    name: "shopify_create_product",
    description:
      "Create a new product. Returns the created product and any userErrors. Variants/options beyond the default can be added afterwards via shopify_admin_graphql.",
    inputSchema: z.object({
      title: z.string().describe("Product title."),
      descriptionHtml: z.string().optional().describe("Product description (HTML allowed)."),
      vendor: z.string().optional().describe("Vendor name."),
      productType: z.string().optional().describe("Product type."),
      tags: z.array(z.string()).optional().describe("Tags to apply."),
      status: productStatusField,
      handle: z.string().optional().describe("URL handle (slug)."),
      account: accountField,
    }),
    handler: async (args: {
      title: string;
      descriptionHtml?: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
      handle?: string;
      account?: string;
    }) => {
      const { account, ...product } = args;
      return adminGraphql(CREATE_PRODUCT_MUTATION, { product }, account);
    },
  },
  {
    name: "shopify_update_product",
    description:
      "Update fields on an existing product (title, description, vendor, type, tags, status, handle). Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Product ID (numeric or gid://shopify/Product/...)."),
      title: z.string().optional().describe("New product title."),
      descriptionHtml: z.string().optional().describe("New description (HTML allowed)."),
      vendor: z.string().optional().describe("New vendor name."),
      productType: z.string().optional().describe("New product type."),
      tags: z.array(z.string()).optional().describe("Replacement tag list."),
      status: productStatusField,
      handle: z.string().optional().describe("New URL handle (slug)."),
      account: accountField,
    }),
    handler: async (args: {
      id: string;
      title?: string;
      descriptionHtml?: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
      handle?: string;
      account?: string;
    }) => {
      const { account, id, ...rest } = args;
      const product = { id: toGid("Product", id), ...rest };
      return adminGraphql(UPDATE_PRODUCT_MUTATION, { product }, account);
    },
  },
  {
    name: "shopify_delete_product",
    description: "Delete a product permanently. Accepts a numeric ID or full GID.",
    inputSchema: z.object({
      id: z.string().describe("Product ID (numeric or gid://shopify/Product/...)."),
      account: accountField,
    }),
    handler: async (args: { id: string; account?: string }) => {
      return adminGraphql(
        DELETE_PRODUCT_MUTATION,
        { input: { id: toGid("Product", args.id) } },
        args.account
      );
    },
  },
  {
    name: "shopify_update_variants",
    description:
      "Bulk-update variants of a product (price, compareAtPrice, barcode, inventoryPolicy, taxable). Accepts numeric IDs or full GIDs.",
    inputSchema: z.object({
      productId: z.string().describe("Product ID (numeric or gid://shopify/Product/...)."),
      variants: z
        .array(
          z.object({
            id: z.string().describe("Variant ID (numeric or gid://shopify/ProductVariant/...)."),
            price: z.string().optional().describe("New price, e.g. \"19.99\"."),
            compareAtPrice: z.string().optional().describe("Compare-at price, e.g. \"29.99\"."),
            barcode: z.string().optional().describe("Barcode value."),
            inventoryPolicy: z
              .enum(["DENY", "CONTINUE"])
              .optional()
              .describe("Whether to allow selling when out of stock."),
            taxable: z.boolean().optional().describe("Whether the variant is taxable."),
          })
        )
        .min(1)
        .describe("Variants to update."),
      account: accountField,
    }),
    handler: async (args: {
      productId: string;
      variants: Array<{
        id: string;
        price?: string;
        compareAtPrice?: string;
        barcode?: string;
        inventoryPolicy?: "DENY" | "CONTINUE";
        taxable?: boolean;
      }>;
      account?: string;
    }) => {
      const variants = args.variants.map((v) => ({
        ...v,
        id: toGid("ProductVariant", v.id),
      }));
      return adminGraphql(
        UPDATE_VARIANTS_MUTATION,
        { productId: toGid("Product", args.productId), variants },
        args.account
      );
    },
  },
];
