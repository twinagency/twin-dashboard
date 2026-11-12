// Shared by W4 lane lib-dashboard-data-plus2 tests: observe "resolved or rejected", and fail the harness loudly.
import { refuseFakeError } from "./postgrest-wire";

/** A broken precondition of the test itself: a plain Error, so it reads as "crashed", never as an ERR_ASSERTION red. */
export function harness(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`harness: ${msg}`);
}

/** Built-in errors a refusal is never written as; one escaping the code under test is a crash (a lib regression), not a refusal. */
const CRASH_ERRORS = [TypeError, ReferenceError, RangeError, SyntaxError];

/**
 * The value, or the rejection as an Error. Two rejections throw a plain harness Error instead, so they read as
 * "crashed", never as a red or as a correct refusal: one the wire fake caused (unmodelled request, closed wire), and a
 * TypeError/ReferenceError/RangeError/SyntaxError, unless `allow` names it because that error IS the finding (e.g. F6's
 * JSON.parse SyntaxError on a torn journal line). Pass a function to catch a synchronous throw too.
 */
export async function outcomeOf<T>(
  p: Promise<T> | (() => T | Promise<T>),
  opts: { allow?: readonly (typeof CRASH_ERRORS)[number][] } = {},
): Promise<T | Error> {
  let out: T | Error;
  try {
    out = await (typeof p === "function" ? p() : p);
  } catch (e) {
    out = e instanceof Error ? e : new Error(String(e));
  }
  if (out instanceof Error) {
    refuseFakeError(out);
    const crash = CRASH_ERRORS.find((C) => out instanceof C);
    if (crash && !opts.allow?.includes(crash)) throw new Error(`harness: the code under test crashed (${out.name}: ${out.message})`, { cause: out });
  }
  return out;
}
