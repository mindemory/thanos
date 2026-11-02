# AGENTS.md

Notes for AI coding agents (and people) working in this repo. The README says what Thanos is; this says how to change it safely.

## The repo

- `src/app/`: the pages. Signing in (`login/`, `auth/verify/`, `welcome/`), joining (`join/[code]/`), starting a lab (`new/`), and each lab under `[lab]/`: home and search, `ask/`, `open/`, a card at `c/[id]/` and its `edit/`, topics at `t/[topic]/`, `people/`, `code/`, `settings/`, and `export/` (a route, Markdown or JSON).
- `src/lib/`: everything else.
  - `db.ts` (Postgres or PGlite) and `schema.ts` (the whole schema).
  - `auth.ts` (email links, sessions, operators) and `labs.ts` (labs, members, `requireMember`).
  - `cards.ts` (cards, versions, reactions) and `actions.ts` (every server action).
  - `search.ts` (MiniSearch, stemmer, synonyms) and `sensitive.ts` (the secret check), both import-free so `node --test` runs them.
  - `seed.ts` (a new lab's starter questions), `github.ts` (repositories), `mail.ts` (Resend), `origin.ts` (its own address).
- `src/components/`: `lab/` for the lab's frame, search and card form. `ui.tsx` holds styles and plain pieces, `client.tsx` the ones that need the browser, `forms.tsx` the smaller forms.

## Commands

```bash
npm run dev                 # http://127.0.0.1:4848, a local copy on PGlite in .thanos/
npm test                    # node --test: search and the secret check
npm run lint && npx tsc --noEmit && npm run build
rm -rf .thanos              # start the local copy over, with fresh starter labs
```

## Rules

- **No real lab data in the repo, ever.** That covers chart strings, grant numbers, names and messages. Tests build made-up cards inside the test.
- **Make nothing up about a lab.** Starter cards are questions, left open. The only answers Thanos writes itself are about Thanos and about what the lab's admin gave it (its GitHub, its website).
- **Secrets stay out.** Anything a card saves goes through `findSensitive` first, and only a person's "Save anyway" lets it through. Keep the check in `actions.ts`, on the server, whatever the form does.
- **Every lab page checks membership on the server.** That's `requireMember` in pages and actions, plus a check that a card belongs to the lab before touching it. Lab powers come from a member's role. Only hosted operators (`THANOS_ADMINS`) act as admin in every lab.
- **Schema changes only add.** Every statement in `schema.ts` must be safe to run again. Bump `SCHEMA_VERSION` when it changes.
- **Nothing typed goes in a URL.** Forms use `useFormAction`, which posts to the server action before the page is interactive and keeps what was typed when the server says no.
- **Match the surrounding code:** small modules, a comment that says why, the same comment density and naming as the file you're in, and the words the page already uses.
- **Commits:** one plain sentence saying what changed.
