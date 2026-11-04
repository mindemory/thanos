// Turns a lab's Slack into drafts for Thanos, on this computer.
//
//   npm run import-slack -- --from <folder> --lab <slug> [--channels a,b] [--since 2022] [--limit 50]
//   npm run import-slack -- --from <folder> --lab <slug> --projects
//
// <folder> is an export from Slack (its settings, Import/export data, unzipped) or one workspace
// in Proxenos's copy (~/proxenos_vault/raw/slack/<workspace>). Only public channels are read:
// direct messages, group messages and private channels never are.
//
// Each conversation that starts with a question and got a reply goes to a model running in
// Ollama on this computer, which writes it up as a draft card (a question, its answer, a topic,
// other words for it) or says it isn't knowledge the lab should keep. Nothing leaves this
// computer. Drafts go to .thanos/imports/<lab>-drafts.jsonl, to add on the lab's Review page,
// where an admin keeps, fixes or drops each one. A run can stop and start again: conversations
// already read are listed in <lab>-seen.tsv and skipped.
//
// With --projects it reads each public channel as a whole instead, and the model says whether
// it's clearly one project's channel (a study, an analysis, a thesis) and, if so, what the
// messages say the project is. Everything else in the draft comes from the channel itself: its
// years from its first and last messages, its people from who wrote in it, and only the
// repositories, DOIs and paths that its messages contain. Those drafts go to
// .thanos/imports/<lab>-projects.jsonl, for the same Review page.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { findRepos, repoOf } from "../src/lib/github.ts";
import { doiOf, findDois } from "../src/lib/papers.ts";
import { findSensitive } from "../src/lib/sensitive.ts";
import { finished, isStatus } from "../src/lib/timeline.ts";
import { TOPICS } from "../src/lib/topics.ts";
import { findValues } from "../src/lib/values.ts";

const OLLAMA = "http://127.0.0.1:11434"; // only ever this computer
// gemma4:26b reads a conversation in about 8 seconds on an M-series Mac, qwen3.6:27b in about a
// minute. Ollama's MLX models can't be held to a JSON schema yet, so they come last.
const PREFERRED = ["gemma4:26b", "qwen3.6:27b", "qwen3.6:27b-mlx"];
const SKIP_BY_DEFAULT = "random";

interface Message {
  channel: string;
  user: string;
  userId: string;
  text: string;
  at: number; // Slack's timestamp, seconds
  thread: number | null; // the timestamp of the message it replies under
  reply: boolean;
}

interface Conversation {
  origin: string;
  channel: string;
  messages: Message[];
}

// ── Reading Slack ────────────────────────────────────────────────────────────

/** One workspace from Proxenos's copy: monthly files of messages, every kind of channel mixed. */
function fromProxenos(dir: string): Message[] {
  // Its list of channels, when there is one, has the last word: a channel it calls anything but
  // public is never read, whatever its messages say. Known by its id, so a channel made private
  // and renamed since is still known.
  const listed = path.join(dir, "channels", "snapshot.jsonl");
  const closed = new Set<string>();
  if (existsSync(listed)) {
    for (const line of readFileSync(listed, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const c = JSON.parse(line);
      if (c.channel_type !== "channel") closed.add(String(c.channel_id ?? c.id ?? `#${c.channel_name}`));
    }
  }
  const out: Message[] = [];
  for (const file of readdirSync(path.join(dir, "messages")).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(path.join(dir, "messages", file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      // Public channels only.
      if (r.channel_type !== "channel" || closed.has(String(r.channel_id ?? `#${r.channel_name}`))) continue;
      if (r.subtype && r.subtype !== "thread_broadcast") continue; // joins, bots, topic changes
      const at = Number(r.slack_ts);
      const thread = r.thread_ts ? Number(r.thread_ts) : null;
      out.push({
        channel: String(r.channel_name),
        user: r.user_name || "someone",
        userId: String(r.user_id ?? ""),
        text: String(r.text ?? ""),
        at,
        thread,
        reply: Boolean(r.is_reply) || (thread !== null && thread !== at),
      });
    }
  }
  return out;
}

/** Slack's own export: channels.json lists the public channels, each a folder of daily files. */
function fromSlackExport(dir: string): Message[] {
  const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const channels = read("channels.json") as { name: string }[];
  const users = existsSync(path.join(dir, "users.json"))
    ? (read("users.json") as { id: string; name?: string; real_name?: string; profile?: { real_name?: string } }[])
    : [];
  const names = new Map(users.map((u) => [u.id, u.profile?.real_name || u.real_name || u.name || "someone"]));
  const out: Message[] = [];
  for (const { name } of channels) {
    if (!existsSync(path.join(dir, name))) continue;
    for (const file of readdirSync(path.join(dir, name)).filter((f) => f.endsWith(".json")).sort()) {
      for (const m of read(path.join(name, file)) as Record<string, unknown>[]) {
        if (m.type !== "message" || (m.subtype && m.subtype !== "thread_broadcast")) continue;
        const at = Number(m.ts);
        const thread = m.thread_ts ? Number(m.thread_ts) : null;
        const profile = m.user_profile as { real_name?: string } | undefined;
        out.push({
          channel: name,
          user: profile?.real_name || names.get(String(m.user)) || "someone",
          userId: String(m.user ?? ""),
          text: String(m.text ?? ""),
          at,
          thread,
          reply: thread !== null && thread !== at,
        });
      }
    }
  }
  return out;
}

/** Slack's markup as plain text: mentions as names, links as their address. */
function plainText(text: string, names: Map<string, string>): string {
  return text
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => `@${names.get(id) ?? "someone"}`)
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

const ASKS = /\?|\b(how (do|can|should|does)|does anyone|anyone (know|have)|where (is|are|do|can)|who (has|knows|is|do)|what('s| is) the|is there|can (someone|anyone|i|we))\b/i;

/**
 * Conversations worth a look: a message in a channel that asks something, with its thread, or
 * (from before threads) the channel's next messages within three hours, and a reply from
 * someone else. The newest come first: they're the likeliest to still be right.
 */
function conversations(messages: Message[], names: Map<string, string>): Conversation[] {
  const seen = new Set<string>();
  const top = new Map<string, Message[]>();
  const replies = new Map<string, Message[]>();
  for (const m of messages) {
    const key = `${m.channel}:${m.at}`;
    if (seen.has(key)) continue; // a reply also sent to the channel shows up twice
    seen.add(key);
    m.text = plainText(m.text, names);
    if (m.reply && m.thread !== null) {
      const root = `${m.channel}:${m.thread}`;
      replies.set(root, [...(replies.get(root) ?? []), m]);
    } else {
      top.set(m.channel, [...(top.get(m.channel) ?? []), m]);
    }
  }
  const out: Conversation[] = [];
  for (const [channel, list] of top) {
    list.sort((a, b) => a.at - b.at);
    list.forEach((root, i) => {
      if (root.text.length < 15 || !ASKS.test(root.text)) return;
      const thread = (replies.get(`${channel}:${root.at}`) ?? []).sort((a, b) => a.at - b.at);
      const following = thread.length ? thread : list.slice(i + 1).filter((m) => m.at - root.at < 3 * 3600).slice(0, 9);
      const said = [root, ...following].slice(0, 25);
      if (!said.some((m) => m.userId !== root.userId)) return;
      out.push({ origin: `slack:${channel}:${root.at}`, channel, messages: said });
    });
  }
  return out.sort((a, b) => b.messages[0].at - a.messages[0].at);
}

// ── Asking the model ─────────────────────────────────────────────────────────

const INSTRUCTIONS = `You read one conversation from a research lab's Slack and decide whether it holds knowledge the lab should keep for its future members, in the lab's knowledge base. If it does, you write it up as one card: a question and its answer.

Keep it when the conversation settles something lasting about how the lab works or how to do something there: grants, chart strings, purchasing and reimbursements; booking and running the scanner, EEG, MEG, TMS or eye tracker; IRB protocols, consent and paying participants; code, toolboxes, analysis pipelines, the cluster and where data lives; accounts and onboarding; posters, talks and writing; lab meetings and norms; who to ask about what.

Don't keep it when it's social chat, plans for one day or one event, a status update, one person's results or bug, or a question nobody answered.

Write the question the way someone new to the lab would ask it, so they'd find it by searching. Write the answer so it stands on its own: a few sentences or a short Markdown list, with the concrete details the conversation gives (tools, steps, links, who to ask). Use only what the conversation says; never add facts, guesses or advice of your own. If people disagreed or changed their minds, give where it ended up. Leave out passwords, card numbers and other secrets.

topic is one of: ${TOPICS.map((t) => `${t.id} (${t.label.toLowerCase()})`).join(", ")}.
tags: a few other words someone might search for, lower case, separated by commas.
If you don't keep it, set keep to false and leave the other fields empty.
Reply with JSON only, with the keys keep, question, answer, topic and tags.`;

const FORMAT = {
  type: "object",
  properties: {
    keep: { type: "boolean" },
    question: { type: "string" },
    answer: { type: "string" },
    topic: { type: "string", enum: TOPICS.map((t) => t.id) },
    tags: { type: "string" },
  },
  required: ["keep", "question", "answer", "topic", "tags"],
};

interface Card {
  keep: boolean;
  question: string;
  answer: string;
  topic: string;
  tags: string;
}

/** What the model said, as a card, whatever shapes it chose: some models give tags as a list. */
function asCard(r: Record<string, unknown>): Card {
  const text = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "").trim();
  const topic = text(r.topic);
  return {
    keep: r.keep === true,
    question: text(r.question).replace(/\s+/g, " "),
    answer: text(r.answer),
    topic: TOPICS.some((t) => t.id === topic) ? topic : "other",
    tags: text(r.tags).toLowerCase(),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (at: number) => {
  const d = new Date(at * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

function transcript(c: Conversation): string {
  return c.messages
    .map((m) => `[${m.user}] ${m.text.length > 1500 ? `${m.text.slice(0, 1500)}…` : m.text}`)
    .join("\n")
    .slice(0, 9000);
}

let structured = true; // whether the model takes a JSON schema; if not, the instructions ask for JSON

/**
 * One exchange with the model: its instructions, what it reads, and the JSON it gives back. `most`
 * caps how much it may write, so a model that runs on can't hold the run up.
 */
async function chat(
  model: string,
  instructions: string,
  format: object,
  content: string,
  most?: number,
  think = false,
): Promise<Record<string, unknown>> {
  const reply = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      ...(think ? {} : { think: false }), // thinking would only slow a short write-up down
      ...(structured ? { format } : {}),
      options: { temperature: 0.1, num_ctx: 8192, ...(most ? { num_predict: most } : {}) },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!reply.ok) {
    const why = await reply.text();
    if (structured && /structured output/i.test(why)) {
      structured = false;
      return chat(model, instructions, format, content, most, think);
    }
    // A model that can't be told not to think says so; ask it again without saying it.
    if (!think && /think/i.test(why)) return chat(model, instructions, format, content, most, true);
    throw new Error(`Ollama said ${reply.status}: ${why.slice(0, 200)}`);
  }
  const { message } = (await reply.json()) as { message: { content: string } };
  const text = message.content;
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

async function ask(model: string, c: Conversation): Promise<Card> {
  return asCard(await chat(model, INSTRUCTIONS, FORMAT, `#${c.channel}, ${month(c.messages[0].at)}\n\n${transcript(c)}`));
}

/**
 * A model that runs on this computer. Ollama also offers models that run on its own servers
 * (their names end in "cloud"), which would send the lab's chat away, so they're never used.
 */
async function pickModel(asked: string | undefined): Promise<string> {
  let names: string[];
  try {
    const reply = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const models = ((await reply.json()) as { models: { name: string; remote_host?: string; remote_model?: string }[] }).models;
    names = models.filter((m) => !m.remote_host && !m.remote_model && !/cloud$/i.test(m.name)).map((m) => m.name);
  } catch {
    throw new Error("Ollama isn't running on this computer. Open the Ollama app, or run `ollama serve`, and try again.");
  }
  if (asked) {
    if (/cloud$/i.test(asked)) throw new Error(`${asked} runs on Ollama's servers, and a lab's chat stays on this computer. Pick a model that runs here.`);
    if (!names.includes(asked)) throw new Error(`Ollama doesn't have ${asked} on this computer. Get it with \`ollama pull ${asked}\`.`);
    return asked;
  }
  const model = PREFERRED.find((m) => names.includes(m)) ?? names.find((m) => !/embed/i.test(m));
  if (!model) throw new Error("Ollama has no model to write with. Get one with `ollama pull qwen3.6:27b`.");
  return model;
}

// ── Projects ─────────────────────────────────────────────────────────────────

// Fewer messages than this can't show what a channel is for.
const PROJECT_MIN = 20;
// Someone who wrote at least this many messages in a project's channel is one of its people.
const PERSON_MIN = 3;

interface Channel {
  name: string;
  messages: Message[]; // oldest first, threads and all
  people: string[]; // who wrote in it often enough, most first
  text: string; // everything said in it, to check what the model copies out of it
}

/** Each public channel as a whole. */
function channelsOf(messages: Message[], names: Map<string, string>): Channel[] {
  const byChannel = new Map<string, Map<number, Message>>();
  for (const m of messages) {
    const seen = byChannel.get(m.channel) ?? new Map<number, Message>();
    // A reply also sent to the channel shows up twice.
    if (!seen.has(m.at)) seen.set(m.at, { ...m, text: plainText(m.text, names) });
    byChannel.set(m.channel, seen);
  }
  return [...byChannel].map(([name, seen]) => {
    const list = [...seen.values()].sort((a, b) => a.at - b.at);
    const counts = new Map<string, number>();
    for (const m of list) if (m.user !== "someone") counts.set(m.user, (counts.get(m.user) ?? 0) + 1);
    const people = [...counts]
      .filter(([, n]) => n >= PERSON_MIN)
      .sort((a, b) => b[1] - a[1])
      .map(([who]) => who);
    return { name, messages: list, people, text: list.map((m) => m.text).join("\n") };
  });
}

/**
 * Paths and shared drives a channel mentions, the most mentioned first. Chart strings aren't
 * places, and nor is the end of a web address.
 */
function placesIn(c: Channel): string[] {
  const counts = new Map<string, number>();
  for (const m of c.messages) {
    for (const v of findValues(m.text.replace(/\bhttps?:\/\/\S+/g, " "))) if (!/^[\d-]+$/.test(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

const LINKED = /github\.com\/|\b10\.\d{4,9}\/|(?:^|\s)~?\/[\w.-]+\/[\w.-]|(?:smb|afp|nfs|sftp|ssh):\/\//;

/**
 * What the model reads of a channel: what it is (its dates, its people, the links in it), then its
 * first messages, a few from its middle, its last, and messages with links in them, about 9,000
 * characters in all. Messages with anything like a password in them are left out.
 */
function channelSample(c: Channel): string {
  const first = c.messages[0].at;
  const last = c.messages[c.messages.length - 1].at;
  const listed = (label: string, items: string[]) => (items.length ? `${label}: ${items.slice(0, 15).join(", ")}\n` : "");
  const head =
    `#${c.name}: ${c.messages.length} messages from ${month(first)} to ${month(last)}.\n` +
    listed("Most messages from", c.people.slice(0, 8)) +
    listed("GitHub repositories mentioned", findRepos(c.text)) +
    listed("DOIs mentioned", findDois(c.text)) +
    listed("Paths and drives mentioned", placesIn(c));
  const fit = c.messages.filter((m) => m.text.length > 1 && !findSensitive(m.text).length);
  const top = fit.filter((m) => !m.reply);
  const middle = top.slice(15, -12);
  const step = Math.max(1, Math.floor(middle.length / 8));
  const picked = new Set([...top.slice(0, 15), ...middle.filter((_, i) => i % step === 0).slice(0, 8), ...top.slice(-12)]);
  for (const m of fit) if (picked.size < 50 && LINKED.test(m.text)) picked.add(m);
  let body = "";
  for (const m of [...picked].sort((a, b) => a.at - b.at)) {
    const line = `[${month(m.at)}, ${m.user}] ${m.text.length > 300 ? `${m.text.slice(0, 300)}…` : m.text}\n`;
    if (head.length + body.length + line.length > 9000) break;
    body += line;
  }
  return `${head}\n${body}`.trim();
}

const PROJECT_INSTRUCTIONS = `You read part of one channel from a research lab's Slack and decide whether the channel belongs to one research project: a study, an experiment, an analysis, a dataset, a thesis, a tool built for one study, or a paper in the making.

Channels for the whole lab are not projects: announcements, general chat, lab meetings, journal clubs, reading groups, conferences, jobs and opportunities, questions, equipment, rooms, the building, social chat. Nor is a channel for a skill, a club or training. When you can't tell, it isn't a project.

If it is a project, write:
- name: what the lab calls it, short, from the channel's name and how people in it refer to it. Keep the lab's own abbreviations.
- summary: one to three plain sentences on what the project studies or builds, and how, using only what the messages say. Give no findings unless the messages state them, and nothing the messages don't say.
- status: published if the messages say the project's own paper came out; done if they say the project finished; otherwise active.
- repos: GitHub repositories, as owner/name, from the list given, that hold this project's own code.
- data: paths or addresses, copied exactly from the list given, where this project's data lives.
- papers: DOIs, from the list given, of this project's own papers or preprints, not papers it read.
Give at most five of each, and leave a list empty when you aren't sure.

If it isn't a project, set project to false and leave the rest empty.
Reply with JSON only, with the keys project, name, summary, status, repos, data and papers.`;

const PROJECT_FORMAT = {
  type: "object",
  properties: {
    project: { type: "boolean" },
    name: { type: "string" },
    summary: { type: "string" },
    status: { type: "string", enum: ["active", "done", "published"] },
    repos: { type: "array", items: { type: "string" }, maxItems: 5 },
    data: { type: "array", items: { type: "string" }, maxItems: 5 },
    papers: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["project", "name", "summary", "status", "repos", "data", "papers"],
};

/**
 * A draft project from what the model said and what the channel holds, or null when it isn't
 * one. The model only names the project and says what it is; its years, people and Slack
 * channel come from the channel, and a repository, path or DOI it gives stays only if the
 * channel's messages have it.
 */
function projectDraft(c: Channel, said: string, r: Record<string, unknown>, now: number) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : []);
  const name = text(r.name).replace(/\s+/g, " ").slice(0, 100);
  const summary = text(r.summary).slice(0, 2000);
  if (r.project !== true || name.length < 2 || findSensitive(`${name}\n${summary}`).length) return null;
  const repos = new Map(findRepos(c.text).map((x) => [x.toLowerCase(), x]));
  const dois = new Set(findDois(c.text));
  const places = new Set(placesIn(c));
  const first = c.messages[0].at;
  const last = c.messages[c.messages.length - 1].at;
  let status = isStatus(text(r.status)) ? text(r.status) : "active";
  // A year without a message, and a project the model calls active is paused, as far as its channel knows.
  if (status === "active" && now / 1000 - last > 365 * 86400) status = "paused";
  const year = (at: number) => new Date(at * 1000).getUTCFullYear();
  return {
    kind: "project",
    origin: `slack:#${c.name}`,
    name,
    summary,
    status,
    started: year(first),
    ended: finished(status) ? year(last) : null,
    people: c.people.slice(0, 12),
    repos: [...new Set(list(r.repos).map((x) => repos.get(repoOf(x)?.toLowerCase() ?? "")).filter(Boolean))],
    data: [...new Set(list(r.data).filter((x) => places.has(x) && !findSensitive(x).length))].slice(0, 10),
    papers: [...new Set(list(r.papers).map(doiOf).filter((d): d is string => d !== null && dois.has(d)))],
    slack: `#${c.name}`,
    source: `#${c.name} on Slack: ${c.messages.length.toLocaleString("en-US")} messages from ${month(first)} to ${month(last)}`,
    evidence: said.slice(0, 6000),
  };
}

interface Run {
  from: string;
  kind: string;
  lab: string;
  out: string;
  only: Set<string>;
  skip: Set<string>;
  since: number;
  limit: number;
  model?: string;
  dry: boolean;
}

/** Reads each public channel and drafts the ones that are clearly a project's. */
async function findProjects(messages: Message[], names: Map<string, string>, run: Run): Promise<void> {
  const draftsFile = path.join(run.out, `${run.lab}-projects.jsonl`);
  const seenFile = path.join(run.out, `${run.lab}-seen.tsv`);
  const done = readSeen(seenFile);
  const lastAt = (c: Channel) => c.messages[c.messages.length - 1].at;
  const all = channelsOf(messages, names).filter(
    (c) => (!run.only.size || run.only.has(c.name)) && !run.skip.has(c.name) && c.messages.length >= PROJECT_MIN && lastAt(c) >= run.since,
  );
  const todo = all.filter((c) => !done.has(`slack:#${c.name}`)).sort((a, b) => b.messages.length - a.messages.length);

  console.log(`${run.kind} at ${run.from}: ${all.length} public channels with at least ${PROJECT_MIN} messages; ${todo.length} not read yet.`);
  if (run.dry) {
    for (const c of todo) {
      const people = c.people.length === 1 ? "1 person" : `${c.people.length} people`;
      console.log(`  #${c.name}: ${c.messages.length} messages, ${month(c.messages[0].at)} to ${month(lastAt(c))}, ${people}`);
    }
    console.log(`At about 20 seconds a channel with gemma4:26b, that's about ${Math.max(1, Math.round((todo.length * 20) / 60))} minutes.`);
    return;
  }

  const model = await pickModel(run.model);
  console.log(`Looking for projects with ${model} through Ollama on this computer, into ${draftsFile}\n`);
  let kept = 0;
  let read = 0;
  const started = Date.now();
  for (const c of todo) {
    if (read >= run.limit) break;
    read++;
    const head = `[${read}/${Math.min(todo.length, run.limit)}] #${c.name}:`;
    const said = channelSample(c);
    let draft: ReturnType<typeof projectDraft>;
    try {
      draft = projectDraft(c, said, await chat(model, PROJECT_INSTRUCTIONS, PROJECT_FORMAT, said, 1024), Date.now());
    } catch (e) {
      console.log(`${head} ${e instanceof Error ? e.message : e} (it'll be tried again next run)`);
      continue;
    }
    if (draft) {
      appendFileSync(draftsFile, `${JSON.stringify(draft)}\n`, { mode: 0o600 });
      kept++;
      console.log(`${head} a project, "${draft.name}" (${draft.status}, from ${draft.started})`);
    } else {
      console.log(`${head} not a project`);
    }
    appendFileSync(seenFile, `slack:#${c.name}\t${draft ? "project" : "skipped"}\n`, { mode: 0o600 });
  }
  const each = read ? Math.round((Date.now() - started) / read / 100) / 10 : 0;
  console.log(`\nRead ${read} channels (${each} s each) and found ${kept} projects.`);
  if (kept) console.log(`Add ${draftsFile} on the lab's Review page in Thanos (/${run.lab}/review?show=projects).`);
}

// ── The run ──────────────────────────────────────────────────────────────────

/** What earlier runs read already: conversations and channels, one a line. */
function readSeen(file: string): Set<string> {
  return new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").map((l) => l.split("\t")[0]).filter(Boolean) : []);
}

const HELP = `Turns a lab's Slack into drafts for Thanos, with a model on this computer.

  npm run import-slack -- --from <folder> --lab <slug> [options]

  --from <folder>     an unzipped Slack export, or Proxenos's ~/proxenos_vault/raw/slack/<workspace>
  --lab <slug>        the lab's address in Thanos, like clayspace (names the output files)
  --channels a,b      only these channels
  --skip a,b          never these channels (default: ${SKIP_BY_DEFAULT})
  --since 2022        only conversations from then on (a year, or a date like 2022-09-01)
  --limit 50          stop after this many conversations
  --model <name>      an Ollama model (default: the first of ${PREFERRED.join(", ")} you have)
  --out <folder>      where the drafts go (default: .thanos/imports)
  --projects          find the channels that are clearly a project's, and draft those projects
  --dry-run           count the conversations (or with --projects, the channels), ask no model
`;

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      lab: { type: "string" },
      channels: { type: "string" },
      skip: { type: "string", default: SKIP_BY_DEFAULT },
      since: { type: "string" },
      limit: { type: "string" },
      model: { type: "string" },
      out: { type: "string", default: path.join(".thanos", "imports") },
      "dry-run": { type: "boolean", default: false },
      projects: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !values.from) {
    console.log(HELP);
    return;
  }
  const from = path.resolve(values.from.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  const lab = values.lab || path.basename(from);
  const list = (text?: string) => new Set((text ?? "").split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean));
  const only = list(values.channels);
  const skip = list(values.skip);
  const since = values.since ? Date.parse(/^\d{4}$/.test(values.since) ? `${values.since}-01-01` : values.since) / 1000 : 0;
  const limit = values.limit ? Number(values.limit) : Infinity;
  if (Number.isNaN(since) || Number.isNaN(limit)) throw new Error("--since takes a year or a date, and --limit a number.");

  const kind = existsSync(path.join(from, "channels.json")) ? "Slack export" : existsSync(path.join(from, "messages")) ? "Proxenos" : null;
  if (!kind) throw new Error(`${from} isn't an unzipped Slack export (no channels.json) or a Proxenos workspace (no messages folder).`);
  const messages = kind === "Proxenos" ? fromProxenos(from) : fromSlackExport(from);
  const names = new Map(messages.map((m) => [m.userId, m.user]));

  mkdirSync(values.out, { recursive: true, mode: 0o700 });
  if (values.projects) {
    await findProjects(messages, names, { from, kind, lab, out: values.out, only, skip, since, limit, model: values.model, dry: values["dry-run"] });
    return;
  }
  const draftsFile = path.join(values.out, `${lab}-drafts.jsonl`);
  const seenFile = path.join(values.out, `${lab}-seen.tsv`);
  const done = readSeen(seenFile);

  const all = conversations(messages, names).filter(
    (c) => (!only.size || only.has(c.channel)) && !skip.has(c.channel) && c.messages[0].at >= since,
  );
  const todo = all.filter((c) => !done.has(c.origin));
  const perChannel = new Map<string, number>();
  for (const c of todo) perChannel.set(c.channel, (perChannel.get(c.channel) ?? 0) + 1);

  console.log(`${kind} at ${from}: ${messages.length} messages in public channels.`);
  console.log(`${all.length} conversations start with a question and got a reply; ${todo.length} not read yet.`);
  if (values["dry-run"]) {
    for (const [channel, n] of [...perChannel].sort((a, b) => b[1] - a[1])) console.log(`  #${channel}: ${n}`);
    console.log(`At about 8 seconds each with gemma4:26b, that's about ${Math.max(1, Math.round((todo.length * 8) / 3600))} hours.`);
    return;
  }

  const model = await pickModel(values.model);
  console.log(`Writing drafts with ${model} through Ollama on this computer, into ${draftsFile}\n`);
  let kept = 0;
  let read = 0;
  const started = Date.now();
  for (const c of todo) {
    if (read >= limit) break;
    read++;
    const head = `[${read}/${Math.min(todo.length, limit)}] #${c.channel}, ${month(c.messages[0].at)}:`;
    const said = transcript(c);
    if (findSensitive(said).length) {
      appendFileSync(seenFile, `${c.origin}\tsecret\n`);
      console.log(`${head} left out, it has something like a password or a card number in it`);
      continue;
    }
    let card: Card;
    try {
      card = await ask(model, c);
    } catch (e) {
      console.log(`${head} ${e instanceof Error ? e.message : e} (it'll be tried again next run)`);
      continue;
    }
    const usable = card.keep && card.question.length >= 8 && card.answer !== "" && !findSensitive(`${card.question}\n${card.answer}`).length;
    if (usable) {
      const people = [...new Set(c.messages.map((m) => m.user))];
      const last = c.messages[c.messages.length - 1].at;
      const source = `#${c.channel} on Slack, ${month(c.messages[0].at)}, with ${
        people.length > 4 ? `${people.slice(0, 3).join(", ")} and ${people.length - 3} others` : people.join(", ")
      }`;
      appendFileSync(
        draftsFile,
        `${JSON.stringify({ origin: c.origin, ...card, keep: undefined, source, dated: new Date(last * 1000).toISOString(), thread: said.slice(0, 6000) })}\n`,
        { mode: 0o600 },
      );
      kept++;
      console.log(`${head} drafted "${card.question}"`);
    } else {
      console.log(`${head} not lab knowledge`);
    }
    appendFileSync(seenFile, `${c.origin}\t${usable ? "drafted" : "skipped"}\n`, { mode: 0o600 });
  }
  const each = read ? Math.round((Date.now() - started) / read / 100) / 10 : 0;
  console.log(`\nRead ${read} conversations (${each} s each) and drafted ${kept}.`);
  if (kept) console.log(`Add ${draftsFile} on the lab's Review page in Thanos (/${lab}/review).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
