"use client";

import { Mail } from "lucide-react";

import { useFormAction } from "@/components/client";
import { BUTTON, Field, INPUT, Note, PRIMARY } from "@/components/ui";
import {
  deleteLabAction,
  inviteToLab,
  requestLink,
  saveLab,
  saveMember,
  saveName,
  startLab,
  type FormState,
  type LinkState,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

// The smaller forms: signing in, a name, a lab's details, a member's role. Each keeps what was
// typed when the server says no (useFormAction), and says so when it saved.

export function LoginForm({ next }: { next: string }) {
  const [state, formProps, pending] = useFormAction<LinkState>(requestLink, {});
  if (state.sent) {
    return (
      <div className="card fade-in p-5">
        <Mail size={20} className="text-accent" aria-hidden="true" />
        <p className="title-2 mt-3">Check your email</p>
        <p className="mt-2 leading-relaxed text-muted">
          A sign-in link is on its way to <span className="text-ink">{state.sent}</span>. It works once, for the next 20 minutes.
        </p>
        {state.link && (
          <Note className="mt-4">
            This copy of Thanos runs on this computer and sends no email, so here is the link itself:{" "}
            <a href={state.link} className="text-accent underline underline-offset-2">
              sign in as {state.sent}
            </a>
            .
          </Note>
        )}
      </div>
    );
  }
  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Your email" hint="The one your lab knows you by. Thanos sends a link; there's no password.">
        <input name="email" type="email" required autoComplete="email" placeholder="you@university.edu" className={INPUT} />
      </Field>
      {state.error && <Note tone="bad">{state.error}</Note>}
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Sending…" : "Send me a sign-in link"}
      </button>
    </form>
  );
}

export function NameForm({ name, next }: { name: string; next?: string }) {
  const [state, formProps, pending] = useFormAction<FormState>(saveName, {});
  return (
    <form {...formProps} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Your name" hint="Shown beside what you ask and answer, for as long as the lab keeps it.">
        <input name="name" defaultValue={name} required maxLength={80} autoComplete="name" className={INPUT} />
      </Field>
      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.saved && <Note tone="ok">Saved.</Note>}
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Saving…" : next ? "Continue" : "Save"}
      </button>
    </form>
  );
}

export interface LabValues {
  slug: string;
  name: string;
  institution: string;
  website: string;
  github: string;
  domains: string;
}

/** A lab's details: to start one at /new, or for its admins to change in Settings. */
export function LabForm({ lab, readOnly = false }: { lab?: LabValues; readOnly?: boolean }) {
  const [state, formProps, pending] = useFormAction<FormState>(lab ? saveLab : startLab, {});
  return (
    <form {...formProps} className="space-y-4">
      {lab && <input type="hidden" name="lab" value={lab.slug} />}
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" defaultValue={lab?.name} required maxLength={80} placeholder="Murray Lab" className={INPUT} />
          </Field>
          <Field label="Institution">
            <input name="institution" defaultValue={lab?.institution} maxLength={80} placeholder="Dartmouth" className={INPUT} />
          </Field>
        </div>
        {!lab && (
          <Field label="Address" hint="Where the lab lives in Thanos, like /murray. Left empty, it comes from the name.">
            <input name="slug" maxLength={40} placeholder="murray" className={cn(INPUT, "num")} />
          </Field>
        )}
        {!lab && (
          <Field
            label="Its first admin"
            hint="Starting it for someone else, like its PI? Give their email: they become its admin when they sign in, and you stay out of the lab. Left empty, you're its admin."
          >
            <input name="admin" type="email" maxLength={254} autoComplete="off" placeholder="pi@university.edu" className={INPUT} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website">
            <input name="website" defaultValue={lab?.website} maxLength={200} placeholder="https://…" className={INPUT} />
          </Field>
          <Field label="GitHub" hint="The lab's organization, or several, separated by commas.">
            <input name="github" defaultValue={lab?.github} maxLength={200} placeholder="murraylab" className={INPUT} />
          </Field>
        </div>
        <Field
          label="Who can join with the invite link"
          hint="Email domains, separated by commas, like dartmouth.edu. Left empty, anyone with the link can join."
        >
          <input name="domains" defaultValue={lab?.domains} maxLength={200} placeholder="Any email" className={INPUT} />
        </Field>
      </fieldset>
      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.saved && <Note tone="ok">Saved.</Note>}
      {!readOnly && (
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : lab ? "Save" : "Start the lab"}
        </button>
      )}
    </form>
  );
}

/** One member's role and title, for an admin; someone's own title, for them. */
export function MemberForm({
  slug,
  personId,
  role,
  title,
  canSetRole,
}: {
  slug: string;
  personId: string;
  role: string;
  title: string;
  canSetRole: boolean;
}) {
  const [state, formProps, pending] = useFormAction<FormState>(saveMember, {});
  return (
    <form {...formProps} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="lab" value={slug} />
      <input type="hidden" name="person" value={personId} />
      <label className="min-w-0 flex-1">
        <span className="sr-only">Title</span>
        <input
          name="title"
          defaultValue={title}
          maxLength={60}
          placeholder="PhD student, postdoc, lab manager…"
          className={cn(INPUT, "py-1.5 text-sm")}
        />
      </label>
      {canSetRole && (
        <label>
          <span className="sr-only">Role</span>
          <select name="role" defaultValue={role} className={cn(INPUT, "w-auto py-1.5 text-sm")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="alum">Alum</option>
          </select>
        </label>
      )}
      <button type="submit" disabled={pending} className="rounded-xl border border-line-strong bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3">
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <p className="w-full text-sm text-bad-ink">{state.error}</p>}
      {state.saved && !pending && <p className="w-full text-sm text-ok-ink">Saved.</p>}
    </form>
  );
}

/** Invites people by email, as members or admins: they're in the next time they sign in. */
export function InviteForm({ slug }: { slug: string }) {
  const [state, formProps, pending] = useFormAction<FormState>(inviteToLab, {});
  return (
    <form {...formProps} className="space-y-3">
      <input type="hidden" name="lab" value={slug} />
      <Field label="Invite by email" hint="One address or several, separated by commas. They're in the lab the next time they sign in with it.">
        <input name="emails" required maxLength={4000} autoComplete="off" placeholder="new.student@university.edu" className={INPUT} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <label>
          <span className="sr-only">As</span>
          <select name="role" defaultValue="member" className={cn(INPUT, "w-auto py-2 text-sm")}>
            <option value="member">As members</option>
            <option value="admin">As admins</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.saved && !pending && <Note tone="ok">Invited.</Note>}
    </form>
  );
}

/** Deletes the lab, once its admin has typed its address. */
export function DeleteLabForm({ slug }: { slug: string }) {
  const [state, formProps, pending] = useFormAction<FormState>(deleteLabAction, {});
  return (
    <form {...formProps} className="space-y-3">
      <input type="hidden" name="lab" value={slug} />
      <Field label={`Type ${slug} to delete the lab`}>
        <input name="confirm" required autoComplete="off" spellCheck={false} className={cn(INPUT, "num")} />
      </Field>
      {state.error && <Note tone="bad">{state.error}</Note>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-bad-line bg-bad-bg px-3.5 py-2 text-sm text-bad-ink transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete the lab and everything in it"}
      </button>
    </form>
  );
}

