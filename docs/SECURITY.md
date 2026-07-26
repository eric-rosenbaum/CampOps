# CampCommand Security Overview

_Last updated: July 24, 2026_
_Owner: eric@campcommand.app_

---

## Our approach

CampCommand runs the day-to-day operations of summer camps and retreat centers: staff scheduling, camper records, health and allergy information, commissary and inventory, building systems, and rentals to outside groups. A lot of that data is sensitive, and some of it concerns children.

We take a defense-in-depth approach: security is enforced at the database layer first, so that a bug in the application cannot become a data breach. The sections below describe the controls we actually have in place today, in plain language.

---

## Tenant isolation

CampCommand is multi-tenant: many camps share the same application, but no camp can ever see another camp's data.

This is enforced at the **database level** using PostgreSQL **Row-Level Security (RLS)**, applied across approximately **70 tables**. Every request runs in the context of an authenticated user who belongs to exactly one camp, and the database itself filters out any row that does not belong to that camp.

Because this isolation lives in the database rather than in application code, it holds even if there is a bug in the application. A mistake in a screen or an API call cannot cause one camp's data to leak into another camp's account — the database will simply return nothing.

---

## Role-based access control

Within a camp, access is governed by roles:

- **Admin** — full administrative access to their camp's data and settings.
- **Staff** — day-to-day operational access, scoped further by module permissions (see below).
- **Viewer** — read-only access.

On top of roles, CampCommand supports **staff-group module permissions**. Administrators can define named groups of staff and grant each group access to specific modules (for example, kitchen staff see the commissary module; maintenance staff see building systems). This lets camps follow the principle of least privilege — staff see the parts of the system they need for their job, and nothing more.

---

## Camper health data (fail-closed)

Camper health information — allergies, medical restrictions, and nurse-uploaded documents — receives the strictest handling in the product.

- Access is **fail-closed**: by default, no one can see named health records. Only camp **administrators** or staff who have been **explicitly cleared** for health access can view a camper's identified health details.
- Staff without health clearance do **not** see named records. Where they need operational awareness (for example, "how many campers in this cabin have a nut allergy"), they see only **de-identified aggregate counts**, never names tied to conditions.
- Nurse documents and health files are stored in a **private storage bucket**. They are never publicly accessible; access is granted through short-lived **signed URLs** issued only to authorized users.

This is the first place in the product where access control is both role-aware and module-aware, and it is designed so that the safe default (deny) applies whenever clearance is uncertain.

---

## Encryption

- **In transit:** all traffic between users and CampCommand is protected with **TLS**.
- **At rest:** camp data, including database contents and stored files, is **encrypted at rest** by our infrastructure provider.

---

## Guest portal (least privilege for outside groups)

CampCommand includes a portal for external retreat groups renting a camp's facilities. These are outside parties, so we deliberately give them the narrowest possible access:

- Guest groups reach only a small set of **token-scoped functions**. They never connect to the database directly and never receive database credentials.
- Each portal link is tied to a specific group and a specific scope of data.
- Links can be **revoked or rotated** at any time by camp staff. If a link is shared too widely or a group's access should end, staff can invalidate the old link immediately.

Regeneration of a portal link is a sensitive action and is recorded in the audit trail (see below).

---

## Audit logging

Sensitive actions are recorded in an **append-only audit trail**, so camps have an after-the-fact record of who did what and when. Logged actions include:

- Changes to **camper health** records
- **Membership and role** changes (adding/removing users, changing permissions)
- **Financial** changes
- **Portal-link regeneration**
- **Data exports**
- **Deletions**

The audit trail is append-only, meaning entries are added but not edited or removed through normal application use.

---

## Authentication

- Sign-in uses **email and password**, with **leaked-password protection** that checks credentials against known-compromised password lists and blocks their use.
- **Multi-factor authentication (MFA)** via an authenticator app (TOTP) is available and can be enabled for accounts.
- Passwords must be at least 8 characters and are checked against known-breached-password lists; sessions are managed by the authentication provider (Supabase Auth).

---

## Hosting and infrastructure

CampCommand is built on **Supabase**, which provides our managed PostgreSQL database, authentication, and file storage, running on **Amazon Web Services (AWS)**.

- Supabase maintains a **SOC 2 Type II** report for its platform, and AWS maintains its own broad set of compliance certifications for the underlying cloud.
- **Automated backups** are taken so that data can be restored in the event of a failure: daily automated backups, retained according to the hosting plan.

**Important distinction:** the statements above describe the compliance posture of our *infrastructure providers*. CampCommand builds its practices to be consistent with those standards, but CampCommand itself does not currently hold an independent SOC 2, HIPAA, or GDPR **certification**. Where this overview refers to standards such as SOC 2, it refers to the infrastructure we run on, not to a certification held by CampCommand.

---

## Shared responsibility

Security is a partnership. CampCommand is responsible for the security of the platform: tenant isolation, encryption, access-control enforcement, audit logging, and secure infrastructure.

Each camp (customer) is responsible for how they use it, including:

- Creating user accounts and assigning the correct roles and module permissions.
- Granting and revoking **health-data clearance** appropriately.
- Enabling **MFA** for their users and keeping credentials confidential.
- Managing and revoking **guest-portal links** as groups come and go.
- Off-boarding staff promptly when they leave.

We provide the controls; camps decide who gets access to what.

---

## Responsible disclosure

We welcome reports from security researchers and users. If you believe you have found a security vulnerability in CampCommand, please contact us at **eric@campcommand.app** with:

- A description of the issue and the potential impact.
- Steps to reproduce, if available.
- Any relevant logs, screenshots, or proof-of-concept material.

We ask that you give us a reasonable opportunity to investigate and remediate before any public disclosure, and that you avoid accessing, modifying, or deleting data that is not your own while testing. We will acknowledge your report within **3 business days** and keep you informed as we work through it. We do not pursue legal action against researchers who act in good faith and follow this policy.

CampCommand does not currently operate a formal bug-bounty program but welcomes responsible disclosure and will not pursue legal action against researchers acting in good faith.

---

## Questions

For security questions that are not vulnerability reports, contact **eric@campcommand.app**.
