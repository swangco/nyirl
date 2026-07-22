import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  boolean,
  unique,
  index,
  vector,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// --- Auth.js tables (shape required by @auth/drizzle-adapter) ---

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// --- NY IRL domain tables ---

export const profileTypeEnum = [
  "founder",
  "operator",
  "investor",
  "engineer",
  "marketing_gtm",
  "job_seeking",
  "other",
] as const;

export const founderStageEnum = [
  "idea",
  "pre_seed",
  "seed",
  "series_a_plus",
] as const;

export const eventCategoryEnum = [
  "founders",
  "engineers",
  "vcs_investors",
  "operators",
  "ai",
  "health_fitness",
  "robotics",
  "hackathons",
  "marketing_gtm",
  "design",
  "networking",
] as const;

// --- Curation Quality Score inputs (curatedLinks only — see computeCurationQualityScore) ---
// Host tier isn't a stored field: it's detected from title/description text against
// the TIER_ONE_HOSTS allowlist in lib/scoring.ts, same mechanism computeLinkFitScore
// already uses. These two fields plus outOfTown are the parts a human has to judge.

export const linkExclusivityEnum = ["open", "capped", "invite_only"] as const;

export const linkFormatEnum = [
  "expo",
  "mixer",
  "workshop",
  "hackathon",
  "dinner",
] as const;

// --- Optional richer-matching fields (see computeLinkFitScore) ---
// All three are optional extras, never required for "profile complete" —
// gender and age are sensitive enough that gating access to recommendations
// on disclosing them isn't acceptable, so they only ever sharpen a score,
// never gate one.

export const genderIdentityEnum = ["woman", "man", "non_binary", "prefer_not_to_say"] as const;

export const ageRangeEnum = ["under_25", "25_34", "35_44", "45_54", "55_plus"] as const;

/** Fixed vocabulary (not freeform) so it can overlap-match against event/link
 * tags deterministically — same reasoning as why category is a fixed enum. */
export const interestTagEnum = [
  "pickleball",
  "pilates",
  "boxing",
  "yoga",
  "running",
  "tennis",
  "golf",
  "cycling",
  "strength_training",
  "wine",
  "live_music",
  "art",
] as const;

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  headshotUrl: text("headshot_url"),
  linkedinUrl: text("linkedin_url"),
  resumeUrl: text("resume_url"),
  resumeTextExtracted: text("resume_text_extracted"),
  profileType: text("profile_type").array().$type<(typeof profileTypeEnum)[number][]>(),
  company: text("company"),
  title: text("title"),
  bioBlurb: text("bio_blurb"),
  tags: text("tags").array(),
  stage: text("stage").$type<(typeof founderStageEnum)[number]>(), // founders only
  fundingRaised: text("funding_raised"), // founders only — free text, e.g. "$1.2M seed"
  checksWritten: integer("checks_written"), // investors only — rough count
  genderIdentity: text("gender_identity").$type<(typeof genderIdentityEnum)[number]>(),
  ageRange: text("age_range").$type<(typeof ageRangeEnum)[number]>(),
  interests: text("interests").array().$type<(typeof interestTagEnum)[number][]>(),
  // Semantic-matching vector over the profile document (bio + role + resume +
  // interests). Nullable: populated on save when OPENAI_API_KEY is set; scoring
  // falls back to keyword fit when absent. See lib/embeddings.ts.
  embedding: vector("embedding", { dimensions: 1536 }),
  digestOptOut: boolean("digest_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  hostId: text("host_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date", { mode: "date" }).notNull(),
  location: text("location"),
  capacity: integer("capacity"),
  idealAttendeeBrief: text("ideal_attendee_brief"),
  criteriaWeights: text("criteria_weights"), // JSON string: { criterion: weight }
  typeCaps: text("type_caps"), // JSON string: { profile_type: max_share }
  excludeRules: text("exclude_rules"), // JSON string: string[]
  category: text("category").$type<(typeof eventCategoryEnum)[number]>().notNull(),
  tags: text("tags").array(),
  // Semantic-matching vector over the event document (see lib/embeddings.ts). Nullable.
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const registrationStatusEnum = [
  "pending",
  "approved",
  "waitlisted",
  "declined",
  "attended",
] as const;

export const registrations = pgTable("registrations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status")
    .$type<(typeof registrationStatusEnum)[number]>()
    .notNull()
    .default("pending"),
  structuralScore: integer("structural_score"),
  semanticScore: integer("semantic_score"),
  aiRationale: text("ai_rationale"),
  compositeScore: integer("composite_score"),
  hostNotes: text("host_notes"),
  appliedAt: timestamp("applied_at", { mode: "date" }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { mode: "date" }),
}, (t) => [
  // One application per person per event — makes the apply flow's check-then-
  // insert race-safe (a concurrent double-submit hits this instead of creating
  // a duplicate row).
  unique("registrations_event_user_unique").on(t.eventId, t.userId),
]);

export const connectionMetStatusEnum = ["met", "missed", "unknown"] as const;

export const connections = pgTable("connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userAId: text("user_a_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userBId: text("user_b_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  metStatus: text("met_status")
    .$type<(typeof connectionMetStatusEnum)[number]>()
    .notNull()
    .default("unknown"),
  privateNotes: text("private_notes"),
  followUpFlag: boolean("follow_up_flag").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const curatedLinks = pgTable("curated_links", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  addedBy: text("added_by")
    .notNull()
    .references(() => users.id),
  sourceUrl: text("source_url").notNull(),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  category: text("category").$type<(typeof eventCategoryEnum)[number]>().notNull(),
  eventDate: timestamp("event_date", { mode: "date" }),
  exclusivity: text("exclusivity")
    .$type<(typeof linkExclusivityEnum)[number]>()
    .notNull()
    .default("capped"),
  format: text("format").$type<(typeof linkFormatEnum)[number]>().notNull().default("mixer"),
  outOfTown: boolean("out_of_town").notNull().default(false),
  tags: text("tags").array(),
  // Semantic-matching vector over the link document (see lib/embeddings.ts). Nullable.
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const digestItemKindEnum = ["event", "link"] as const;

/** Tracks what's already been emailed to whom, so the weekly digest never
 * repeats an item — see lib/digest.ts. */
export const digestSends = pgTable(
  "digest_sends",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemKind: text("item_kind").$type<(typeof digestItemKindEnum)[number]>().notNull(),
    itemId: text("item_id").notNull(),
    sentAt: timestamp("sent_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.itemKind, t.itemId)],
);

// --- Interaction logging (Stage 0 of the recommendation system) ---
// Every impression/click/apply/digest event, so ranking can eventually learn
// from behavior instead of heuristics alone, and so curation effort is
// measurable. Deliberately append-only and denormalized (itemKind + itemId
// rather than FKs) so a deleted event/link doesn't erase its history.

export const interactionActionEnum = [
  "impression",
  "click",
  "apply",
  "digest_open",
  "digest_click",
] as const;

export const interactionSourceEnum = [
  "homepage",
  "category",
  "profile",
  "digest",
  "apply",
] as const;

export const interactionEvents = pgTable(
  "interaction_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Nullable: signed-out impressions and digest-open pixels have no session.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    itemKind: text("item_kind").$type<(typeof digestItemKindEnum)[number]>().notNull(),
    itemId: text("item_id").notNull(),
    action: text("action").$type<(typeof interactionActionEnum)[number]>().notNull(),
    source: text("source").$type<(typeof interactionSourceEnum)[number]>().notNull(),
    // Free-form JSON string for rank position, score at render time, etc.
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("interaction_events_user_idx").on(t.userId),
    index("interaction_events_item_idx").on(t.itemKind, t.itemId),
    index("interaction_events_action_idx").on(t.action),
  ],
);

// --- Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  registrations: many(registrations),
  hostedEvents: many(events),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  host: one(users, {
    fields: [events.hostId],
    references: [users.id],
  }),
  registrations: many(registrations),
  connections: many(connections),
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [registrations.userId],
    references: [users.id],
  }),
}));
