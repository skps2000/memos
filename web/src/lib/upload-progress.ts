/**
 * Upload progress for Connect calls.
 *
 * `fetch` cannot report how much of a request body has been sent, so a call that
 * wants a progress gauge registers a listener here and tags its request with
 * {@link UPLOAD_PROGRESS_HEADER}. The transport's fetch (see `withUploadProgress`)
 * spots the tag, strips it, and sends that one request over XMLHttpRequest, which
 * does emit `upload.progress` events. Every other request keeps using plain fetch.
 */

export const UPLOAD_PROGRESS_HEADER = "x-memos-upload-progress";

export type UploadProgressListener = (loaded: number, total: number) => void;

const listeners = new Map<string, UploadProgressListener>();

let nextID = 0;

/**
 * Registers a listener and returns the id to tag the request with. Callers must
 * call the returned disposer once the call settles, otherwise the listener leaks.
 */
export const registerUploadProgress = (listener: UploadProgressListener): { id: string; dispose: () => void } => {
  const id = `upload-${++nextID}`;
  listeners.set(id, listener);
  return { id, dispose: () => listeners.delete(id) };
};

/**
 * Kept registered rather than consumed: the auth interceptor may replay a request
 * after refreshing the token, and the replay should report progress too.
 */
const getUploadProgressListener = (id: string): UploadProgressListener | undefined => listeners.get(id);

const parseResponseHeaders = (raw: string): Headers => {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    try {
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    } catch {
      // Forbidden or malformed response headers are not worth failing the call over.
    }
  }
  return headers;
};

const sendWithXHR = (url: string, init: RequestInit, headers: Headers, listener: UploadProgressListener): Promise<Response> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? "POST", url, true);
    xhr.responseType = "arraybuffer";
    xhr.withCredentials = init.credentials !== "omit";
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) listener(event.loaded, event.total);
    });

    xhr.addEventListener("load", () => {
      // 204/205 must have a null body or the Response constructor throws.
      const body = xhr.status === 204 || xhr.status === 205 ? null : xhr.response;
      resolve(
        new Response(body, { status: xhr.status, statusText: xhr.statusText, headers: parseResponseHeaders(xhr.getAllResponseHeaders()) }),
      );
    });
    xhr.addEventListener("error", () => reject(new TypeError("Network request failed")));
    xhr.addEventListener("timeout", () => reject(new TypeError("Network request timed out")));
    xhr.addEventListener("abort", () => reject(new DOMException("The user aborted a request.", "AbortError")));

    const signal = init.signal;
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(init.body as XMLHttpRequestBodyInit);
  });

/**
 * Wraps a fetch so requests tagged with {@link UPLOAD_PROGRESS_HEADER} go over XHR
 * and report upload progress. Untagged requests pass straight through.
 */
export const withUploadProgress =
  (baseFetch: typeof globalThis.fetch): typeof globalThis.fetch =>
  (input, init) => {
    const headers = new Headers(init?.headers);
    const progressID = headers.get(UPLOAD_PROGRESS_HEADER);
    if (!progressID) {
      return baseFetch(input, init);
    }

    // The tag is a client-side marker; it must never reach the server, on any path out of here.
    headers.delete(UPLOAD_PROGRESS_HEADER);
    const listener = getUploadProgressListener(progressID);
    if (!listener || !init?.body) {
      return baseFetch(input, { ...init, headers });
    }

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return sendWithXHR(url, init, headers, listener);
  };
