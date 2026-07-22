import { config } from "dotenv";
config({ path: ".env.local" });

const EVENT_ID = "35353cfe-17e5-495b-92cd-ca56f597db37"; // Founder Mahjong Night

async function main() {
  const { db } = await import("../src/db");
  const { events } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .update(events)
    .set({
      criteriaWeights: JSON.stringify({
        profile_type_match: {
          weight: 5,
          target_types: ["founder"],
          adjacent_types: ["operator"],
        },
        profile_completeness: { weight: 1 },
      }),
    })
    .where(eq(events.id, EVENT_ID));

  console.log("Updated criteria_weights for event", EVENT_ID);
}

main().then(() => process.exit(0));
