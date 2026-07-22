import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  boolean,
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

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
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
  category: text("category").$type<(typeof eventCategoryEnum)[number]>(),
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
});

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
  category: text("category").$type<(typeof eventCategoryEnum)[number]>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

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
