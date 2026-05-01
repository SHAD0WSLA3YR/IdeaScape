import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_NVIDIA_MODEL, NVIDIA_MODELS, aiService } from './aiService';

describe('aiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces server failures instead of returning mock AI content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing server', { status: 500 })));

    await expect(aiService.summarizeGroup([
      {
        id: 'node-1',
        title: 'Private journal note',
        content: 'This should never be replaced by fake AI output.',
        type: 'text',
      },
    ])).rejects.toThrow(/AI request failed/);
  });

  it('defaults to a live-tested popular NVIDIA model', () => {
    expect(DEFAULT_NVIDIA_MODEL).toBe('meta/llama-4-maverick-17b-128e-instruct');
    expect(NVIDIA_MODELS).toHaveProperty(DEFAULT_NVIDIA_MODEL);
    expect(NVIDIA_MODELS).not.toHaveProperty('z-ai/glm-4.7');
  });

  it('resets stale saved model selections to the default NVIDIA model', () => {
    aiService.setModel('z-ai/glm-4.7');

    expect(aiService.model).toBe(DEFAULT_NVIDIA_MODEL);
  });

  it('never includes model identity in chat system prompts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: 'okay response' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    aiService.setModel('openai/gpt-oss-120b');

    await aiService.chat('what model are you?');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content).not.toContain('openai/gpt-oss-120b');
    expect(body.messages[0].content.toLowerCase()).toContain('internal model names');
    expect(body.messages[0].content.toLowerCase()).toContain('confidential');
  });

  it('uses low-latency chat settings for natural conversation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: 'quick answer' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await aiService.chat('hello');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.maxTokens).toBe(600);
    expect(body.allowFallback).toBe(false);
  });

  it('streams partial chat responses and returns the final combined text', async () => {
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"delta":"hello "}\n'));
        controller.enqueue(new TextEncoder().encode('{"delta":"world"}\n'));
        controller.enqueue(new TextEncoder().encode('{"done":true}\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn(async () => new Response(streamBody, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    const finalText = await aiService.chatStream('hello', (chunk) => chunks.push(chunk));

    expect(chunks).toEqual(['hello ', 'world']);
    expect(finalText).toBe('hello world');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.stream).toBe(true);
    expect(body.maxTokens).toBe(600);
    expect(body.allowFallback).toBe(false);
  });

  it('sanitizes model disclosure in non-stream chat responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: 'I run on meta/llama-4-maverick-17b-128e-instruct for this app.' }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await aiService.chat('what model are you?');

    expect(result.toLowerCase()).not.toContain('llama');
    expect(result.toLowerCase()).not.toContain('model');
    expect(result).toContain('IdeaScape assistant');
  });
});
