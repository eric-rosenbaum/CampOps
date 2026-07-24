# CampCommand — Documentation

## Security & privacy
- [Security Overview](SECURITY.md) — public-facing "how we protect your data" / trust page. GitHub also surfaces this as the repository's security policy (responsible disclosure).
- [Privacy Policy](legal/PRIVACY_POLICY.md) — template reflecting the product's actual data practices.
- [Data Processing Addendum (DPA)](legal/DPA.md) — controller/processor terms + subprocessor list, for camp customers.

> ⚠️ The legal documents are **templates** grounded in the product's real architecture. They must be reviewed and finalized by qualified legal counsel before publication — they are not legal advice.

## Operating notes
- Database migrations live in `../supabase/migrations/`. The `security_phase0_*` / `security_phase1_*` / `security_phase2_*` migrations implement the remediation from the July 2026 security & privacy audit.
- CI: `.github/workflows/ci.yml` runs typecheck/lint/build; `.github/workflows/security-advisors.yml` checks Supabase security advisors on a schedule (see that file for one-time secret setup).

## Actions that must be completed outside the codebase
These require Supabase dashboard access or external services and cannot be done via migrations:
1. **Enable leaked-password protection** — Dashboard → Authentication → Policies → enable "Check against HaveIBeenPwned".
2. **MFA enforcement** — TOTP enrollment ships in-app (Settings → Security & Privacy). Enforcing MFA for admins (requiring AAL2) is an app/policy decision to finalize.
3. **CAPTCHA / rate-limiting** on the public report form — Dashboard → Authentication → Bot & Abuse Protection (Turnstile/hCaptcha), plus consider rate limits on the anonymous report submission.
4. **Fill in the legal placeholders** and have counsel review the Privacy Policy and DPA.
5. **Confirm the Anthropic data-handling terms** for the AI features (test-strip scan, allergy-document reading) and reflect them in the subprocessor section.
