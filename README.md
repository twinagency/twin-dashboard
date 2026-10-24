<p align="center"><img src="archive/twin-logo.png" alt="Twin." width="260"></p>

# twin-dashboard

Next.js operator dashboard for the Twin fleet of AI companion clones. Reads and writes the same Supabase project as [twin-bot](https://github.com/ronan-com/twin-bot): the two repos are halves of one system.

## Run

```
npm install
npm run dev          # http://localhost:3001 (pass -- -p 3002 if the port is taken)
npm test             # chains the test:* scripts
npm run test:api     # admin API suite
```

The test scripts run through `tsx` from the dev dependencies. Needs a `.env`; never commit it.

## What is in it

- Clone config, persona and pricing editors (a clone is a database row).
- Revenue, fans, chats and system logs views.
- MTProto re-engagement campaigns and media/catalogue management.
- Creator and agency portals.
- **Admin API** (`app/api/admin/v1/*`): read-only, bearer key plus loopback/Tailscale network gate.
- **Public API** (`app/api/v1/*`): read-only revenue and fan data behind hashed, rate-limited keys. Our cost and margin never leave the building.

## Rules that matter

- **Supabase target:** only `aouaenqayfltoqrmpitg`. Never `cnnsllgzskqkvdovyiiv`.
- The `/ai` assistant reads through an explicit table/column allowlist and writes only through existing validated server actions. No raw SQL.
- `lib/persona-facts.ts` mirrors the bot's `src/prompt.ts`; change both together.
- No em dashes in UI copy. Explanatory text goes in hover hints.
- Adding a toggle means walking the whole chain (migration, `mapClone`, both repos' types, actions, control, and the bot code that reads it). A setting the runtime never reads is the dominant defect here.

## Deploys

Push to `main` builds the image in GitHub Actions and the box pulls it by digest. Docs-only pushes (`.md`, `.txt`, `archive/`) do not deploy and do not run CI.

Full architecture and conventions are in [CLAUDE.md](CLAUDE.md).
