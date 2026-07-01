import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { adminGraphql } from "../client.js";
import { accountField, firstField, afterField, toGid } from "./_shared.js";

const LIST_FILES_QUERY = `
query ListFiles($first: Int!, $query: String, $after: String) {
  files(first: $first, query: $query, after: $after) {
    nodes {
      id fileStatus alt createdAt
      ... on MediaImage { mimeType image { url width height } }
      ... on GenericFile { mimeType url originalFileSize }
      ... on Video { filename duration }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const STAGED_UPLOADS_MUTATION = `
mutation StagedUploads($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;

const FILE_CREATE_MUTATION = `
mutation FileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id fileStatus alt
      ... on MediaImage { image { url } }
      ... on GenericFile { url }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_CREATE_MEDIA_MUTATION = `
mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media {
      mediaContentType status
      preview { image { url } }
      ... on MediaImage { id }
      ... on Video { id }
    }
    mediaUserErrors { field message }
  }
}`;

const DELETE_FILES_MUTATION = `
mutation FileDelete($fileIds: [ID!]!) {
  fileDelete(fileIds: $fileIds) {
    deletedFileIds
    userErrors { field message }
  }
}`;

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  zip: "application/zip",
  glb: "model/gltf-binary",
};

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function uploadResource(mimeType: string): "IMAGE" | "VIDEO" | "FILE" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "FILE";
}

interface StagedUploadsResult {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

/**
 * Upload a local file via Shopify's staged-upload flow and return the
 * resourceUrl to use as an originalSource.
 */
async function stageLocalFile(path: string, account?: string): Promise<string> {
  const buf = readFileSync(path);
  const filename = basename(path);
  const mimeType = guessMimeType(filename);

  const staged = await adminGraphql<StagedUploadsResult>(
    STAGED_UPLOADS_MUTATION,
    {
      input: [
        {
          filename,
          mimeType,
          resource: uploadResource(mimeType),
          fileSize: String(buf.byteLength),
          httpMethod: "POST",
        },
      ],
    },
    account
  );

  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length > 0) {
    throw new Error(`stagedUploadsCreate failed: ${errors.map((e) => e.message).join("; ")}`);
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("stagedUploadsCreate returned no staged target");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType }), filename);

  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(`Staged upload POST failed with HTTP ${res.status}: ${detail}`);
  }
  return target.resourceUrl;
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

export const mediaTools = [
  {
    name: "shopify_list_files",
    description:
      "List files in the store's content library (images, videos, generic files) with URLs and status. Supports Shopify search query syntax and cursor pagination.",
    inputSchema: z.object({
      first: firstField,
      query: z.string().optional().describe("Shopify search query filter, e.g. \"media_type:IMAGE\"."),
      after: afterField,
      account: accountField,
    }),
    handler: async (args: { first?: number; query?: string; after?: string; account?: string }) => {
      return adminGraphql(
        LIST_FILES_QUERY,
        { first: args.first ?? 20, query: args.query, after: args.after },
        args.account
      );
    },
  },
  {
    name: "shopify_upload_file",
    description:
      "Upload a file to the store's content library from a local path or a public URL. Local files go through Shopify's staged-upload flow automatically. Returns the created file (processing may take a moment before URLs appear).",
    inputSchema: z.object({
      source: z
        .string()
        .describe("Local filesystem path or public http(s) URL of the file to upload."),
      alt: z.string().optional().describe("Alt text."),
      filename: z
        .string()
        .optional()
        .describe("Override the filename (defaults to the source's basename)."),
      account: accountField,
    }),
    handler: async (args: {
      source: string;
      alt?: string;
      filename?: string;
      account?: string;
    }) => {
      const originalSource = isRemoteUrl(args.source)
        ? args.source
        : await stageLocalFile(args.source, args.account);
      const file: Record<string, unknown> = { originalSource };
      if (args.alt) file.alt = args.alt;
      if (args.filename) file.filename = args.filename;
      return adminGraphql(FILE_CREATE_MUTATION, { files: [file] }, args.account);
    },
  },
  {
    name: "shopify_attach_product_media",
    description:
      "Attach media (images/videos) to a product from public URLs or local file paths. Local files are staged-uploaded automatically. Accepts a numeric product ID or full GID.",
    inputSchema: z.object({
      productId: z.string().describe("Product ID (numeric or gid://shopify/Product/...)."),
      media: z
        .array(
          z.object({
            source: z
              .string()
              .describe("Local filesystem path or public http(s) URL of the image/video."),
            alt: z.string().optional().describe("Alt text."),
            mediaContentType: z
              .enum(["IMAGE", "VIDEO", "EXTERNAL_VIDEO", "MODEL_3D"])
              .optional()
              .describe("Media type (default IMAGE)."),
          })
        )
        .min(1)
        .describe("Media items to attach."),
      account: accountField,
    }),
    handler: async (args: {
      productId: string;
      media: Array<{
        source: string;
        alt?: string;
        mediaContentType?: "IMAGE" | "VIDEO" | "EXTERNAL_VIDEO" | "MODEL_3D";
      }>;
      account?: string;
    }) => {
      const media = [];
      for (const m of args.media) {
        const originalSource = isRemoteUrl(m.source)
          ? m.source
          : await stageLocalFile(m.source, args.account);
        media.push({
          originalSource,
          alt: m.alt,
          mediaContentType: m.mediaContentType ?? "IMAGE",
        });
      }
      return adminGraphql(
        PRODUCT_CREATE_MEDIA_MUTATION,
        { productId: toGid("Product", args.productId), media },
        args.account
      );
    },
  },
  {
    name: "shopify_delete_files",
    description:
      "Delete files from the store's content library. Accepts numeric IDs or full GIDs (gid://shopify/MediaImage/..., gid://shopify/GenericFile/..., gid://shopify/Video/...). Bare numeric IDs are assumed to be MediaImage.",
    inputSchema: z.object({
      fileIds: z.array(z.string()).min(1).describe("File IDs to delete."),
      account: accountField,
    }),
    handler: async (args: { fileIds: string[]; account?: string }) => {
      const fileIds = args.fileIds.map((id) => toGid("MediaImage", id));
      return adminGraphql(DELETE_FILES_MUTATION, { fileIds }, args.account);
    },
  },
];
