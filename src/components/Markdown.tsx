// A tiny markdown renderer for answers: headings, lists, paragraphs, code blocks, tables, quotes,
// rules, and inline bold, italics, code, links and bare web addresses. It builds React elements,
// so what people write is never parsed as HTML. From Proxenos (MIT, the same author); Thanos adds
// tables, and copy buttons on code and on the values people come to an answer for.

import type { ReactNode } from "react";

import { CodeBlock, Value } from "@/components/client";
import { isValue, VALUE } from "@/lib/values";

type Align = "left" | "right" | "center";

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "p" | "quote"; text: string }
  | { type: "code"; text: string; lang: string }
  | { type: "table"; head: string[]; align: Align[]; rows: string[][] }
  | { type: "hr" };

/** A table row's cells; a pipe written \| stays in its cell. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

const RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let code: { lang: string; lines: string[] } | null = null;
  let table: string[] = [];

  // Rows that turn out not to be a table (no rule under the first) are read as a paragraph.
  const endTable = () => {
    if (table.length >= 2 && RULE.test(table[1])) {
      const head = cells(table[0]);
      const align = cells(table[1]).map((c): Align => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : "left"));
      const rows = table.slice(2).map((r) => head.map((_, i) => cells(r)[i] ?? ""));
      blocks.push({ type: "table", head, align, rows });
    } else if (table.length) para.push(...table);
    table = [];
  };

  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (quote.length) blocks.push({ type: "quote", text: quote.join(" ") });
    if (list) blocks.push(list);
    para = [];
    quote = [];
    list = null;
  };

  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (code) {
      if (line.trim().startsWith("```")) {
        blocks.push({ type: "code", text: code.lines.join("\n"), lang: code.lang });
        code = null;
      } else code.lines.push(line);
      continue;
    }
    const t = line.trim();
    if (t.startsWith("|")) {
      if (!table.length) flush();
      table.push(t);
      continue;
    }
    endTable();
    let m: RegExpMatchArray | null;
    if (!t) flush();
    else if (t.startsWith("```")) {
      flush();
      // The word after the fence names the language: ```bash
      code = { lang: t.slice(3).trim().match(/^[\w+#.-]{1,20}/)?.[0] ?? "", lines: [] };
    } else if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      blocks.push({ type: "h", level: m[1].length, text: m[2] });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      blocks.push({ type: "hr" });
    } else if ((m = t.match(/^([-*+]|\d+[.)])\s+(.*)$/))) {
      const type = /^\d/.test(m[1]) ? "ol" : "ul";
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push(m[2]);
    } else if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += " " + t;
    } else if (t.startsWith(">")) {
      if (!quote.length) flush();
      quote.push(t.replace(/^>\s?/, ""));
    } else {
      if (list || quote.length) flush();
      para.push(t);
    }
  }
  if (code) blocks.push({ type: "code", text: code.lines.join("\n"), lang: code.lang });
  endTable();
  flush();
  return blocks;
}

// Bold, code, links and web addresses, then values written without backticks (a chart string, a
// path, a shared drive), then italics.
const INLINE = new RegExp(
  String.raw`(\*\*[^*]+\*\*|` + "`[^`]+`" + String.raw`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]|${VALUE}|\*[^*\s][^*]*\*)`,
  "g",
);

const LINK = "text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent";

function inline(text: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return <Value key={i} text={part.slice(1, -1)} />;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link) {
        if (/^\/(?!\/)/.test(link[2])) {
          return (
            <a key={i} href={link[2]} className={LINK}>
              {link[1]}
            </a>
          );
        }
        return /^https?:\/\//i.test(link[2]) ? (
          <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className={LINK}>
            {link[1]}
          </a>
        ) : (
          link[1]
        );
      }
      if (/^https?:\/\//i.test(part)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`${LINK} break-all`}>
            {part.replace(/^https?:\/\/(www\.)?/i, "")}
          </a>
        );
      }
      if (isValue(part)) return <Value key={i} text={part} />;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

// The page's own heading is the question, so an answer's biggest heading, # or ##, is an h2.
const HEADING = ["font-display text-xl", "font-display text-lg", "text-base font-semibold"];
const LEVEL = ["h2", "h3", "h4"] as const;
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

export function Markdown({ source, compact = false }: { source: string; compact?: boolean }) {
  // Prose keeps to a comfortable line, about 75 characters; code and tables may use the width.
  const measure = compact ? "" : "max-w-[34em]";
  const blocks = parse(source);
  const top = Math.min(...blocks.map((b) => (b.type === "h" ? b.level : 6)));
  return (
    <div className={compact ? "space-y-2 text-sm text-ink/90 leading-relaxed break-words" : "space-y-3 text-ink leading-relaxed break-words"}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h": {
            const level = Math.min(b.level - top, 2);
            const Tag = LEVEL[level];
            const size = compact ? "text-sm font-semibold" : HEADING[level];
            return (
              <Tag key={i} className={`${size} ${measure} ${i > 0 ? "pt-2" : ""}`}>
                {inline(b.text)}
              </Tag>
            );
          }
          case "ul":
            return (
              <ul key={i} className={`list-disc pl-6 space-y-1 marker:text-accent ${measure}`}>
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className={`list-decimal pl-6 space-y-1 marker:text-accent marker:num ${measure}`}>
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className={`border-l-2 border-accent/40 pl-4 text-muted ${measure}`}>
                {inline(b.text)}
              </blockquote>
            );
          case "code":
            return <CodeBlock key={i} code={b.text} lang={b.lang} />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead className="bg-surface-2">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} scope="col" className={`px-3 py-2 font-medium text-muted ${ALIGN[b.align[j] ?? "left"]}`}>
                          {inline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-t border-line">
                        {row.map((c, j) => (
                          <td key={j} className={`px-3 py-2 align-top ${ALIGN[b.align[j] ?? "left"]}`}>
                            {inline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
          default:
            return (
              <p key={i} className={measure}>
                {inline(b.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
