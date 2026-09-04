import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadProgress } from "@/components/MemoEditor/services/uploadService";
import { uploadProgressRatio, uploadService } from "@/components/MemoEditor/services/uploadService";
import type { LocalFile } from "@/components/MemoEditor/types/attachment";
import { withUploadProgress } from "@/lib/upload-progress";
import { FakeXHR } from "./helpers/fake-xhr";

const createAttachment = vi.fn();

vi.mock("@/connect", () => ({
  attachmentServiceClient: {
    createAttachment: (...args: unknown[]) => createAttachment(...args),
  },
}));

const localFile = (name: string, size: number): LocalFile =>
  ({ file: new File(["x".repeat(size)], name, { type: "image/png" }), previewUrl: `blob:${name}` }) as LocalFile;

/**
 * Stands in for the Connect transport: takes the headers uploadService attached and
 * pushes the request through the real progress-aware fetch, so the registry lookup
 * and the phase mapping are exercised together rather than stubbed apart.
 */
const respondWithProgress = (steps: [number, number][]) => {
  const fetchWithProgress = withUploadProgress(vi.fn() as unknown as typeof globalThis.fetch);
  return async (_request: unknown, options?: { headers?: Record<string, string> }) => {
    const pending = fetchWithProgress("https://example.test/rpc", {
      method: "POST",
      body: new Uint8Array([1]),
      headers: options?.headers,
    });
    const xhr = FakeXHR.instances.at(-1);
    for (const [loaded, total] of steps) {
      xhr?.upload.emit("progress", { lengthComputable: true, loaded, total });
    }
    xhr?.emit("load");
    await pending;
    return { name: "attachments/1" };
  };
};

describe("uploadService progress reporting", () => {
  beforeEach(() => {
    createAttachment.mockReset();
    vi.stubGlobal("XMLHttpRequest", FakeXHR.install());
  });

  it("announces each file before it starts and flips to processing once the bytes are out", async () => {
    createAttachment.mockImplementation(
      respondWithProgress([
        [4, 8],
        [8, 8],
      ]),
    );

    const seen: UploadProgress[] = [];
    await uploadService.uploadFiles([localFile("a.png", 8)], (progress) => seen.push({ ...progress }));

    expect(seen.map((p) => [p.phase, p.loaded, p.total, p.index, p.count, p.filename])).toEqual([
      ["uploading", 0, 8, 1, 1, "a.png"],
      ["uploading", 4, 8, 1, 1, "a.png"],
      ["processing", 8, 8, 1, 1, "a.png"],
    ]);
  });

  it("counts files in order across a batch", async () => {
    createAttachment.mockImplementation(respondWithProgress([]));

    const seen: UploadProgress[] = [];
    await uploadService.uploadFiles([localFile("a.png", 4), localFile("b.png", 4)], (progress) => seen.push({ ...progress }));

    expect(seen.map((p) => [p.index, p.count, p.filename])).toEqual([
      [1, 2, "a.png"],
      [2, 2, "b.png"],
    ]);
  });

  it("skips the progress plumbing entirely when no handler is passed", async () => {
    createAttachment.mockResolvedValue({ name: "attachments/1" });

    await uploadService.uploadFiles([localFile("a.png", 4)]);

    expect(createAttachment).toHaveBeenCalledTimes(1);
    expect(createAttachment.mock.calls[0][1]).toBeUndefined();
  });
});

describe("uploadProgressRatio", () => {
  const progress = (over: Partial<UploadProgress>): UploadProgress => ({
    phase: "uploading",
    loaded: 0,
    total: 100,
    index: 1,
    count: 1,
    filename: "a.png",
    ...over,
  });

  it("tracks the current file within a single-file batch", () => {
    expect(uploadProgressRatio(progress({ loaded: 25 }))).toBeCloseTo(0.25);
  });

  it("folds completed files into the batch ratio", () => {
    expect(uploadProgressRatio(progress({ index: 3, count: 4, loaded: 50 }))).toBeCloseTo(0.625);
  });

  it("never exceeds 1 and survives a zero-byte file", () => {
    expect(uploadProgressRatio(progress({ total: 0 }))).toBe(0);
    expect(uploadProgressRatio(progress({ index: 4, count: 4, loaded: 100 }))).toBe(1);
  });
});
