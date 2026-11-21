import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApi } from '../src/api/index.js';
import { createRelay } from '../src/relay/index.js';

describe('api', () => {
  it('GET /health', async () => {
    const res = await request(createApi()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'reinos-api' });
    expect(typeof res.body.version).toBe('string');
  });
  it('GET /api/v1/ping', async () => {
    const res = await request(createApi()).get('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });
});

describe('relay', () => {
  const relay = createRelay();
  const ready = new Promise<number>((resolve) => {
    relay.server.listen(0, () => resolve((relay.server.address() as AddressInfo).port));
  });
  afterAll(async () => {
    relay.wss.clients.forEach((c) => c.terminate());
    await new Promise((r) => relay.server.close(r));
  });

  it('GET /health', async () => {
    const port = await ready;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'reinos-relay' });
  });

  it('answers hello with welcome', async () => {
    const port = await ready;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const reply = await new Promise<string>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello' })));
      ws.on('message', (d) => resolve(d.toString()));
      ws.on('error', reject);
    });
    expect(JSON.parse(reply)).toEqual({ type: 'welcome' });
    ws.close();
  });
});
