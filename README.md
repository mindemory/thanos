# Thanos

A lab's memory. What people in a lab work out over the years (which grant pays for scans, what the chart string is, who holds the lab card, which toolboxes, where the code lives) kept in one place to search, and still there after the people who knew have moved on. Nobody has to ask the advisor, or the postdoc who left, the same question every year. And the lab's projects stay findable for as long as the lab lasts: who worked on each one, where its code and data are, and what came of it.

It starts with two labs, the Murray Lab at Dartmouth and the Clay Space Lab at NYU, and works for any group that keeps relearning the same things.

## What it does

- **Search before you ask.** Every question, every answer, every project and the lab's GitHub repositories, searched as you type, in the browser. Forms of a word meet (scans, scanning, scanned), and so do the other words labs use for the same thing (MRI, scan, fMRI; grant, chart string, pay). `/` jumps to the search box.
- **Ask once.** While you type a question, Thanos lists the cards that may already answer it. If none does, the question goes on the lab's Open list for whoever knows, and the asker gets an email when it's answered (once email is set up).
- **Anyone can answer or improve anything.** Every version of a card is kept with who wrote it, so an edit never loses anything.
- **Still right?** Anyone can say an answer is still right. One that nobody has checked in a year is marked as possibly out of date. Editing an answer counts as checking it.
- **Secrets stay out.** Saving something that looks like a card number, a password, a key or a Social Security number asks first, because everyone in the lab can read it, including people who join years from now. A card should say who holds the card and how to ask them.
- **People and alumni.** Admins invite people by email, or with a link that can be limited to some email domains. They can also make people admins or alumni. Alumni keep reading and answering, and what anyone wrote stays under their name after they leave.
- **Code.** The lab's GitHub organizations, listed newest first and searchable.
- **Projects.** Each project has a page: whether it's active, paused, done or published, its years, who is on it (alumni too, and people who never joined Thanos, by name), its repositories, where its data lives, its Slack channel, its papers by DOI, and the cards about it. Anyone in the lab can start one or bring it up to date, and every version is kept.
- **History.** The lab year by year: who joined and who left, which projects started and finished, and the papers that came out. Someone made an alum is marked as leaving that day, and the years people were really in the lab can go on the People page.
- **Keep a copy.** Any member can download the whole lab as Markdown, or as JSON with every version.
- **Private to the lab.** Only its members see it. Whoever runs a hosted copy can't either, unless the lab's admins let them in for a week, which every member sees. An admin can delete the lab, and everything in it, at any time.
- **Start from the lab's Slack and GitHub.** Years of answers are already sitting in Slack, and the lab's projects have channels of their own. A model on your own computer turns them into draft cards and projects, the lab's GitHub suggests projects too, and an admin keeps, fixes or drops each one.

Each new lab starts with the questions nearly every lab gets asked, left open for the people who know. Thanos makes nothing up about a lab. The only answers it starts with are how Thanos works and where the lab's GitHub is.

## Run it on your computer

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4848](http://127.0.0.1:4848). A local copy:

- keeps its database in `.thanos/`, using [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly), so there's nothing to install;
- starts with the Murray Lab and the Clay Space Lab and their starter questions, and lets you join either;
- sends no email: the sign-in link shows on the page instead, and only when the page is opened from this computer.

## Start from the lab's Slack

```bash
npm run import-slack -- --from <folder> --lab <slug> --dry-run     # count first, no model
npm run import-slack -- --from <folder> --lab <slug> --channels questions,general
npm run import-slack -- --from <folder> --lab <slug> --projects    # the channels that are projects
```

- **`<folder>`** is an export from Slack, unzipped, or one workspace in Proxenos's copy, `~/proxenos_vault/raw/slack/<workspace>`. You get an export from Slack's settings, under Import/export data.
- **Only public channels are read,** never direct messages, group messages or private channels. The importer looks at each conversation that starts with a question and got a reply.
- **A model in [Ollama](https://ollama.com) on your computer** writes each conversation worth keeping as a draft card and passes over the rest. The default is `gemma4:26b`, at about 8 seconds a conversation. Nothing leaves the computer, and it costs nothing.
- **Drafts go to `.thanos/imports/<slug>-drafts.jsonl`.** Add that file on the lab's Review page (Settings, then Review drafts). An admin keeps, fixes or drops each draft, and nothing reaches the lab until then.
- **A kept card says where it came from:** the channel, the month and who took part. It counts as answered when they answered, so an old answer is marked as possibly out of date until someone says it's still right.
- **A run can stop and start again.** Conversations already read are listed in `<slug>-seen.tsv`. Everything under `.thanos/` stays out of git.
- **With `--projects`** it reads each public channel as a whole, and the model says which ones clearly belong to one project (a study, an analysis, a thesis) and what each project is. The rest of a draft comes from the channel itself: its years from its first and last messages, its people from who wrote in it, and only the repositories, paths and DOIs its messages contain. It takes about 20 seconds a channel, and the drafts go to `.thanos/imports/<slug>-projects.jsonl`, for the same Review page. There, *Suggest projects from GitHub* drafts one for each of the lab's own repositories that no project has yet, and a repository named like a channel's project joins that draft.

Tell the lab's PI before its Slack goes in.

## Host it for a lab

What a lab's members need is one address they can all reach. This is the setup Thanos is built for, about half an hour of work, all on free tiers to start.

1. **Database: [Neon](https://neon.tech).** Make a project, and copy its pooled connection string (the host has `-pooler` in it) into `DATABASE_URL`. Thanos makes its tables the first time it starts. [Supabase](https://supabase.com) works too, through its transaction pooler (port 6543), but a free Supabase project pauses after a week without use.
2. **Email: [Resend](https://resend.com).** Add a domain you own and the DNS records Resend gives you (SPF and DKIM), so university mail servers trust the sign-in emails. Make an API key for `RESEND_API_KEY`, and set `THANOS_MAIL_FROM`, for example `Thanos <thanos@mindemory.io>`.
3. **Hosting: [Vercel](https://vercel.com).** Import this repository from GitHub; Vercel rebuilds it on every push to `main`. Set the environment variables: `DATABASE_URL`, `RESEND_API_KEY`, `THANOS_MAIL_FROM`, `THANOS_URL` (its address, below) and `THANOS_ADMINS` (your email), and if you like `THANOS_CONTACT` and `GITHUB_TOKEN`.
4. **An address.** Add a domain in Vercel, say `thanos.mindemory.io`, and the CNAME record it shows at your DNS provider.
5. **Check it.** `/api/health` should say `{"ok":true}`. An uptime monitor can watch that address.
6. **Start the labs** at `/new`. For a lab you're in, leave "Its first admin" empty and you're its admin. For someone else's, name its PI: they're its admin from their first sign-in, and you stay out.
7. **Bring in the Slack drafts.** On each lab's Review page, add the drafts files the importer made, and keep or drop them there. Reviews on a local copy don't move to a hosted one.
8. **Share it**: the lab's invite link (Settings, then Invite people) where the lab talks, or invitations by email from People.

Worth knowing:

- **Whoever runs it can't open the labs.** Someone in `THANOS_ADMINS` can start labs, but opens one only while its admins let them in, a week at a time, and every member sees a note while they can. [/privacy](src/app/privacy/page.tsx) says this, and the rest of how Thanos handles a lab's data, to everyone.
- **Put the accounts in the lab's name, not one person's.** That means the database, email and hosting. Thanos is for when people leave, and that includes whoever set it up. Download a copy now and then (Settings, then Keep a copy), or commit one to the lab's GitHub.
- Universities' email scanners, like Microsoft's Safe Links, open links before people do. So a sign-in link only signs someone in when they press the button on its page.

## Environment variables

None are needed on your own computer. See [.env.example](.env.example).

| Variable | When | What for |
| --- | --- | --- |
| `DATABASE_URL` | hosted | Postgres. Unset, Thanos runs locally on PGlite. |
| `THANOS_URL` | hosted | Its own address, for links in emails and invites. On Vercel, the production address stands in. |
| `THANOS_ADMINS` | hosted | Emails, comma-separated, of whoever runs it: they can start labs, and open one only while its admins let them in. |
| `RESEND_API_KEY`, `THANOS_MAIL_FROM` | hosted | Sign-in links, and telling askers their question was answered. |
| `GITHUB_TOKEN` | optional | Lifts GitHub's limit of 60 requests an hour. The Code page lists public repositories only, token or not, so no lab sees another's private code. |
| `THANOS_CONTACT` | optional | Who to ask about a lab's data, shown on `/privacy`. |
| `THANOS_DB_POOL` | optional | How many database connections each server keeps (default 3), for a database that allows few. |
| `THANOS_DATA_DIR` | optional | Where a local copy keeps its database (default `.thanos/db`). |
| `THANOS_LOCAL` | optional | `1` lets a production build without `DATABASE_URL` behave as a local copy (sign-in links on the page, any lab joinable). Without it, only `npm run dev` does, so a server started without a database by mistake stays shut. |

## How it's built

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript and [Tailwind CSS](https://tailwindcss.com) 4. It has the look of Proxenos and Alexandria's library: a near-black, neutral ground, Geist and Newsreader, and one accent (violet here), with a light theme too.
- Postgres through [postgres.js](https://github.com/porsager/postgres), or PGlite locally. The whole schema is in [src/lib/schema.ts](src/lib/schema.ts) and is applied on start.
- Sign-in by email link, with no passwords. Link tokens and session ids are random and stored only as hashes.
- Search runs in the browser with [MiniSearch](https://github.com/lucaong/minisearch), plus a small stemmer and a list of lab synonyms ([src/lib/search.ts](src/lib/search.ts)). A search costs nothing and calls no model.
- A card puts its answer straight under the question. Answers are Markdown with code blocks and tables. Paths, commands and chart strings are set in Geist Mono with a copy button, whether or not they're in backticks ([src/lib/values.ts](src/lib/values.ts)). Why it reads this way, and which of a lab's other tools to connect next: [docs/reading-and-integrations.md](docs/reading-and-integrations.md).
- The secret check is [src/lib/sensitive.ts](src/lib/sensitive.ts).
- A project's papers are looked up at doi.org by their DOIs when the project is saved, for their titles, authors and years. Only the DOI goes with the question ([src/lib/papers.ts](src/lib/papers.ts)). History is put together from those years, the projects' own and the people's ([src/lib/timeline.ts](src/lib/timeline.ts)).

## Checks

```bash
npm test             # search, the secret check, and reading projects and papers: no network, no database
npm run lint         # with eslint-plugin-jsx-a11y's recommended rules
npx tsc --noEmit
npm run build
```

## Credits

The stylesheet, the Markdown renderer and the toasts come from Proxenos (MIT, the same author). Thanos also builds on Next.js, React, Tailwind CSS, PGlite, postgres.js, MiniSearch and [Lucide](https://lucide.dev) icons, and checks itself with [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) (MIT), each under its own licence.
