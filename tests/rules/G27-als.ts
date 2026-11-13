// G27: promoted from tests/known-red/W5-app-clones-* (fix-sweep) as a regression guard.
// Next's request storages need globalThis.AsyncLocalStorage at module load; imported first by tests/rules/G27-harness.ts.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
// tsconfig "jsx": "preserve" makes tsx emit classic React.createElement for app .tsx files rendered here.
import * as React from "react";
(globalThis as any).React ??= React;
