import { registrationStatusEnum } from "@/db/schema";

type Status = (typeof registrationStatusEnum)[number];

const STATUS_LABEL: Record<Status, string> = {
  pending: "Under review",
  approved: "Approved",
  waitlisted: "Waitlisted",
  declined: "Declined",
  attended: "Attended",
};

// On-palette paper/ink tints — deliberately not the generic emerald/amber/rose
// SaaS chips the host dashboard used, which clashed with the editorial system.
const STATUS_TONE: Record<Status, string> = {
  pending: "border-line bg-surface text-foreground-soft",
  approved: "border-accent/30 bg-accent-soft text-accent",
  waitlisted: "border-line bg-background text-foreground-soft",
  declined: "border-line bg-background text-foreground-soft/70",
  attended: "border-accent/30 bg-accent-soft text-accent",
};

export function StatusPill({ status }: { status: Status }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.pending;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}
