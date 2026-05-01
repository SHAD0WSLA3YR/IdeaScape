import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIProxyHandler, NVIDIA_MODELS } from './aiProxy';

function createJsonRequest(body: unknown): IncomingMessage {
  const req = new PassThrough() as IncomingMessage;
  req.method = 'POST';
  queueMicrotask(() => {
    req.end(JSON.stringify(body));
  });
  return req;
}

function createJsonResponse() {
  let statusCode = 0;
  let raw = '';

  const res = {
    writeHead(status: number) {
      statusCode = status;
      return res;
    },
    write(chunk?: string) {
      raw += chunk ?? '';
      return true;
    },
    end(chunk?: string) {
      raw += chunk ?? '';
      return res;
    },
  } as unknown as ServerResponse;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    json() {
      return JSON.parse(raw);
    },
    jsonLines() {
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}

describe('aiProxy NVIDIA model selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes live-tested popular NVIDIA model IDs and excludes stale 404 IDs', () => {
    expect(NVIDIA_MODELS).toHaveProperty('openai/gpt-oss-120b');
    expect(NVIDIA_MODELS).toHaveProperty('z-ai/glm4.7');
    expect(NVIDIA_MODELS).not.toHaveProperty('z-ai/glm-4.7');
  });

  it('sends requested popular NVIDIA models without falling back to the default', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      expect(payload.model).toBe('z-ai/glm4.7');

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const handler = createAIProxyHandler({ NVIDIA_API_KEY: 'test-key' });
    const req = createJsonRequest({
      model: 'z-ai/glm4.7',
      messages: [{ role: 'user', content: 'Reply with ok.' }],
    });
    const response = createJsonResponse();

    await handler(req, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: 'z-ai/glm4.7',
      usedFallback: false,
    });
  });

  it('skips multi-model fallback when explicitly disabled for chat', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('upstream timeout', { status: 504 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'fallback worked' } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const handler = createAIProxyHandler({ NVIDIA_API_KEY: 'test-key' });
    const req = createJsonRequest({
      model: 'openai/gpt-oss-120b',
      allowFallback: false,
      messages: [{ role: 'user', content: 'Reply quickly.' }],
    });
    const response = createJsonResponse();

    await handler(req, response.res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toContain('NVIDIA provider failed');
  });

  it('streams incremental JSON lines when stream mode is enabled', async () => {
    const providerStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"hello "}}]}\n\ndata: {"choices":[{"delta":{"content":"world"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(providerStream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const handler = createAIProxyHandler({ NVIDIA_API_KEY: 'test-key' });
    const req = createJsonRequest({
      model: 'meta/llama-4-maverick-17b-128e-instruct',
      stream: true,
      allowFallback: false,
      messages: [{ role: 'user', content: 'Reply quickly.' }],
    });
    const response = createJsonResponse();

    await handler(req, response.res);

    expect(response.statusCode).toBe(200);
    const payload = response.jsonLines();
    expect(payload[0].delta).toBe('hello ');
    expect(payload[1].delta).toBe('world');
    expect(payload[payload.length - 1].done).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
