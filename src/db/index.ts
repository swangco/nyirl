import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Resolve the Postgres connection string.
 *
 * Different hosts expose this under different names, so check the common
 * aliases rather than relying on DATABASE_URL alone.
 */
function resolveConnectionString(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_POSTGRES_URL,
    process.env.NEON_DATABASE_URL,
  ];

  const connectionString = candidates.find(
    (value) => typeof value === "string" && value.length > 0,
  );

  if (!connectionString) {
    throw new Error(
      "Missing Postgres connection string. Set DATABASE_URL (or POSTGRES_URL) " +
        "in your environment — e.g. the connection string from your Neon project.",
    );
  }

  return connectionString;
}

export const db = drizzle(neon(resolveConnectionString()), { schema });
