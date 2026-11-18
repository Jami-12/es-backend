import type { TestContext } from "node:test";

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const headerRecord = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
};

export const jsonResponse = (
  body: unknown,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const rawResponse = (
  body: string,
  status = 200,
  contentType = "application/json",
): Response => {
  // The Fetch standard forbids a body on 204/205/304 responses.
  const bodyForbidden = status === 204 || status === 205 || status === 304;

  return new Response(bodyForbidden ? null : body, {
    status,
    headers: { "content-type": contentType },
  });
};

export const installFetchMock = (
  t: TestContext,
  handler: (
    request: RecordedRequest,
  ) => Response | Promise<Response>,
): RecordedRequest[] => {
  const requests: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const request: RecordedRequest = {
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: headerRecord(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    };

    requests.push(request);

    return handler(request);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return requests;
};
