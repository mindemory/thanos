# AGENTS.md

Notes for AI coding agents (and people) working in this repo. The README says what Thanos is; this says how to change it safely.

## The repo

- `src/app/`: the pages. Signing in (`login/`, `auth/verify/`, `welcome/`), joining (`join/[code]/`), starting a lab (`new/`), and each lab under `[lab]/`: home and search, `ask/`, `open/`, a card at `c/[id]/` and its `edit/`, topics at `t/[topic]/`, `projects/` (and `projects/new/`), a project at `p/[slug]/` and its `edit/`, `history/`, `people/`, `code/`, `review/`, `settings/`, and `export/` (a route, Markdown or JSON).
- `src/lib/`: everything else.
  - `db.ts` (Postgres or PGlite) and `schema.ts` (the whole schema).
  - `auth.ts` (email links, sessions, operators) and `labs.ts` (labs, members, `requireMember`).
  - `cards.ts` (cards, versions, reactions), `projects.ts` (projects, their people and versions) and `actions.ts` (every server action).
  - `search.ts` (MiniSearch, stemmer, synonyms), `sensitive.ts` (the secret check), `values.ts` (the paths and chart strings an answer gives a copy button), `paths.ts` (`safeNext`, where sign-in may send someone), `timeline.ts` (a project's status and years, and History), `papers.ts` (DOIs, and asking doi.org about them) and `names.ts` (a project's address, and names from Slack matched to a lab's people), all import-free so `node --test` runs them. So is `github.ts`.
  - `seed.ts` (a new lab's starter questions), `github.ts` (repositories), `mail.ts` (Resend), `origin.ts` (its own address).
- `scripts/import-slack.ts`: turns a lab's Slack (an export, or Proxenos's copy) into draft cards, or with `--projects` draft projects, with a model in Ollama on this computer. `src/lib/drafts.ts` and `src/app/[lab]/review/` take the drafts files, draft projects from the lab's GitHub too, and let an admin keep or drop each draft.
- `src/components/`: `lab/` for the lab's frame, search, card form and drafts. `ui.tsx` holds styles and plain pieces, `client.tsx` the ones that need the browser (copy buttons, `CodeBlock` and `Value` among them), `forms.tsx` the smaller forms. `Markdown.tsx` renders answers.
- `docs/`: notes on reading and scanning, and on which lab tools to connect next ([docs/reading-and-integrations.md](docs/reading-and-integrations.md)).

## Commands

```bash
npm run dev                 # http://127.0.0.1:4848, a local copy on PGlite in .thanos/
npm test                    # node --test: search and the secret check
npm run import-slack -- --from <folder> --lab <slug> --dry-run   # counts a lab's Slack, no model
npm run import-slack -- --from <folder> --lab <slug> --projects --dry-run   # lists its channels, no model
npm run lint && npx tsc --noEmit && npm run build   # lint includes jsx-a11y's recommended rules
rm -rf .thanos              # start the local copy over, with fresh starter labs
```

## Rules

- **No real lab data in the repo, ever.** That covers chart strings, grant numbers, names and messages. Tests build made-up cards inside the test.
- **A lab's chat stays on the computer it's on.** The importer reads public channels only, talks only to Ollama on 127.0.0.1, and writes under `.thanos/`, which git ignores. Never commit a drafts file, or paste lab messages into code, tests or docs.
- **Make nothing up about a lab.** Starter cards are questions, left open. The only answers Thanos writes itself are about Thanos and about what the lab's admin gave it (its GitHub, its website). A project draft holds only what its source says: a repository's own name, description and dates, or a channel's own dates, people and links, with the model saying only whether it's a project and what the messages say it is. The importer drops any repository, path or DOI the channel doesn't contain. A year in History is one someone gave or Thanos saw happen.
- **Secrets stay out.** Anything a card or a project saves goes through `findSensitive` first, and only a person's "Save anyway" lets it through. Keep the check in `actions.ts`, on the server, whatever the form does.
- **Every lab page checks membership on the server.** That's `requireMember` in pages and actions, plus a check that a card belongs to the lab before touching it. Lab powers come from a member's role. Operators (`THANOS_ADMINS`) start labs, and open one only while its admins let them in (`helpingIn`); managing people, the invite link, the lab's details, letting operators in and deleting the lab are for the lab's own admins (`ownAdmin`), never an operator who was let in, who keeps only what `isAdmin` gives (drafts) while the lab allows.
- **The data page stays true.** `src/app/privacy/page.tsx` tells everyone who can see a lab, what's emailed, where search and the importer run, and what export and deletion do. Change one of those, change the page with it.
- **Schema changes only add.** Every statement in `schema.ts` must be safe to run again. Bump `SCHEMA_VERSION` when it changes.
- **A local copy shows its hand only to its owner.** On-page sign-in links and joining any lab need `localTrusted` (a dev server, or `THANOS_LOCAL=1`), never just a missing `DATABASE_URL`.
- **Nothing typed goes in a URL.** Forms use `useFormAction`, which posts to the server action before the page is interactive and keeps what was typed when the server says no.
- **Quick to read at a glance.** A card's answer comes straight under its question. Paths, commands, IDs and chart strings are set in mono with a copy button (`Value`, `CodeBlock`). Text keeps 4.5:1 contrast and a field's edge 3:1, in both themes. Anything that takes focus shows the focus ring, and `focus:outline-none` needs something as visible in its place.
- **Match the surrounding code:** small modules, a comment that says why, the same comment density and naming as the file you're in, and the words the page already uses.
- **Commits:** one plain sentence saying what changed.
