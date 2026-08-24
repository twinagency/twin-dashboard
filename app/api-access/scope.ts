// The sentinel the Model select submits for "every model".
//
// It lives in its own file for a boring but hard reason: actions.ts carries
// "use server", and a "use server" module may only export async functions, so a
// plain constant cannot live there. It cannot live in lib/api-keys-admin.ts
// either — that imports supabaseAdmin, and importing it from the client
// component would pull the service key's module into the browser bundle.
//
// A SENTINEL RATHER THAN AN EMPTY STRING. An empty string is also what a broken
// form, a cleared field or a missing input produces. "The field was empty" must
// never be the thing that mints a key reading all ten girls, so the fleet case
// has to be something a caller can only send on purpose.
export const FLEET_OPTION = "__fleet__";
