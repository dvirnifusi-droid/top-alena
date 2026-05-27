import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../middleware/auth.js';

export type FnCtx = {
  body: unknown;
  user: AuthUser | null;
  req: FastifyRequest;
};
export type FnHandler = (ctx: FnCtx) => Promise<unknown>;

// Each ported function will register itself here. Filled in by task #5.
export const functionHandlers: Record<string, FnHandler> = {};

// Functions safe to call without auth (e.g. customer-facing queue join).
export const publicFunctions = new Set<string>();

export function registerFn(name: string, handler: FnHandler, opts: { public?: boolean } = {}) {
  functionHandlers[name] = handler;
  if (opts.public) publicFunctions.add(name);
}
