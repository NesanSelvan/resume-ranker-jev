export const ROLE_TITLE = "Senior Backend Engineer";

/**
 * Lines prefixed with "!" are must-haves and drive the ranking gate.
 * Written the way a hiring manager would actually paste them in.
 */
export const ROLE_REQUIREMENTS = `# Senior Backend Engineer · Platform group · Berlin or remote within CET +/- 2
# Lines starting with ! are hard gates. Every other line is weighted, not pass/fail.
# Lines starting with # are notes and are never scored.

! 5+ years of professional backend engineering experience
! Production experience with Go or TypeScript/Node
! Hands-on Kubernetes in production, not only local development

Strong PostgreSQL skills including query optimisation and online schema migration
Experience designing and operating distributed systems at scale
Event streaming with Kafka or an equivalent broker
Observability tooling: metrics, tracing and structured logging
Owns services end to end, including production on-call
API design for internal consumers across REST, gRPC or GraphQL
Mentoring or technical leadership of other engineers
AWS or GCP cloud infrastructure
Terraform or comparable infrastructure-as-code
CI/CD, trunk-based development and automated testing discipline
A track record of measurable latency, throughput or cost improvements
Written communication: design documents and post-incident reviews
`;

export type Tier = "strong" | "borderline" | "weak" | "adversarial";

/** What the ranker is expected to do, used by scripts/eval.ts. */
export interface GroundTruth {
  file: string;
  name: string;
  tier: Tier;
  /** Adversarial only: what this file is probing. */
  probe?: string;
  /** Expected to fail the must-have gate. */
  expectGateFail?: boolean;
  /** Expected to fail text extraction. */
  expectExtractionFail?: boolean;
}
