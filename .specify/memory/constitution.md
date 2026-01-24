<!--
  ============================================================================
  SYNC IMPACT REPORT
  ============================================================================
  Version change: 1.1.0 → 2.0.0 (major)

  Removed sections:
  - Principle II: Behavior Driven Development (entire principle removed)

  Modified sections:
  - All principles renumbered (III→II, IV→III, V→IV, VI→V)
  - Quality Gates: Removed "BDD Scenarios" gate
  - Development Workflow: Removed BDD reference from step 1

  Added sections: None

  Templates requiring updates:
  - .specify/templates/plan-template.md: ⚠️ Review - may contain BDD references
  - .specify/templates/spec-template.md: ⚠️ Review - contains Given/When/Then format
  - .specify/templates/tasks-template.md: ✅ Compatible
  - .specify/templates/checklist-template.md: ✅ Compatible

  Follow-up TODOs:
  - Review spec-template.md for BDD terminology (Given/When/Then scenarios)
  - Review plan-template.md for BDD references
  ============================================================================
-->

# sandctl Constitution

## Core Principles

### I. Code Quality

All code MUST meet rigorous quality standards before merge:

- **Readability**: Code MUST be self-documenting with clear naming conventions. Comments are
  reserved for explaining "why," not "what."
- **Single Responsibility**: Each module, function, and class MUST have one clearly defined
  purpose. Functions exceeding 50 lines require justification.
- **Type Safety**: Static typing MUST be used wherever the language supports it. Any use of
  `any`, `unsafe`, or equivalent escape hatches requires explicit justification.
- **No Dead Code**: Unused code, commented-out blocks, and unreachable paths MUST be removed.
- **Consistent Style**: All code MUST pass automated linting and formatting checks before commit.

**Rationale**: Quality code reduces maintenance burden, prevents bugs, and enables confident
refactoring. Technical debt compounds—addressing it early costs less than fixing it later.

### II. Performance

Performance MUST be a first-class concern throughout development:

- **Measurable Goals**: Every feature specification MUST include quantified performance
  criteria (latency, throughput, memory, startup time) relevant to the use case.
- **Baseline Testing**: Performance MUST be measured before and after significant changes.
  Regressions exceeding 10% require explicit justification or remediation.
- **Resource Efficiency**: Memory allocations, I/O operations, and compute cycles MUST be
  considered during design. Premature optimization is discouraged; measured optimization is
  required.
- **Scalability Consideration**: Design MUST account for expected scale. Document assumptions
  about data volume, concurrency, and growth patterns.

**Rationale**: Performance problems discovered in production are expensive to diagnose and fix.
Proactive performance engineering prevents user-facing degradation and infrastructure costs.

### III. Security

Security MUST be integrated into every phase of development:

- **Defense in Depth**: No single control may be the sole protection for sensitive operations.
  Multiple layers of validation, authentication, and authorization are required.
- **Input Validation**: All external input (user data, API responses, file contents) MUST be
  validated and sanitized before processing. Assume all input is malicious.
- **Secrets Management**: Credentials, API keys, and sensitive configuration MUST NEVER appear
  in source code, logs, or error messages. Use environment variables or secret management
  systems.
- **Dependency Hygiene**: Third-party dependencies MUST be regularly audited for known
  vulnerabilities. Dependencies with critical CVEs MUST be updated or replaced within 7 days.
- **Least Privilege**: Components MUST request only the minimum permissions required for their
  function. Elevated privileges require documented justification.

**Rationale**: Security breaches destroy user trust and incur legal, financial, and reputational
costs. Secure-by-default practices are far cheaper than incident response.

### IV. User Privacy

User data MUST be treated as a sacred trust:

- **Data Minimization**: Collect only data strictly necessary for the feature. Every data field
  collected requires documented justification tied to a specific user benefit.
- **Transparency**: Users MUST be clearly informed what data is collected, why, and how it will
  be used. No dark patterns or misleading consent flows.
- **User Control**: Users MUST have mechanisms to access, export, correct, and delete their
  personal data. These capabilities are non-negotiable features, not nice-to-haves.
- **Retention Limits**: Personal data MUST have defined retention periods. Data MUST be deleted
  or anonymized when no longer needed for its stated purpose.
- **No Surveillance**: Analytics and telemetry MUST be opt-in where possible and anonymized
  where required. User behavior tracking for purposes beyond improving their experience is
  prohibited.

**Rationale**: Privacy is a fundamental right. Building privacy-respecting systems from the
start avoids costly retrofits and maintains the trust users place in our software.

### V. End-to-End Testing Philosophy

E2E tests MUST exercise the product as a real user would:

- **User-Centric Invocation**: E2E tests MUST invoke CLI commands exactly as a user would type
  them. Tests interact with the application through its public interface, not internal APIs or
  test harnesses.
- **Black-Box Testing**: E2E tests MUST treat the application as an opaque system. Tests verify
  observable behavior and outputs, not internal state or implementation details.
- **Implementation Independence**: E2E tests MUST remain stable across significant
  implementation changes. If internal refactoring breaks E2E tests, the tests are incorrectly
  coupled to implementation.
- **Decoupling Enforcement**: E2E tests MUST NOT import application code, access internal data
  structures, mock internal components, or depend on implementation-specific file paths or
  formats.
- **Behavioral Contracts**: E2E tests MUST verify the contract between the user and the system.
  Tests assert what the user sees and experiences, not how the system achieves it.

**Rationale**: E2E tests that couple to implementation become maintenance burdens that resist
change. True black-box tests validate user value and provide confidence during refactoring,
enabling rapid iteration without test suite churn.

## Quality Gates

All code changes MUST pass these gates before merge:

| Gate | Requirement | Enforcement |
|------|-------------|-------------|
| Lint & Format | Zero warnings/errors | CI automated |
| Type Check | Full type coverage, no escape hatches without comment | CI automated |
| Unit Tests | All pass | CI automated |
| E2E Tests | All pass without implementation coupling | CI automated |
| Performance | No regressions > 10% vs baseline | CI automated where possible |
| Security Scan | No critical/high vulnerabilities | CI automated |
| Code Review | At least one approval from qualified reviewer | Manual |

## Development Workflow

### Feature Development Sequence

1. **Specify**: Document expected user-facing behavior and acceptance criteria
2. **Design**: Plan implementation considering performance and security (Principles II, III)
3. **Implement**: Write quality code meeting all standards (Principle I)
4. **Test**: Verify all acceptance criteria pass, measure performance baselines
5. **E2E Validate**: Run black-box E2E tests through public CLI interface (Principle V)
6. **Review**: Peer review for quality, security, and privacy concerns
7. **Merge**: Only after all quality gates pass

### Privacy Impact Assessment

For any feature that collects, processes, or stores user data:

1. Document what data is collected and why (Principle IV)
2. Identify data retention requirements
3. Verify user control mechanisms exist
4. Review with privacy-focused team member

### E2E Test Design Guidelines

When creating or modifying E2E tests:

1. Invoke commands as a user would (`sandctl <command> <args>`)
2. Assert only on user-visible output and exit codes
3. Avoid reading internal files or databases directly
4. Use separate test fixtures that do not depend on implementation structure
5. If a test requires internal knowledge to write, reconsider the test design

## Governance

This constitution is the authoritative source of engineering principles for sandctl. All
development practices, code reviews, and architectural decisions MUST comply with these
principles.

### Amendment Process

1. Propose changes via pull request to this document
2. Changes require review and approval from project maintainers
3. Major changes (new principles, removal of principles) require broader team consensus
4. All amendments MUST include migration guidance for existing non-compliant code

### Versioning Policy

- **MAJOR**: Backward-incompatible changes (principle removal, fundamental redefinition)
- **MINOR**: New principles, materially expanded guidance
- **PATCH**: Clarifications, wording improvements, typo fixes

### Compliance Expectations

- All pull requests MUST demonstrate constitution compliance
- Code reviews MUST verify adherence to relevant principles
- Technical debt violating these principles MUST be documented and scheduled for remediation
- Periodic audits SHOULD verify ongoing compliance

**Version**: 2.0.0 | **Ratified**: 2026-01-22 | **Last Amended**: 2026-01-24
