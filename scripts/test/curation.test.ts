import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Regression tests for host attribution and listing scraping.
 * Every case here was a defect verified against live listing pages.
 *
 * Run: npm run test:curation
 */
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

(async () => {
  const { matchTierOneHost, matchTierOneHostName, resolveTierOneHost, computeCurationQualityScore } =
    await import("../../src/lib/scoring");

  console.log('an ordinary word must not pay out a host score from prose');
  // "(N)YC Alumni..." normalises to tokens `n yc`, so "NYC" was paying out
  // Y Combinator's full 35 points on a live listing.
  t('"(N)YC Alumni" no longer resolves to yc',
    matchTierOneHost("(N)YC Alumni + Founder Friends Monthly #16 by Rho and NYC Founders Club") === null,
    String(matchTierOneHost("(N)YC Alumni + Founder Friends Monthly #16 by Rho and NYC Founders Club")));
  for (const word of ["our primary goal", "a modal dialog", "extend your runway", "sierra time", "gamma rays"]) {
    t(`prose "${word}" is not a host`, matchTierOneHost(word) === null, String(matchTierOneHost(word)));
  }

  console.log('\nthe same names ARE valid when declared as the organiser');
  t('"Modal" declared', matchTierOneHostName(["Modal"]) === "modal");
  t('"Runway" declared', matchTierOneHostName(["Runway"]) === "runway");

  console.log("\nhosts Serena named that were previously absent");
  t('Clay Clubs -> clay', matchTierOneHostName(["Clay Clubs"]) === "clay");
  t('Claude Community Events -> claude', matchTierOneHostName(["Claude Community Events"]) === "claude");

  console.log("\npossessive calendar names must still match");
  // Normalising punctuation first turned this into "andrew s yeung s", which
  // no longer contained "andrew yeung", silently dropping a real host.
  t("Andrew's Yeung's Tech Events -> andrew yeung",
    matchTierOneHostName(["Andrew's Yeung's Tech Events"]) === "andrew yeung",
    String(matchTierOneHostName(["Andrew's Yeung's Tech Events"])));

  console.log("\na mention is not a host");
  const mention = {
    title: "Double Diamond Demo Night ft. Cursor, Vercel, and Jamey Gannon",
    description: "A demo night.",
    hostNames: ["Double Diamond"],
  };
  t("declared organiser wins over names in the title",
    resolveTierOneHost(mention) === null, String(resolveTierOneHost(mention)));
  t("a listing that declares organisers and matches none is NOT tier 1",
    resolveTierOneHost({ title: "Breakfast w/ First Round alum", description: "", hostNames: ["Rippling Startup Events Calendar"] }) === null);

  console.log("\nfalls back to prose only when nothing is declared");
  t("no declared hosts -> prose fallback still works",
    resolveTierOneHost({ title: "An evening with Anthropic", description: "", hostNames: [] }) === "anthropic");
  t("null hostNames -> prose fallback still works",
    resolveTierOneHost({ title: "An evening with Anthropic", description: "", hostNames: null }) === "anthropic");

  console.log("\nquality score reflects the declared host");
  const base = { title: "Dinner", description: "A dinner.", exclusivity: "capped" as const, format: "dinner" as const, outOfTown: false };
  const withHost = computeCurationQualityScore({ ...base, hostNames: ["Clay Clubs"] });
  const without = computeCurationQualityScore({ ...base, hostNames: ["Some Random Calendar"] });
  t("declared tier-1 host scores higher", withHost > without, `${withHost} vs ${without}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
