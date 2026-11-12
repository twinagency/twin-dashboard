// Next's request storages need globalThis.AsyncLocalStorage at module load; imported first by the W5 app-ai-plus3 harness.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
