import { type Tier } from "./role";

/** Deterministic PRNG so the corpus is identical on every run. */
export function makeRng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;

export function sample<T>(rng: () => number, xs: readonly T[], n: number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}

export const FIRST_NAMES = [
  "Priya","Marcus","Ana","Tobias","Wei","Fatima","Elena","Rahul","Sofia","Daniel",
  "Ingrid","Kwame","Yuki","Omar","Clara","Nikhil","Hannah","Diego","Mei","Samuel",
  "Aisha","Lukas","Nadia","Ethan","Leila","Viktor","Grace","Arjun","Maya","Thomas",
  "Rosa","Karim","Julia","Felix","Zara","Peter","Amara","Jonas","Iris","Ravi",
  "Noor","Anders","Camila","Hugo","Lena","Tariq","Bianca","Oscar","Divya","Martin",
  "Freya","Emeka","Sara","Niels","Talia","Bruno","Ada","Vikram","Lucia","Henrik",
];

export const LAST_NAMES = [
  "Raman","Holt","Duarte","Lindqvist","Chen","Haddad","Petrova","Menon","Alves","Okafor",
  "Tanaka","Farouk","Bennett","Sharma","Vogel","Moreno","Liu","Whitfield","Osei","Kaur",
  "Novak","Brennan","Aziz","Castillo","Nakamura","Ilyin","Adeyemi","Weber","Iyer","Grant",
  "Santos","Mahmoud","Kowalski","Berger","Mensah","Dahl","Reyes","Vance","Nair","Lindberg",
  "Cruz","Halvorsen","Baptiste","Zhang","Falk","Rahman","Costa","Lindgren","Pillai","Roth",
  "Sorensen","Chukwu","Marchetti","Bakker","Levine","Ferreira","Byrne","Desai","Marin","Ek",
];

export const COMPANIES = [
  "Northwind Logistics","Cobalt Payments","Helio Health","Driftwood Media","Vantage Retail",
  "Solstice Bank","Meridian Freight","Anvil Robotics","Larkspur Travel","Ferrous Energy",
  "Tidepool Analytics","Quarry Insurance","Belltower Telecom","Ashgrove Grocers","Pinnacle Rides",
  "Copperline Studios","Sable Security","Harbourview Foods","Ironbark Mining","Juniper Labs",
];

export const CITIES = [
  "Berlin, DE","Lisbon, PT","Bengaluru, IN","Toronto, CA","Amsterdam, NL",
  "Austin, TX","Dublin, IE","Singapore, SG","Stockholm, SE","Manchester, UK",
];

export const UNIVERSITIES = [
  "Technical University of Munich","University of Porto","BITS Pilani","University of Waterloo",
  "Delft University of Technology","Georgia Institute of Technology","Trinity College Dublin",
  "KTH Royal Institute of Technology","University of Manchester","NUS",
];

/** Skills that overlap the role requirements. */
export const CORE_SKILLS = [
  "Go","TypeScript","Node.js","Kubernetes","PostgreSQL","Kafka","Terraform","AWS","GCP",
  "gRPC","Docker","Redis","OpenTelemetry","Prometheus","Grafana","distributed systems",
];

/**
 * Skills a real engineer lists that the role neither asks for nor penalises.
 * They exist so a resume does not read as a checklist of the job advert.
 */
export const NEUTRAL_SKILLS = [
  "Python","Java","SQL","REST","GraphQL","GitHub Actions","MongoDB","DynamoDB",
  "Elasticsearch","RabbitMQ","Amazon SQS","Spring Boot","Django",
];

/** Skills that do not overlap the role, used to dilute weak candidates. */
export const OFF_SKILLS = [
  "WordPress","jQuery","Photoshop","Excel macros","Salesforce admin","Tableau","Zapier",
  "Google Analytics","Mailchimp","SharePoint","Drupal","Visual Basic",
];

export const QUANTIFIED_BULLETS = [
  "Reduced p99 checkout latency from 840ms to 190ms by rewriting the order service in Go and adding a Redis read-through cache.",
  "Cut cloud spend by 38% ($42k/month) by right-sizing Kubernetes requests and moving batch jobs to spot instances.",
  "Scaled the ingestion pipeline from 4k to 61k events/sec on Kafka with no increase in consumer lag.",
  "Migrated 214 PostgreSQL tables to partitioned schemas, improving the slowest analytical query from 32s to 1.4s.",
  "Improved deploy frequency from weekly to 25 deploys/day by introducing trunk-based development and CI gating.",
  "Eliminated 91% of pager alerts by rebuilding SLO-based alerting on Prometheus and OpenTelemetry traces.",
  "Led the migration of 38 services from EC2 to EKS across two quarters with zero customer-facing downtime.",
  "Drove a 4x throughput increase in the settlement job by replacing row-by-row processing with batched COPY writes.",
  "Shipped a gRPC internal API that cut cross-service payload size by 63% and removed 2.1M daily JSON parses.",
  "Saved roughly 300 engineer-hours per quarter by building a Terraform module library adopted by 9 teams.",
];

/**
 * The lead bullet real senior resumes open a role with: scope of ownership —
 * services, team size, what the person was actually accountable for.
 */
export const SCOPE_BULLETS = [
  "Owned 6 Go services behind a Kubernetes ingress for a 4-engineer team: API design, schema changes and production on-call.",
  "Accountable for the payments read path end to end — 11 services, 2.3M requests/day, a 99.95% availability SLO.",
  "Led the platform group's migration programme across 14 services while remaining the primary on-call for three of them.",
  "Ran the checkout domain for a 5-person team, owning the roadmap, the Postgres schema and the incident review process.",
];

export const QUANTIFIED_BULLETS_EXTRA = [
  "Architected Go and PostgreSQL microservices behind Kubernetes and an AWS load balancer, cutting p95 API latency from 420ms to 180ms while supporting 3x peak traffic.",
  "Rebuilt the Kafka consumer group topology, taking worst-case end-to-end lag from 9 minutes to under 15 seconds.",
  "Introduced connection pooling and statement timeouts across 22 services, removing the weekly Postgres connection exhaustion incident entirely.",
  "Cut container image build time from 11 minutes to 95 seconds with layer caching and a multi-stage Dockerfile.",
  "Designed the gRPC contract and Terraform modules for a new tenant-isolation layer now serving 340 enterprise customers.",
  "Reduced on-call pages per engineer per week from 6.2 to 0.8 by rewriting alerts against SLO burn rate.",
];

export const VAGUE_BULLETS = [
  "Responsible for backend development and maintenance of company services.",
  "Worked closely with cross-functional teams to deliver projects on time.",
  "Participated in code reviews and agile ceremonies.",
  "Helped improve system performance and reliability.",
  "Assisted in the development of new features for the platform.",
  "Involved in troubleshooting production issues as needed.",
  "Contributed to documentation and knowledge sharing sessions.",
  "Supported the team in day-to-day engineering tasks.",
];

export const BUZZWORD_BULLETS = [
  "Passionate, results-driven rockstar developer and self-starter.",
  "Dynamic team player with a detail-oriented, go-getter mindset.",
  "Thought leader who leverages synergy across the organisation.",
  "Hard worker and ninja problem solver in fast-paced environments.",
];

export const LEADERSHIP_BULLETS = [
  "Mentored 4 engineers, two of whom were promoted to senior within the year.",
  "Ran the backend design review forum and authored the service design template used org-wide.",
  "Technical lead for a 6-person team owning the payments domain end to end.",
  "Onboarded and coached three new hires, cutting time-to-first-deploy from 3 weeks to 4 days.",
];


/**
 * Section content beyond experience. Conventional software-engineering resumes
 * run: contact + links, summary, skills, experience, projects, certifications,
 * education — so the fixtures carry all of them rather than a header and three
 * bullets, which is not what a real extraction has to cope with.
 */
export const SKILL_GROUPS: readonly { label: string; members: readonly string[] }[] = [
  { label: "Languages", members: ["Go", "TypeScript", "Node.js", "Python", "Java", "SQL", "Visual Basic"] },
  { label: "Databases", members: ["PostgreSQL", "Redis", "MongoDB", "DynamoDB", "Elasticsearch", "Excel macros"] },
  { label: "Cloud & infrastructure", members: ["AWS", "GCP", "Kubernetes", "Docker", "Terraform", "GitHub Actions", "SharePoint"] },
  { label: "Messaging & APIs", members: ["Kafka", "RabbitMQ", "Amazon SQS", "gRPC", "REST", "GraphQL", "Zapier"] },
  { label: "Observability", members: ["OpenTelemetry", "Prometheus", "Grafana", "Google Analytics", "Tableau"] },
  { label: "Practices", members: ["distributed systems", "Spring Boot", "Django", "Salesforce admin"] },
];

/** Buckets a flat skill list into the groups above; anything unknown lands in Other. */
export function groupSkills(skills: readonly string[]): { label: string; items: string[] }[] {
  const out = SKILL_GROUPS.map((g) => ({
    label: g.label,
    items: skills.filter((s) => g.members.includes(s)),
  })).filter((g) => g.items.length > 0);

  const claimed = new Set(out.flatMap((g) => g.items));
  const rest = skills.filter((s) => !claimed.has(s));
  if (rest.length) out.push({ label: "Other", items: rest });
  return out;
}

export const PROJECTS = [
  { name: "ratelimit-go", url: "github.com/{h}/ratelimit-go", blurb: "Distributed token-bucket limiter backed by Redis; 1.4k stars, used in three production gateways." },
  { name: "pgslice", url: "github.com/{h}/pgslice", blurb: "CLI that rewrites a hot PostgreSQL table into monthly partitions online, with no exclusive lock." },
  { name: "otel-lambda-shim", url: "github.com/{h}/otel-lambda-shim", blurb: "OpenTelemetry cold-start shim that cut trace export overhead from 40ms to 6ms." },
  { name: "kafka-replay", url: "github.com/{h}/kafka-replay", blurb: "Replays a consumer group from an offset window into a sandbox topic for incident reproduction." },
  { name: "tfmod-registry", url: "github.com/{h}/tfmod-registry", blurb: "Private Terraform module registry with policy checks in CI; adopted by nine internal teams." },
  { name: "budget-tracker", url: "github.com/{h}/budget-tracker", blurb: "Personal finance tracker built in a weekend; WordPress front end with a Google Sheets backend." },
  { name: "portfolio-site", url: "{h}.dev", blurb: "Personal portfolio built with a page builder and a contact form." },
];

export const CERTIFICATIONS = [
  "Certified Kubernetes Administrator (CKA), Linux Foundation",
  "AWS Certified Solutions Architect – Associate",
  "Google Cloud Professional Cloud Architect",
  "HashiCorp Certified: Terraform Associate",
  "Confluent Certified Developer for Apache Kafka",
];

export const WEAK_CERTIFICATIONS = [
  "Google Analytics Individual Qualification",
  "Salesforce Certified Administrator",
  "Scrum Alliance Certified ScrumMaster",
];

/** Employment types seen on real resumes; absence of one is not a signal. */
export const EMPLOYMENT = ["Full-time", "Full-time", "Full-time", "Contract"] as const;

export const HONOURS = [
  "First Class Honours",
  "Graduated with distinction",
  "Dean's List, 3 semesters",
  "",
  "",
];

export interface TierProfile {
  years: [number, number];
  /** Always present. A "strong" candidate who cannot meet the must-haves is a broken label, not a hard case. */
  guaranteed: readonly string[];
  titles: readonly string[];
  coreSkillCount: [number, number];
  offSkillCount: [number, number];
  quantifiedBullets: [number, number];
  vagueBullets: [number, number];
  jobs: [number, number];
  tenureYears: [number, number];
  leadership: boolean;
  buzzwords: number;
  projects: [number, number];
  certs: [number, number];
}

export const TIER_PROFILES: Record<Exclude<Tier, "adversarial">, TierProfile> = {
  strong: {
    years: [7, 13],
    guaranteed: ["Go", "TypeScript", "Kubernetes", "PostgreSQL"],
    titles: ["Senior Backend Engineer", "Staff Engineer", "Senior Software Engineer", "Principal Engineer"],
    coreSkillCount: [10, 14],
    offSkillCount: [0, 1],
    quantifiedBullets: [3, 4],
    vagueBullets: [0, 1],
    jobs: [3, 4],
    tenureYears: [3, 5],
    leadership: true,
    buzzwords: 0,
    projects: [2, 3],
    certs: [1, 2],
  },
  borderline: {
    years: [4, 6],
    // Deliberately empty: borderline candidates hit the must-haves only sometimes,
    // which is what makes the gate worth testing.
    guaranteed: [],
    titles: ["Backend Engineer", "Software Engineer", "Software Engineer II", "Senior Developer"],
    coreSkillCount: [5, 8],
    offSkillCount: [1, 3],
    quantifiedBullets: [1, 2],
    vagueBullets: [2, 3],
    jobs: [2, 3],
    tenureYears: [2, 3],
    leadership: false,
    buzzwords: 0,
    projects: [1, 2],
    certs: [0, 1],
  },
  weak: {
    years: [0, 3],
    guaranteed: [],
    titles: ["Junior Developer", "Web Developer", "IT Support Analyst", "Associate Engineer", "QA Analyst"],
    coreSkillCount: [0, 2],
    offSkillCount: [4, 7],
    quantifiedBullets: [0, 0],
    vagueBullets: [3, 5],
    jobs: [1, 3],
    tenureYears: [1, 2],
    leadership: false,
    buzzwords: 1,
    projects: [0, 1],
    certs: [0, 1],
  },
};

export function intBetween(rng: () => number, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
