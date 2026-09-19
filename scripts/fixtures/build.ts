import {
  BUZZWORD_BULLETS, CERTIFICATIONS, CITIES, COMPANIES, CORE_SKILLS, EMPLOYMENT, FIRST_NAMES,
  HONOURS, LAST_NAMES, LEADERSHIP_BULLETS, NEUTRAL_SKILLS, OFF_SKILLS, PROJECTS,
  QUANTIFIED_BULLETS, QUANTIFIED_BULLETS_EXTRA, SCOPE_BULLETS,
  TIER_PROFILES, UNIVERSITIES, VAGUE_BULLETS, WEAK_CERTIFICATIONS, intBetween, makeRng, pick,
  sample, type TierProfile,
} from "./content";
import type { Tier } from "./role";

export interface Job {
  title: string;
  company: string;
  /** Where the role was based. Real entries carry it; extraction has to survive it. */
  location: string;
  employment: string;
  /** MM/YYYY, the conventional resume date format. */
  from: string;
  to: string;
  bullets: string[];
  /** The "Stack:" line most engineering resumes close a role with. */
  stack: string[];
}

export interface Project {
  name: string;
  url: string;
  blurb: string;
}

export interface ResumeDoc {
  name: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  /** LinkedIn and GitHub, which a 2026 engineering resume is expected to carry. */
  links: string[];
  summary: string;
  skills: string[];
  jobs: Job[];
  projects: Project[];
  certifications: string[];
  education: { degree: string; school: string; location: string; year: number; honours: string };
}

const THIS_YEAR = 2026;

export function buildResume(tier: Exclude<Tier, "adversarial">, seed: number): ResumeDoc {
  const rng = makeRng(seed);
  const profile = TIER_PROFILES[tier];
  const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
  const years = intBetween(rng, profile.years);
  return assemble(rng, profile, name, years, tier);
}

function assemble(
  rng: () => number,
  profile: TierProfile,
  name: string,
  years: number,
  tier: Exclude<Tier, "adversarial">,
  overrides: Partial<{ skills: string[]; headline: string }> = {},
): ResumeDoc {
  const title = overrides.headline ?? pick(rng, profile.titles);
  const skills =
    overrides.skills ??
    [
      ...new Set([
        ...profile.guaranteed,
        ...sample(rng, CORE_SKILLS, intBetween(rng, profile.coreSkillCount)),
      ]),
      ...sample(rng, NEUTRAL_SKILLS, intBetween(rng, [2, 4])),
      ...sample(rng, OFF_SKILLS, intBetween(rng, profile.offSkillCount)),
    ];

  const jobCount = intBetween(rng, profile.jobs);
  const jobs: Job[] = [];
  let cursor = THIS_YEAR;
  let cursorMonth = 12;
  for (let i = 0; i < jobCount; i += 1) {
    const span = intBetween(rng, profile.tenureYears);
    const fromYear = Math.max(THIS_YEAR - years, cursor - span);
    const fromMonth = intBetween(rng, [1, 12]);
    const bullets = [
      // Scope first, then results — the order a hiring manager reads for.
      ...(profile.leadership && i === 0 ? sample(rng, SCOPE_BULLETS, 1) : []),
      ...sample(
        rng,
        [...QUANTIFIED_BULLETS, ...QUANTIFIED_BULLETS_EXTRA],
        intBetween(rng, profile.quantifiedBullets),
      ),
      ...sample(rng, VAGUE_BULLETS, intBetween(rng, profile.vagueBullets)),
      ...(profile.leadership && i === 0 ? sample(rng, LEADERSHIP_BULLETS, 1) : []),
      ...sample(rng, BUZZWORD_BULLETS, profile.buzzwords),
    ];
    jobs.push({
      title: i === 0 ? title : demote(title, i),
      company: pick(rng, COMPANIES),
      location: pick(rng, CITIES),
      employment: pick(rng, EMPLOYMENT),
      from: monthYear(fromMonth, fromYear),
      to: i === 0 ? "Present" : monthYear(cursorMonth, cursor),
      bullets: bullets.length ? bullets : [pick(rng, VAGUE_BULLETS)],
      stack: sample(rng, skills, Math.min(skills.length, intBetween(rng, [3, 5]))),
    });
    cursor = fromYear;
    cursorMonth = fromMonth;
    if (cursor <= THIS_YEAR - years) break;
  }

  const handle = name.toLowerCase().replace(/[^a-z]+/g, "");
  const projects = sample(rng, PROJECTS, intBetween(rng, profile.projects)).map((p) => ({
    ...p,
    url: p.url.replace("{h}", handle),
  }));
  const certPool = tier === "weak" ? WEAK_CERTIFICATIONS : CERTIFICATIONS;

  return {
    name,
    headline: title,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    phone: `+${intBetween(rng, [1, 49])} ${intBetween(rng, [100, 999])} ${intBetween(rng, [1000, 9999])}`,
    city: pick(rng, CITIES),
    links: [`linkedin.com/in/${handle}`, `github.com/${handle}`],
    summary: summaryFor(tier, years, skills),
    skills,
    jobs,
    projects,
    certifications: sample(rng, certPool, intBetween(rng, profile.certs)),
    education: {
      degree: tier === "weak" ? "BSc Information Technology" : "BSc Computer Science",
      school: pick(rng, UNIVERSITIES),
      location: pick(rng, CITIES),
      year: THIS_YEAR - years - intBetween(rng, [0, 2]),
      honours: pick(rng, HONOURS),
    },
  };
}

/** Resume dates are conventionally MM/YYYY, not bare years. */
const monthYear = (month: number, year: number) => `${String(month).padStart(2, "0")}/${year}`;

function demote(title: string, depth: number): string {
  if (depth >= 2) return "Junior Software Engineer";
  return title.replace(/^(Senior|Staff|Principal)\s+/, "").trim() || "Software Engineer";
}

function summaryFor(tier: Exclude<Tier, "adversarial">, years: number, skills: string[]): string {
  const top = skills.slice(0, 4).join(", ");
  if (tier === "strong") {
    return `Backend engineer with ${years} years building and operating high-throughput distributed systems. Depth in ${top}. Comfortable owning a domain end to end, from schema design through on-call.`;
  }
  if (tier === "borderline") {
    return `Software engineer with ${years} years of backend experience across ${top}. Looking to take on more ownership of system design.`;
  }
  return `Motivated developer with ${years} year${years === 1 ? "" : "s"} of experience working with ${top}.`;
}

/* ---------- adversarial cases ---------- */

export interface AdversarialCase {
  slug: string;
  probe: string;
  layout: "single" | "two-column" | "table" | "docx" | "docx-table";
  expectGateFail?: boolean;
  expectExtractionFail?: boolean;
  doc: ResumeDoc;
  /** Overrides the rendered body entirely, for degenerate files. */
  rawText?: string;
}

export function buildAdversarialCases(): AdversarialCase[] {
  const strong = TIER_PROFILES.strong;

  const noKubernetes = assemble(makeRng(901), strong, "Helena Vasquez", 9, "strong", {
    skills: ["Go", "TypeScript", "PostgreSQL", "Kafka", "AWS", "Terraform", "gRPC", "Redis", "distributed systems"],
  });

  const careerChanger: ResumeDoc = {
    ...assemble(makeRng(902), TIER_PROFILES.weak, "Rebecca Lindholm", 2, "weak", {
      skills: ["JavaScript", "Node.js", "PostgreSQL", "Docker"],
      headline: "Junior Backend Developer",
    }),
    summary:
      "Former secondary school mathematics teacher of 9 years, retrained through a 14-week backend bootcamp. Two years of professional Node.js experience since.",
  };

  const buzzwordHollow = assemble(makeRng(903), TIER_PROFILES.weak, "Grant Whitmore", 6, "weak", {
    skills: ["Go", "Kubernetes", "TypeScript", "PostgreSQL", "Kafka", "AWS", "Terraform"],
    headline: "Senior Backend Engineer",
  });
  buzzwordHollow.summary =
    "Passionate, results-driven rockstar Senior Backend Engineer and self-starter. Dynamic team player and thought leader who leverages synergy to deliver value in fast-paced environments.";
  buzzwordHollow.jobs = buzzwordHollow.jobs.map((j) => ({ ...j, bullets: [...BUZZWORD_BULLETS] }));

  const overqualified = assemble(makeRng(905), strong, "Alan Pemberton", 22, "strong", {
    headline: "Director of Engineering",
  });
  overqualified.summary =
    "Engineering leader with 22 years of experience, the last 8 of them managing managers across a 60-person organisation. Hands-on coding is limited to prototypes and architecture reviews.";

  const jobHopper = assemble(makeRng(906), strong, "Dmitri Sokolov", 8, "strong");
  jobHopper.jobs = [
    { title: "Senior Backend Engineer", company: "Cobalt Payments", location: "Berlin, DE", employment: "Full-time", from: "02/2025", to: "Present", bullets: [QUANTIFIED_BULLETS[0]!], stack: ["Go", "Kubernetes", "PostgreSQL"] },
    { title: "Senior Backend Engineer", company: "Anvil Robotics", location: "Berlin, DE", employment: "Full-time", from: "08/2025", to: "01/2026", bullets: [QUANTIFIED_BULLETS[2]!], stack: ["Go", "Kafka"] },
    { title: "Backend Engineer", company: "Sable Security", location: "Amsterdam, NL", employment: "Contract", from: "01/2025", to: "07/2025", bullets: [QUANTIFIED_BULLETS[4]!], stack: ["TypeScript", "AWS"] },
    { title: "Backend Engineer", company: "Juniper Labs", location: "Dublin, IE", employment: "Full-time", from: "06/2024", to: "12/2024", bullets: [VAGUE_BULLETS[0]!], stack: ["Node.js", "PostgreSQL"] },
    { title: "Backend Engineer", company: "Tidepool Analytics", location: "Lisbon, PT", employment: "Contract", from: "11/2023", to: "05/2024", bullets: [VAGUE_BULLETS[1]!], stack: ["Go", "Redis"] },
    { title: "Backend Engineer", company: "Quarry Insurance", location: "Manchester, UK", employment: "Full-time", from: "04/2023", to: "10/2023", bullets: [VAGUE_BULLETS[2]!], stack: ["Java", "PostgreSQL"] },
  ];

  const keywordStuffer = assemble(makeRng(907), TIER_PROFILES.weak, "Curtis Meeks", 1, "weak", {
    skills: [...CORE_SKILLS],
    headline: "Senior Backend Engineer",
  });
  keywordStuffer.summary =
    "Go TypeScript Node.js Kubernetes PostgreSQL Kafka Terraform AWS GCP gRPC Docker Redis OpenTelemetry Prometheus Grafana distributed systems microservices backend senior 5+ years experience production mentoring leadership observability query optimisation event streaming infrastructure as code.";
  keywordStuffer.jobs = [
    {
      title: "Freelance Developer",
      company: "Self-employed",
      location: "Remote",
      employment: "Contract",
      from: "03/2025",
      to: "Present",
      bullets: [
        "Go Kubernetes PostgreSQL Kafka Terraform AWS observability distributed systems microservices.",
        "Senior backend engineering with 5+ years of production Kubernetes and Go experience.",
      ],
      stack: ["Go", "Kubernetes", "PostgreSQL", "Kafka"],
    },
  ];

  const accented = assemble(makeRng(908), strong, "Zoë Lefèvre-Ngūyen", 10, "strong");
  accented.summary =
    "Ingénieure backend with 10 years across payments and logistics. Native French and Vietnamese speaker. " + accented.summary;

  const twoColumnStrong = assemble(makeRng(904), strong, "Ibrahim Al-Rashid", 11, "strong");
  const tableStrong = assemble(makeRng(909), strong, "Meredith Okonkwo", 8, "strong");

  const emptyScan = assemble(makeRng(910), strong, "Scanned Original", 9, "strong");

  return [
    { slug: "adv-01-missing-must-have", probe: "Strong engineer with no Kubernetes — must-have gate should fire", layout: "single", expectGateFail: true, doc: noKubernetes },
    { slug: "adv-02-career-changer", probe: "Teacher retrained into backend; genuinely junior despite age", layout: "single", expectGateFail: true, doc: careerChanger },
    { slug: "adv-03-buzzword-hollow", probe: "Right keywords, zero substance — should not out-rank real strong candidates", layout: "single", doc: buzzwordHollow },
    { slug: "adv-04-two-column", probe: "Two-column layout — extraction interleaves columns", layout: "two-column", doc: twoColumnStrong },
    { slug: "adv-05-table-layout", probe: "Table-based experience section — extraction column order", layout: "table", doc: tableStrong },
    { slug: "adv-06-image-only", probe: "Scanned/image-only PDF — extraction must fail loudly, not score 0", layout: "single", expectExtractionFail: true, doc: emptyScan, rawText: "Scanned Original\n[image]" },
    { slug: "adv-07-keyword-stuffer", probe: "Requirements pasted verbatim into the resume — lexical gaming", layout: "single", doc: keywordStuffer },
    { slug: "adv-08-overqualified", probe: "Director, 22 years, not hands-on — seniority high, fit questionable", layout: "docx", doc: overqualified },
    { slug: "adv-09-job-hopper", probe: "Strong tech, six sub-year stints — tenure dimension should drop", layout: "single", doc: jobHopper },
    { slug: "adv-10-accented-docx", probe: "Non-ASCII name and hyphenation via DOCX", layout: "docx-table", doc: accented },
  ];
}
