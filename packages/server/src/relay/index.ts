import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

export const SERVICE_NAME = 'reinos-relay';
export const SERVICE_VERSION = '0.0.0';
export const DEFAULT_RELAY_PORT = 3002;

export interface Relay {
  server: Server;
  wss: WebSocketServer;
}

export function createRelay(): Relay {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: SERVICE_NAME, version: SERVICE_VERSION }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'hello') {
        socket.send(JSON.stringify({ type: 'welcome' }));
      }
    });
  });
  return { server, wss };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? DEFAULT_RELAY_PORT);
  createRelay().server.listen(port, () => {
    console.log(`${SERVICE_NAME} listening on :${port}`);
  });
}
