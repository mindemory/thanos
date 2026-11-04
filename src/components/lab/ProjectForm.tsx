"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useFormAction } from "@/components/client";
import { useLab } from "@/components/lab/LabProvider";
import { BUTTON, Field, INPUT, Note, PRIMARY, QUIET } from "@/components/ui";
import { saveProject, type FormState } from "@/lib/actions";
import { repoOf } from "@/lib/github";
import type { PersonOption, ProjectValues } from "@/lib/projects";
import { finished, STATUSES } from "@/lib/timeline";
import { cn } from "@/lib/utils";

interface Pick {
  value: string;
  label: string;
  free: boolean; // typed in rather than picked from the list
}

/**
 * Picking several things: each choice a chip with a button to take it off, a list to pick from,
 * and a box for one that isn't on the list. Every chip is a hidden field, so the form sends them
 * as they are, before the page is interactive too. So is the box: what's typed there and not yet
 * added is saved with the rest, rather than lost.
 */
function Picks({
  legend,
  hint,
  name,
  freeName,
  options,
  initial,
  pickLabel,
  freeLabel,
  freePlaceholder,
  freeNote,
  tidy = (text) => text,
  mono = false,
}: {
  legend: string;
  hint?: string;
  name: string;
  freeName: string;
  options: { value: string; label: string; group?: string }[];
  initial: Pick[];
  pickLabel: string;
  freeLabel: string;
  freePlaceholder: string;
  freeNote?: string; // what a typed-in choice is, shown on its chip: "not in Thanos"
  tidy?: (text: string) => string; // what a typed-in choice is saved as
  mono?: boolean;
}) {
  const [picks, setPicks] = useState(initial);
  const [typed, setTyped] = useState("");
  const add = (pick: Pick) =>
    setPicks((list) => (list.some((p) => p.free === pick.free && p.value.toLowerCase() === pick.value.toLowerCase()) ? list : [...list, pick]));
  const addTyped = () => {
    const text = tidy(typed.trim());
    if (!text) return;
    // Typing the name of something on the list picks it.
    const known = options.find((o) => o.label.toLowerCase() === text.toLowerCase());
    add(known ? { value: known.value, label: known.label, free: false } : { value: text, label: text, free: true });
    setTyped("");
  };
  const left = options.filter((o) => !picks.some((p) => !p.free && p.value === o.value));
  const groups = [...new Set(left.map((o) => o.group ?? ""))];

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink">{legend}</legend>
      {picks.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {picks.map((p) => (
            <li
              key={`${p.free}:${p.value}`}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border border-line-strong bg-surface-2 py-0.5 pl-2.5 pr-1 text-sm text-ink",
                p.free && freeNote && "border-dashed",
              )}
            >
              <span className={cn("min-w-0 truncate", mono && "code")}>{p.label}</span>
              {p.free && freeNote && <span className="flex-shrink-0 text-xs text-faint">{freeNote}</span>}
              <input type="hidden" name={p.free ? freeName : name} value={p.value} />
              <button
                type="button"
                onClick={() => setPicks((list) => list.filter((x) => x !== p))}
                aria-label={`Take off ${p.label}`}
                className="flex-shrink-0 rounded-full p-0.5 text-faint transition-colors hover:bg-surface-3 hover:text-ink"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {left.length > 0 && (
          <label className="min-w-[12rem] flex-1">
            <span className="sr-only">{pickLabel}</span>
            <select
              value=""
              onChange={(e) => {
                const o = options.find((x) => x.value === e.target.value);
                if (o) add({ value: o.value, label: o.label, free: false });
              }}
              className={cn(INPUT, "py-2 text-sm")}
            >
              <option value="">{pickLabel}…</option>
              {groups.map((g) => {
                const items = left
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ));
                return g ? (
                  <optgroup key={g} label={g}>
                    {items}
                  </optgroup>
                ) : (
                  items
                );
              })}
            </select>
          </label>
        )}
        <div className="flex min-w-[12rem] flex-1 gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{freeLabel}</span>
            <input
              name={freeName}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // add it, rather than send the form
                  addTyped();
                }
              }}
              placeholder={freePlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={cn(INPUT, "py-2 text-sm", mono && "code")}
            />
          </label>
          <button type="button" onClick={addTyped} className={cn(BUTTON, "py-2")}>
            Add
          </button>
        </div>
      </div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </fieldset>
  );
}

const YEAR_FIELD = cn(INPUT, "num disabled:opacity-50");

/** A project's fields, for starting one, changing one, or keeping a draft. */
export function ProjectFields({ values, people, repos }: { values: ProjectValues; people: PersonOption[]; repos: string[] }) {
  const [status, setStatus] = useState(values.status);
  const ends = finished(status);
  return (
    <div className="space-y-5">
      <Field label="Name">
        <input name="name" defaultValue={values.name} required minLength={2} maxLength={100} placeholder="Visual search in older adults" className={INPUT} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Started">
          <input name="started" defaultValue={values.started ?? ""} inputMode="numeric" maxLength={4} placeholder="2023" className={YEAR_FIELD} />
        </Field>
        <Field label="Ended" hint={ends ? undefined : "Once it's done or published."}>
          <input
            name="ended"
            defaultValue={values.ended ?? ""}
            disabled={!ends}
            inputMode="numeric"
            maxLength={4}
            placeholder={ends ? "2025" : ""}
            className={YEAR_FIELD}
          />
        </Field>
      </div>
      <Field label="What it is" hint="A few sentences: what it asks or builds, and how. Markdown works. The details can go in cards about it.">
        <textarea name="summary" defaultValue={values.summary} rows={4} maxLength={2000} className={cn(INPUT, "leading-relaxed")} />
      </Field>
      <Picks
        legend="People on it"
        hint="Pick people from the lab, alumni too. Someone who isn't in Thanos can go in by name."
        name="people"
        freeName="others"
        options={people.map((p) => ({ value: p.id, label: p.name, group: p.role === "alum" ? "Alumni" : "In the lab" }))}
        initial={[...values.people.map((p) => ({ value: p.id, label: p.name, free: false })), ...values.others.map((n) => ({ value: n, label: n, free: true }))]}
        pickLabel="Add someone from the lab"
        freeLabel="Someone not in Thanos"
        freePlaceholder="Someone not in Thanos"
        freeNote="not in Thanos"
      />
      <Picks
        legend="Code"
        hint="Repositories from the lab's Code page, or any other on GitHub, as owner/name or its link."
        name="repos"
        freeName="repos"
        options={repos.map((r) => ({ value: r, label: r }))}
        initial={values.repos.map((r) => ({ value: r, label: r, free: !repos.includes(r) }))}
        pickLabel="Add one of the lab's repositories"
        freeLabel="Another repository, as owner/name"
        freePlaceholder="owner/name"
        tidy={(text) => repoOf(text) ?? text}
        mono
      />
      <Field label="Where its data lives" hint="One place a line: a path on the cluster or a server, a shared drive, a link. Each gets a copy button.">
        <textarea
          name="data"
          defaultValue={values.data.join("\n")}
          rows={3}
          spellCheck={false}
          placeholder="/lab/data/project/raw"
          className={cn(INPUT, "code text-sm leading-relaxed")}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slack channel" hint="#name, or a link to it.">
          <input name="slack" defaultValue={values.slack} maxLength={200} spellCheck={false} placeholder="#project" className={cn(INPUT, "code")} />
        </Field>
        <Field label="Papers" hint="DOIs, one a line, or their links. Thanos asks doi.org for each one's title and year.">
          <textarea
            name="papers"
            defaultValue={values.papers.join("\n")}
            rows={2}
            spellCheck={false}
            placeholder="10.1038/…"
            className={cn(INPUT, "code text-sm leading-relaxed")}
          />
        </Field>
      </div>
    </div>
  );
}

function joinKinds(kinds: string[]): string {
  return kinds.length < 2 ? kinds.join("") : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
}

/** Asks before keeping something that looks like a secret, as a card's form does. */
export function SecretNote({ kinds, pending, label }: { kinds: string[]; pending: boolean; label: string }) {
  return (
    <Note tone="warn">
      <p className="font-medium">This looks like it has {joinKinds(kinds)} in it.</p>
      <p className="mt-1">
        Everyone in the lab can read Thanos, including people who join years from now. It&apos;s safer to say who holds it and how to ask
        them. If it really belongs here, {label.toLowerCase()}.
      </p>
      <button type="submit" name="confirm" value="yes" disabled={pending} className={cn(BUTTON, "mt-3")}>
        {label}
      </button>
    </Note>
  );
}

/** Starting a project, or changing one: anyone in the lab can, and every version is kept. */
export function ProjectForm({
  project,
  values,
  people,
  repos,
}: {
  project?: { id: string; slug: string };
  values: ProjectValues;
  people: PersonOption[];
  repos: string[];
}) {
  const { slug } = useLab();
  const [state, formProps, pending] = useFormAction<FormState>(saveProject, {});
  return (
    <form {...formProps} className="space-y-5">
      <input type="hidden" name="lab" value={slug} />
      {project && <input type="hidden" name="id" value={project.id} />}
      <ProjectFields values={values} people={people} repos={repos} />
      {project && (
        <Field label="What changed? (optional)">
          <input name="note" maxLength={200} placeholder="Sent the paper out for review" className={INPUT} />
        </Field>
      )}
      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.sensitive && <SecretNote kinds={state.sensitive} pending={pending} label="Save anyway" />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : project ? "Save changes" : "Start the project"}
        </button>
        <Link href={project ? `/${slug}/p/${project.slug}` : `/${slug}/projects`} className={QUIET}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
