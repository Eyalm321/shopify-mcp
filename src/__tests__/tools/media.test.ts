import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { mediaTools } from "../../tools/media.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = mediaTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("mediaTools", () => {
  beforeEach(() => {
    mockAdmin.mockReset();
    mockAdmin.mockResolvedValue({});
  });

  it("exports 4 tools", () => {
    expect(mediaTools).toHaveLength(4);
  });

  describe("shopify_list_files", () => {
    it("queries files with type fragments", async () => {
      await tool("shopify_list_files").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("files(first: $first");
      expect(query).toContain("... on MediaImage");
      expect(variables).toEqual({ first: 20, query: undefined, after: undefined });
    });
  });

  describe("shopify_upload_file", () => {
    it("uses a remote URL directly as originalSource", async () => {
      await tool("shopify_upload_file").handler({
        source: "https://example.com/pic.png",
        alt: "A pic",
      });
      expect(mockAdmin).toHaveBeenCalledTimes(1);
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("fileCreate(files: $files)");
      expect(variables).toEqual({
        files: [{ originalSource: "https://example.com/pic.png", alt: "A pic" }],
      });
    });

    describe("local file staged upload", () => {
      let tmp: string;
      const mockFetch = vi.fn();

      beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), "shopify-mcp-media-"));
        vi.stubGlobal("fetch", mockFetch);
        mockFetch.mockReset();
      });

      afterEach(() => {
        vi.unstubAllGlobals();
        rmSync(tmp, { recursive: true, force: true });
      });

      it("stages the file, POSTs it, then creates the file from resourceUrl", async () => {
        const path = join(tmp, "photo.jpg");
        writeFileSync(path, Buffer.from("fake-jpeg-bytes"));

        mockAdmin
          .mockResolvedValueOnce({
            stagedUploadsCreate: {
              stagedTargets: [
                {
                  url: "https://storage.example.com/upload",
                  resourceUrl: "https://storage.example.com/final/photo.jpg",
                  parameters: [{ name: "key", value: "abc" }],
                },
              ],
              userErrors: [],
            },
          })
          .mockResolvedValueOnce({ fileCreate: { files: [], userErrors: [] } });
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("") });

        await tool("shopify_upload_file").handler({ source: path });

        // 1st admin call: stagedUploadsCreate with metadata
        const stagedVars = mockAdmin.mock.calls[0][1] as { input: Array<Record<string, unknown>> };
        expect(mockAdmin.mock.calls[0][0]).toContain("stagedUploadsCreate");
        expect(stagedVars.input[0]).toEqual({
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          resource: "IMAGE",
          fileSize: String(Buffer.from("fake-jpeg-bytes").byteLength),
          httpMethod: "POST",
        });

        // POST to the staged target with FormData
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0][0]).toBe("https://storage.example.com/upload");
        expect(mockFetch.mock.calls[0][1].method).toBe("POST");
        expect(mockFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);

        // 2nd admin call: fileCreate with the resourceUrl
        const fileVars = mockAdmin.mock.calls[1][1] as { files: Array<Record<string, unknown>> };
        expect(mockAdmin.mock.calls[1][0]).toContain("fileCreate");
        expect(fileVars.files[0].originalSource).toBe(
          "https://storage.example.com/final/photo.jpg"
        );
      });

      it("throws when the staged POST fails", async () => {
        const path = join(tmp, "photo.jpg");
        writeFileSync(path, "x");
        mockAdmin.mockResolvedValueOnce({
          stagedUploadsCreate: {
            stagedTargets: [
              { url: "https://storage.example.com/upload", resourceUrl: "r", parameters: [] },
            ],
            userErrors: [],
          },
        });
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve("denied"),
        });

        await expect(tool("shopify_upload_file").handler({ source: path })).rejects.toThrow(
          /Staged upload POST failed with HTTP 403/
        );
      });

      it("throws on stagedUploadsCreate userErrors", async () => {
        const path = join(tmp, "photo.jpg");
        writeFileSync(path, "x");
        mockAdmin.mockResolvedValueOnce({
          stagedUploadsCreate: {
            stagedTargets: [],
            userErrors: [{ field: null, message: "file too large" }],
          },
        });

        await expect(tool("shopify_upload_file").handler({ source: path })).rejects.toThrow(
          /stagedUploadsCreate failed: file too large/
        );
      });
    });
  });

  describe("shopify_attach_product_media", () => {
    it("attaches remote URLs with default IMAGE content type", async () => {
      await tool("shopify_attach_product_media").handler({
        productId: "42",
        media: [{ source: "https://example.com/pic.png", alt: "front" }],
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("productCreateMedia(productId: $productId");
      expect(variables).toEqual({
        productId: "gid://shopify/Product/42",
        media: [
          {
            originalSource: "https://example.com/pic.png",
            alt: "front",
            mediaContentType: "IMAGE",
          },
        ],
      });
    });
  });

  describe("shopify_delete_files", () => {
    it("expands bare numeric IDs as MediaImage and passes GIDs through", async () => {
      await tool("shopify_delete_files").handler({
        fileIds: ["5", "gid://shopify/GenericFile/6"],
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("fileDelete(fileIds: $fileIds)");
      expect(variables).toEqual({
        fileIds: ["gid://shopify/MediaImage/5", "gid://shopify/GenericFile/6"],
      });
    });
  });
});
