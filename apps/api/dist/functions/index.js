// Each ported function will register itself here. Filled in by task #5.
export const functionHandlers = {};
// Functions safe to call without auth (e.g. customer-facing queue join).
export const publicFunctions = new Set();
export function registerFn(name, handler, opts = {}) {
    functionHandlers[name] = handler;
    if (opts.public)
        publicFunctions.add(name);
}
//# sourceMappingURL=index.js.map