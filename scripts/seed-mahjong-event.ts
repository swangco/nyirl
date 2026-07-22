import { config } from "dotenv";
config({ path: ".env.local" });

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

async function main() {
  const { db } = await import("../src/db");
  const { events } = await import("../src/db/schema");

  const [event] = await db
    .insert(events)
    .values({
      hostId: HOST_USER_ID,
      title: "Founder Mahjong Night",
      description:
        "Mahjong game night alongside other founders to chill and relax for the night.",
      date: new Date("2026-08-06T17:30:00-04:00"),
      location: null,
      capacity: 16,
      idealAttendeeBrief:
        "A casual night for founders to unwind and play mahjong with peers going through the same grind. Ideal attendees are actively building a startup at any stage, here to relax and connect informally — not to pitch, network hard, or recruit. Low-key and welcoming over impressive.",
      criteriaWeights: JSON.stringify({
        profile_type_match: {
          weight: 5,
          target_types: ["founder"],
          adjacent_types: ["operator"],
        },
        profile_completeness: { weight: 1 },
      }),
      typeCaps: JSON.stringify({
        investor: 0.15,
        operator: 0.25,
      }),
      excludeRules: JSON.stringify([
        "recruiter",
        "service or sales pitch",
        "not currently building a company",
      ]),
    })
    .returning();

  console.log("Created event:", event.id, event.title);
}

main().then(() => process.exit(0));
