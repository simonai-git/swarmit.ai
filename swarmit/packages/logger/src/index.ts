import pino from 'pino';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'apiKey',
  'claudeApiKey',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  'token',
];

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]',
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
  });
}

export const logger = createLogger('swarmit');

export type Logger = pino.Logger;
