import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerUploadProgress, UPLOAD_PROGRESS_HEADER, withUploadProgress } from "@/lib/upload-progress";
import { FakeXHR } from "./helpers/fake-xhr";

describe("withUploadProgress", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR.install());
  });

  it("passes untagged requests straight to the base fetch", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withUploadProgress(baseFetch as unknown as typeof globalThis.fetch);

    await wrapped("https://example.test/rpc", { method: "POST", body: new Uint8Array([1, 2]) });

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("reports progress and strips the tag header for a tagged request", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withUploadProgress(baseFetch as unknown as typeof globalThis.fetch);
    const seen: [number, number][] = [];
    const { id, dispose } = registerUploadProgress((loaded, total) => seen.push([loaded, total]));

    const pending = wrapped("https://example.test/rpc", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      headers: { [UPLOAD_PROGRESS_HEADER]: id, "content-type": "application/proto" },
    });

    expect(baseFetch).not.toHaveBeenCalled();
    const xhr = FakeXHR.instances[0];
    expect(xhr).toBeDefined();
    expect(xhr.requestHeaders["content-type"]).toBe("application/proto");
    expect(xhr.requestHeaders[UPLOAD_PROGRESS_HEADER]).toBeUndefined();

    xhr.upload.emit("progress", { lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.emit("progress", { lengthComputable: false, loaded: 75, total: 0 });
    xhr.upload.emit("progress", { lengthComputable: true, loaded: 100, total: 100 });
    xhr.emit("load");

    const response = await pending;
    expect(response.status).toBe(200);
    // The non-computable event carries no usable total, so it is dropped.
    expect(seen).toEqual([
      [50, 100],
      [100, 100],
    ]);

    dispose();
  });

  it("keeps reporting progress when a request is replayed after a token refresh", async () => {
    const wrapped = withUploadProgress(vi.fn() as unknown as typeof globalThis.fetch);
    const seen: number[] = [];
    const { id, dispose } = registerUploadProgress((loaded) => seen.push(loaded));
    const init = { method: "POST", body: new Uint8Array([1]), headers: { [UPLOAD_PROGRESS_HEADER]: id } };

    const first = wrapped("https://example.test/rpc", init);
    FakeXHR.instances[0].status = 401;
    FakeXHR.instances[0].emit("load");
    await first;

    const second = wrapped("https://example.test/rpc", init);
    FakeXHR.instances[1].upload.emit("progress", { lengthComputable: true, loaded: 42, total: 100 });
    FakeXHR.instances[1].emit("load");
    await second;

    expect(seen).toEqual([42]);
    dispose();
  });

  it("falls back to plain fetch once the listener is disposed", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withUploadProgress(baseFetch as unknown as typeof globalThis.fetch);
    const { id, dispose } = registerUploadProgress(() => {});
    dispose();

    await wrapped("https://example.test/rpc", {
      method: "POST",
      body: new Uint8Array([1]),
      headers: { [UPLOAD_PROGRESS_HEADER]: id },
    });

    expect(FakeXHR.instances).toHaveLength(0);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    const sentHeaders = new Headers((baseFetch.mock.calls[0][1] as RequestInit).headers);
    expect(sentHeaders.get(UPLOAD_PROGRESS_HEADER)).toBeNull();
  });

  it("strips the tag header even when the request has no body to measure", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withUploadProgress(baseFetch as unknown as typeof globalThis.fetch);
    const { id, dispose } = registerUploadProgress(() => {});

    await wrapped("https://example.test/rpc", { method: "POST", headers: { [UPLOAD_PROGRESS_HEADER]: id } });

    expect(FakeXHR.instances).toHaveLength(0);
    const sentHeaders = new Headers((baseFetch.mock.calls[0][1] as RequestInit).headers);
    expect(sentHeaders.get(UPLOAD_PROGRESS_HEADER)).toBeNull();
    dispose();
  });

  it("rejects with an AbortError when the request is aborted", async () => {
    const wrapped = withUploadProgress(vi.fn() as unknown as typeof globalThis.fetch);
    const { id, dispose } = registerUploadProgress(() => {});
    const controller = new AbortController();

    const pending = wrapped("https://example.test/rpc", {
      method: "POST",
      body: new Uint8Array([1]),
      headers: { [UPLOAD_PROGRESS_HEADER]: id },
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXHR.instances[0].aborted).toBe(true);
    dispose();
  });
});
