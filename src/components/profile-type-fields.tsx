"use client";

import { useState } from "react";
import type { founderStageEnum, profileTypeEnum } from "@/db/schema";

const PROFILE_TYPE_LABELS: Record<(typeof profileTypeEnum)[number], string> = {
  founder: "Founder",
  operator: "Operator",
  investor: "Investor",
  engineer: "Engineer",
  marketing_gtm: "Marketing / GTM",
  job_seeking: "Job-seeking",
  other: "Other",
};

const STAGE_LABELS: Record<(typeof founderStageEnum)[number], string> = {
  idea: "Idea stage",
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a_plus: "Series A+",
};

const inputClass =
  "rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-medium text-foreground";

// The checkbox row and the type-conditional fields used to be one component
// with its own internal selection state. /apply (§A6) needs to place them in
// two different form sections while still reacting to the same selection, so
// the state is lifted into these two controlled pieces; ProfileTypeFields
// below composes them back into the original single unit for /profile, which
// keeps that page's markup and behavior unchanged.
export function ProfileTypeSelect({
  profileTypeEnum: types,
  defaultTypes,
  selected,
  onChange,
}: {
  profileTypeEnum: readonly string[];
  defaultTypes: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className={labelClass}>Profile type</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {types.map((type) => (
          <label
            key={type}
            className="flex min-h-10 items-center gap-2.5 text-sm text-foreground-soft has-checked:text-foreground"
          >
            <input
              type="checkbox"
              name="profileType"
              value={type}
              defaultChecked={defaultTypes.includes(type)}
              className="h-4 w-4 accent-accent"
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(type);
                else next.delete(type);
                onChange(next);
              }}
            />
            {PROFILE_TYPE_LABELS[type as (typeof profileTypeEnum)[number]]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileTypeConditionalFields({
  founderStageEnum: stages,
  selected,
  defaultStage,
  defaultFundingRaised,
  defaultChecksWritten,
}: {
  founderStageEnum: readonly string[];
  selected: Set<string>;
  defaultStage: string | null;
  defaultFundingRaised: string | null;
  defaultChecksWritten: number | null;
}) {
  const isFounder = selected.has("founder");
  const isInvestor = selected.has("investor");

  if (!isFounder && !isInvestor) return null;

  return (
    <>
      {isFounder && (
        <div className="grid grid-cols-1 gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Stage</span>
            <select name="stage" defaultValue={defaultStage ?? ""} className={inputClass}>
              <option value="">Select stage</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage as (typeof founderStageEnum)[number]]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Funding raised</span>
            <input
              name="fundingRaised"
              placeholder="e.g. $1.2M seed, or none yet"
              defaultValue={defaultFundingRaised ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {isInvestor && (
        <label className="flex flex-col gap-1.5 rounded-md border border-line bg-surface p-4">
          <span className={labelClass}>Checks written (roughly how many)</span>
          <input
            name="checksWritten"
            type="number"
            min={0}
            placeholder="e.g. 12"
            defaultValue={defaultChecksWritten ?? ""}
            className={inputClass}
          />
        </label>
      )}
    </>
  );
}

export function ProfileTypeFields({
  profileTypeEnum: types,
  founderStageEnum: stages,
  defaultTypes,
  defaultStage,
  defaultFundingRaised,
  defaultChecksWritten,
}: {
  profileTypeEnum: readonly string[];
  founderStageEnum: readonly string[];
  defaultTypes: string[];
  defaultStage: string | null;
  defaultFundingRaised: string | null;
  defaultChecksWritten: number | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultTypes));

  return (
    <>
      <ProfileTypeSelect
        profileTypeEnum={types}
        defaultTypes={defaultTypes}
        selected={selected}
        onChange={setSelected}
      />
      <ProfileTypeConditionalFields
        founderStageEnum={stages}
        selected={selected}
        defaultStage={defaultStage}
        defaultFundingRaised={defaultFundingRaised}
        defaultChecksWritten={defaultChecksWritten}
      />
    </>
  );
}
