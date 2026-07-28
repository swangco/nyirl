import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Regression tests for src/lib/cohort.ts. Every case here is a concrete failure
 * an adversarial design review constructed against an earlier version of this
 * module — they exist so those specific breakages cannot come back.
 *
 * Run: npx tsx scripts/test/cohort.test.ts
 */
(async()=>{
  const c=await import("../../src/lib/cohort");
  let pass=0,fail=0;
  const t=(name:string,cond:boolean,detail="")=>{cond?pass++:fail++;console.log(`  ${cond?"PASS":"FAIL"}  ${name}${detail?"  ("+detail+")":""}`);};

  console.log("critic case 1: cap must HOLD when oversubscribed (was 11/16 investors vs 15% cap)");
  const many=[...Array(25)].map((_,i)=>({registrationId:`inv${i}`,primaryType:"investor",score:100-i}))
    .concat([...Array(5)].map((_,i)=>({registrationId:`f${i}`,primaryType:"founder",score:50-i})));
  const r1=c.selectCohort(many,{capacity:16,caps:{investor:0.15}});
  const invAdmitted=r1.admit.filter(id=>id.startsWith("inv")).length;
  t("investors capped at 2 seats",invAdmitted===2,`admitted ${invAdmitted}`);
  t("unused seats surfaced, not silently reused",r1.unusedSeats>0,`unusedSeats=${r1.unusedSeats}`);

  console.log("critic case 2: 0.15 x 6 must not become a total ban");
  t("small room still seats 1",c.seatsForCap(0.15,6)===1,`seats=${c.seatsForCap(0.15,6)}`);

  console.log("critic case 3: multi-type applicant cannot dodge a cap");
  const primary=c.resolvePrimaryType(["founder","investor"],{investor:0.15});
  t("resolves to the CAPPED type",primary==="investor",`got ${primary}`);

  console.log("critic case 4: composition counts each person once");
  const comp=c.composition([{profileType:["founder","investor","engineer","job_seeking","other"]}],null);
  const total=Object.values(comp).reduce((a,b)=>a+b,0);
  t("one applicant contributes 1, not 5",total===1,`total=${total}`);

  console.log("exclude rules flag but never decide");
  const flags=c.flagExcludeRules({title:"Technical Recruiter",company:"X",bioBlurb:"I hire engineers",profileType:["other"]},
    ["recruiter","service or sales pitch","not currently building a company"]);
  t("recruiter flagged with evidence",flags.some(f=>/recruit/i.test(f.rule)),JSON.stringify(flags[0]??{}));
  const clean=c.flagExcludeRules({title:"Co-founder",company:"Y",bioBlurb:"building an AI infra startup",profileType:["founder"]},
    ["recruiter","not currently building a company"]);
  t("genuine founder not flagged",clean.length===0,`flags=${clean.length}`);

  console.log("selection ranks on the DISPLAYED score, not the stale stored one");
  // Stored order says A wins; the live recompute says B does. The dashboard
  // shows the live number, so the single admitted seat must go to B.
  const reg=(id:string,stored:number)=>({registration:{id,compositeScore:stored} as never,profile:{profileType:["founder"]} as never});
  const rowsIn=[reg("a",90),reg("b",10)];
  const live:Record<string,number>={a:10,b:90};
  const stale=c.reviewApplicants({capacity:1,typeCaps:null,excludeRules:null} as never,rowsIn);
  const fresh=c.reviewApplicants({capacity:1,typeCaps:null,excludeRules:null} as never,rowsIn,
    (r)=>live[(r.registration as {id:string}).id]);
  t("stored-score default still admits a",stale.cohort.admit[0]==="a",`got ${stale.cohort.admit[0]}`);
  t("displayed-score override admits b",fresh.cohort.admit[0]==="b",`got ${fresh.cohort.admit[0]}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
