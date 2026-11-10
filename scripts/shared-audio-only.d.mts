import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
export function sharedAudioOnly(): Plugin;
export function sharedAudioOnlyMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void): void;
