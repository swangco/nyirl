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
  const comp=c.composition([{profileType:["founder","investor","engineer","job_seeking","other"]}]);
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

  console.log("room mix labels people by what they declared, not by what is capped");
  // Live case: a founder who also ticked "operator" was reported as "1 operator,
  // 0 founders" only because operator happened to be the capped type.
  const mix=c.composition([{profileType:["founder","operator","marketing_gtm"]},{profileType:["founder"]}]);
  t("both read as founders",mix.founder===2&&mix.operator===undefined,JSON.stringify(mix));
  // ...but she still SPENDS a seat from the operator cap, so ticking a second
  // box cannot dodge it.
  t("still counts against the operator cap",
    c.resolvePrimaryType(["founder","operator"],{operator:0.25})==="operator",
    c.resolvePrimaryType(["founder","operator"],{operator:0.25}));

  console.log("review round 2: exclude flags must not fire on the target audience");
  const RULES=["recruiter","service or sales pitch","not currently building a company"];
  const noFlags=(p:Record<string,unknown>,label:string)=>{
    const f=c.flagExcludeRules(p as never,RULES);
    t(label,f.length===0,JSON.stringify(f));
  };
  noFlags({title:"Co-founder & CEO",company:"Acme",bioBlurb:"Building an AI infra startup. Currently seeking a technical co-founder and seed investors.",profileType:["founder"]},
    "founder seeking a co-founder is not job seeking");
  noFlags({title:"Partner",company:"First Round",bioBlurb:"I invest in seed-stage AI.",profileType:["investor"]},
    "investor not flagged (caps reserve seats for them)");
  noFlags({title:"Co-founder",company:"Acme",bioBlurb:"We are recruiting our founding engineer.",profileType:["founder"]},
    "founder who recruits is not a recruiter");
  noFlags({title:"Co-founder",company:"Acme",bioBlurb:"Building an AI copilot for sales teams",profileType:["founder"]},
    "selling to sales teams is not a sales pitch");
  const stillCaught=[
    [{title:"Technical Recruiter",company:"X",bioBlurb:"I hire engineers",profileType:["other"]},"recruiter by title"],
    [{title:"VP of Sales",company:"Stripe",bioBlurb:"",profileType:["operator"]},"VP of Sales by title"],
    [{title:"Engineer",company:"",bioBlurb:"Open to work after a layoff.",profileType:["engineer"]},"explicit open to work"],
    [{title:"Engineer",company:"",bioBlurb:"",profileType:["job_seeking"]},"self-declared job seeking"],
  ] as const;
  for (const [p,label] of stillCaught) {
    const f=c.flagExcludeRules(p as never,RULES);
    t(`still flags: ${label}`,f.length>0,JSON.stringify(f));
  }

  console.log("review round 2: cap resolution independent of JSON key order");
  const a1=c.resolvePrimaryType(["founder","investor"],{founder:1.0,investor:0.15});
  const a2=c.resolvePrimaryType(["founder","investor"],{investor:0.15,founder:1.0});
  t("most-binding cap wins either way",a1==="investor"&&a2==="investor",`${a1} / ${a2}`);

  console.log("review round 2: a cap of 0 means none");
  t("seatsForCap(0,16)===0",c.seatsForCap(0,16)===0,`${c.seatsForCap(0,16)}`);

  console.log("review round 2: no capacity means no cap enforcement");
  const uncapped=c.selectCohort([...Array(10)].map((_,i)=>({registrationId:`i${i}`,primaryType:"investor",score:100-i})),
    {capacity:null,caps:{investor:0.15}});
  t("nobody capped out of an unlimited room",uncapped.cappedOut.length===0&&uncapped.admit.length===10,
    `admit=${uncapped.admit.length} capped=${uncapped.cappedOut.length}`);

  console.log("review round 2: decisions free and hold seats");
  const withStatus=[
    {registrationId:"declined-hi",primaryType:"investor",score:99,status:"declined"},
    {registrationId:"declined-hi2",primaryType:"investor",score:98,status:"declined"},
    {registrationId:"pending-lo",primaryType:"investor",score:10,status:"pending"},
  ];
  const r2=c.selectCohort(withStatus,{capacity:16,caps:{investor:0.15}});
  t("declining two investors frees the investor cap",r2.admit.includes("pending-lo"),JSON.stringify(r2.admit));
  const held=c.selectCohort([
    {registrationId:"approved-lo",primaryType:"founder",score:1,status:"approved"},
    {registrationId:"pending-hi",primaryType:"founder",score:99,status:"pending"},
  ],{capacity:1,caps:null});
  t("an approved applicant keeps their seat",held.admit[0]==="approved-lo",JSON.stringify(held.admit));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
