/** Minimal XMLHttpRequest stand-in: records what was sent and lets a test drive the events. */
export class FakeXHR {
  static instances: FakeXHR[] = [];

  static install() {
    FakeXHR.instances = [];
    return FakeXHR;
  }

  method = "";
  url = "";
  responseType = "";
  withCredentials = false;
  requestHeaders: Record<string, string> = {};
  body: unknown;
  status = 200;
  statusText = "OK";
  response: unknown = new ArrayBuffer(0);
  aborted = false;

  private listeners = new Map<string, ((event: unknown) => void)[]>();

  readonly upload = {
    listeners: new Map<string, ((event: unknown) => void)[]>(),
    addEventListener(type: string, handler: (event: unknown) => void) {
      const existing = this.listeners.get(type) ?? [];
      existing.push(handler);
      this.listeners.set(type, existing);
    },
    emit(type: string, event: unknown) {
      for (const handler of this.listeners.get(type) ?? []) handler(event);
    },
  };

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  emit(type: string, event: unknown = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  getAllResponseHeaders() {
    return "content-type: application/proto\r\n";
  }

  abort() {
    this.aborted = true;
    this.emit("abort");
  }

  send(body: unknown) {
    this.body = body;
  }
}
