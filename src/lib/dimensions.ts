/**
 * The fixed score() dimensions asked of every resume, independent of role.
 * Role-specific judgement comes from the per-requirement noul() questions
 * instead, so this list stays stable across job families.
 *
 * Each rubric has 5 levels, so a raw score is 0..4. Jev may return a value
 * between levels; normalise() maps that to 0..1 for weighting.
 */
export const DIMENSIONS = [
  {
    key: "technical_depth",
    label: "Technical depth",
    instructions: "Rate the depth of hands-on technical evidence in this resume.",
    criteria: [
      "No concrete technical work described",
      "Coursework or tutorial-level projects only",
      "Production work, but shallow detail",
      "Substantial production systems with specifics",
      "Deep expertise; designed or owned complex systems",
    ],
  },
  {
    key: "seniority",
    label: "Seniority",
    instructions: "Seniority demonstrated by scope of ownership and responsibility.",
    criteria: [
      "Intern or student",
      "Junior; executes assigned tasks",
      "Mid-level; owns features end to end",
      "Senior; owns systems, mentors, drives design",
      "Staff and above; sets technical direction across teams",
    ],
  },
  {
    key: "role_fit",
    label: "Role fit",
    instructions: "How well does this candidate's background match the stated requirements?",
    criteria: [
      "Unrelated background",
      "Adjacent field with major gaps",
      "Relevant, several gaps",
      "Strong match, minor gaps",
      "Direct match or exceeds the requirements",
    ],
  },
  {
    key: "tenure_stability",
    label: "Tenure",
    instructions: "Employment tenure pattern across the candidate's history.",
    criteria: [
      "Almost every stint under 12 months",
      "Frequent short tenures",
      "Mixed tenures",
      "Mostly multi-year tenures",
      "Consistently long tenures with internal progression",
    ],
  },
  {
    key: "project_work",
    label: "Projects",
    instructions:
      "Evidence of concrete projects the candidate built or shipped, and how much of each they owned.",
    criteria: [
      "No projects described",
      "Coursework or tutorial projects only",
      "Contributed to projects owned by other people",
      "Owned and delivered projects end to end",
      "Led several significant projects with lasting impact",
    ],
  },
  {
    key: "impact_evidence",
    label: "Impact",
    instructions: "Evidence of measurable outcomes rather than listed duties.",
    criteria: [
      "Duties listed, no outcomes",
      "Vague impact claims",
      "Some concrete outcomes",
      "Multiple quantified outcomes",
      "Consistent, significant quantified impact",
    ],
  },
  {
    key: "communication",
    label: "Communication",
    instructions: "Clarity, structure and specificity of the writing itself.",
    criteria: [
      "Disorganised or unreadable",
      "Cluttered; buzzword-heavy with little substance",
      "Adequate but generic phrasing",
      "Clear and well structured",
      "Precise, specific and easy to scan",
    ],
  },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];
export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key) as readonly DimensionKey[];

/** Rubric levels per dimension; a raw score is 0..LEVELS-1. */
export const LEVELS = 5;

export const DEFAULT_WEIGHTS: Record<DimensionKey, number> = {
  technical_depth: 1,
  seniority: 1,
  role_fit: 1.5,
  tenure_stability: 0.5,
  project_work: 1.25,
  impact_evidence: 1,
  communication: 0.5,
};

export function dimensionLabel(key: DimensionKey): string {
  return DIMENSIONS.find((d) => d.key === key)!.label;
}
