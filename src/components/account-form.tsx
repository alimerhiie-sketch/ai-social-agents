import type { Account } from "@/lib/types";
import { FORMATS, LANGUAGES, PLATFORMS, TONES, VIDEO_STYLES } from "@/lib/options";
import { SubmitButton } from "./client";

const DEFAULT_FORMATS = ["reel", "carousel"];
const DEFAULT_STYLES = ["kinetic-type", "broll-voiceover"];

export function AccountForm({ account, action, submitLabel }: { account?: Account; action: (fd: FormData) => Promise<void>; submitLabel: string }) {
  const a = account;
  return (
    <form action={action} className="space-y-10">
      <Group title="The account" hint="Who it's for and what it's about. The more specific the niche, the better the agents do.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name (internal)">
            <input name="name" required defaultValue={a?.name} placeholder="e.g. Beirut Eats" className="input" />
          </Field>
          <Field label="Language">
            <select name="language" defaultValue={a?.language ?? "English"} className="input">
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Niche">
          <input
            name="niche"
            required
            defaultValue={a?.niche}
            placeholder="e.g. Hidden food spots and street food in Lebanon, under $10"
            className="input"
          />
        </Field>
        <Field label="Target audience">
          <input name="audience" defaultValue={a?.audience} placeholder="e.g. 18–30, students and young workers in Beirut who eat out on a budget" className="input" />
        </Field>
        <Field label="Anything else the agents should know">
          <textarea name="description" rows={3} defaultValue={a?.description} placeholder="Angle, personality, what makes it different, goals…" className="input resize-y" />
        </Field>
      </Group>

      <Group title="Platforms">
        <Chips name="platforms" options={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} selected={a?.platforms ?? ["instagram", "tiktok"]} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Instagram handle (once created)">
            <input name="ig_handle" defaultValue={a?.ig_handle} placeholder="@handle" className="input" />
          </Field>
          <Field label="TikTok handle (once created)">
            <input name="tiktok_handle" defaultValue={a?.tiktok_handle} placeholder="@handle" className="input" />
          </Field>
        </div>
      </Group>

      <Group title="Content type" hint="What this account is allowed to make. The Strategist only plans within these.">
        <Field label="Formats">
          <Chips name="formats" options={FORMATS} selected={a?.formats ?? DEFAULT_FORMATS} />
        </Field>
        <Field label="Video styles">
          <Chips name="video_styles" options={VIDEO_STYLES} selected={a?.video_styles ?? DEFAULT_STYLES} />
        </Field>
        <Field label="Tone">
          <Chips name="tones" options={TONES.map((t) => ({ id: t, label: t }))} selected={a?.tones ?? ["Educational"]} />
        </Field>
        <Field label="Posts per week">
          <input name="posts_per_week" type="number" min={1} max={21} defaultValue={a?.posts_per_week ?? 5} className="input w-28" />
        </Field>
      </Group>

      <Group title="Brand and guardrails">
        <Field label="Brand colours (hex, comma separated)">
          <input name="brand_colors" defaultValue={a?.brand_colors.join(", ")} placeholder="#1330E0, #0B1FA8, #FFFFFF" className="input" />
        </Field>
        <Field label="Topics to avoid">
          <input name="avoid" defaultValue={a?.avoid} placeholder="e.g. politics, religion, competitor names" className="input" />
        </Field>
        <Field label="Accounts you like (inspiration)">
          <input name="inspiration" defaultValue={a?.inspiration} placeholder="@account1, @account2" className="input" />
        </Field>
      </Group>

      <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {!a ? (
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" name="start_strategy" defaultChecked className="size-4 accent-[var(--color-accent)]" />
            Have the Strategist build the strategy right away
          </label>
        ) : (
          <span className="text-xs text-dim">Changes apply to the next agent run.</span>
        )}
        <SubmitButton className="btn btn-primary" pending="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-6 md:grid-cols-[200px_1fr]">
      <div>
        <legend className="text-sm font-medium text-fg">{title}</legend>
        {hint && <p className="mt-1 text-xs leading-relaxed text-dim">{hint}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Chips({ name, options, selected }: { name: string; options: { id: string; label: string; hint?: string }[]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.id} className="chip" title={o.hint}>
          <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} />
          <span>{o.label}</span>
          {o.hint && <span className="hidden text-[11px] text-dim lg:inline">· {o.hint}</span>}
        </label>
      ))}
    </div>
  );
}
