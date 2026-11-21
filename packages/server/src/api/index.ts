import express, { type Express } from 'express';
import { pathToFileURL } from 'node:url';

export const SERVICE_NAME = 'reinos-api';
export const SERVICE_VERSION = '0.0.0';
export const DEFAULT_API_PORT = 3001;

export function createApi(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, version: SERVICE_VERSION });
  });
  app.get('/api/v1/ping', (_req, res) => {
    res.json({ pong: true });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? DEFAULT_API_PORT);
  createApi().listen(port, () => {
    console.log(`${SERVICE_NAME} listening on :${port}`);
  });
}
