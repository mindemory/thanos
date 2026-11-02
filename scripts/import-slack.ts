// Turns a lab's Slack into drafts for Thanos, on this computer.
//
//   npm run import-slack -- --from <folder> --lab <slug> [--channels a,b] [--since 2022] [--limit 50]
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

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { findSensitive } from "../src/lib/sensitive.ts";
import { TOPICS } from "../src/lib/topics.ts";

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
  const out: Message[] = [];
  for (const file of readdirSync(path.join(dir, "messages")).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(path.join(dir, "messages", file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.channel_type !== "channel") continue; // public channels only
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

async function ask(model: string, c: Conversation, think: boolean): Promise<Card> {
  const reply = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      ...(think ? {} : { think: false }), // thinking would only slow a short write-up down
      ...(structured ? { format: FORMAT } : {}),
      options: { temperature: 0.1, num_ctx: 8192 },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: `#${c.channel}, ${month(c.messages[0].at)}\n\n${transcript(c)}` },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!reply.ok) {
    const why = await reply.text();
    if (structured && /structured output/i.test(why)) {
      structured = false;
      return ask(model, c, think);
    }
    // A model that can't be told not to think says so; ask it again without saying it.
    if (!think && /think/i.test(why)) return ask(model, c, true);
    throw new Error(`Ollama said ${reply.status}: ${why.slice(0, 200)}`);
  }
  const { message } = (await reply.json()) as { message: { content: string } };
  const text = message.content;
  return asCard(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
}

async function pickModel(asked: string | undefined): Promise<string> {
  let names: string[];
  try {
    const reply = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    names = ((await reply.json()) as { models: { name: string }[] }).models.map((m) => m.name);
  } catch {
    throw new Error("Ollama isn't running on this computer. Open the Ollama app, or run `ollama serve`, and try again.");
  }
  if (asked) {
    if (!names.includes(asked)) throw new Error(`Ollama doesn't have ${asked}. Get it with \`ollama pull ${asked}\`.`);
    return asked;
  }
  const model = PREFERRED.find((m) => names.includes(m)) ?? names.find((m) => !/embed/i.test(m));
  if (!model) throw new Error("Ollama has no model to write with. Get one with `ollama pull qwen3.6:27b`.");
  return model;
}

// ── The run ──────────────────────────────────────────────────────────────────

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
  --dry-run           count the conversations, ask no model
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
  const draftsFile = path.join(values.out, `${lab}-drafts.jsonl`);
  const seenFile = path.join(values.out, `${lab}-seen.tsv`);
  const done = new Set(
    existsSync(seenFile) ? readFileSync(seenFile, "utf8").split("\n").map((l) => l.split("\t")[0]).filter(Boolean) : [],
  );

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
      card = await ask(model, c, false);
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
