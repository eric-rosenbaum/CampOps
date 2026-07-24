# Data Processing Addendum (DPA)


_This Data Processing Addendum ("Addendum" or "DPA") forms part of the agreement between the parties for the provision of the CampCommand services (the "Agreement"). Where this Addendum conflicts with the Agreement on the subject of data protection, this Addendum controls._

**Effective date:** July 24, 2026

**Controller:** the camp or organization using CampCommand (the "Controller" or "Customer").

**Processor:** CampCommand, provider of the CampCommand platform (the "Processor" or "CampCommand").

Together, the "Parties."

---

## 1. Definitions

Unless otherwise defined here, capitalized terms have the meaning given in the Agreement or in applicable Data Protection Law.

- **"Applicable Data Protection Law"** means all laws and regulations relating to the processing of Personal Data that apply to the Parties, which may include the EU/UK General Data Protection Regulation (GDPR), the California Consumer Privacy Act as amended (CCPA/CPRA), the Children's Online Privacy Protection Act (COPPA), and applicable U.S. state privacy and student/child-data laws. This policy is written to be consistent with GDPR, CCPA/CPRA, COPPA, and applicable U.S. state privacy laws; the specific laws that apply depend on the Customer and its data subjects.
- **"Controller"** means the entity that determines the purposes and means of the processing of Personal Data — here, the Customer.
- **"Processor"** means the entity that processes Personal Data on behalf of the Controller — here, CampCommand.
- **"Personal Data"** means any information relating to an identified or identifiable natural person that is processed by CampCommand on behalf of the Customer under the Agreement.
- **"Sensitive Data"** means Personal Data that requires heightened protection under Applicable Data Protection Law, including health/medical data and data concerning children.
- **"Data Subject"** means the individual to whom Personal Data relates.
- **"Processing"** means any operation performed on Personal Data, whether automated or not (collection, storage, use, disclosure, deletion, etc.).
- **"Sub-processor"** means any third party engaged by CampCommand to process Personal Data on the Customer's behalf.
- **"Personal Data Breach"** means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Personal Data.

---

## 2. Subject matter and duration

- **Subject matter:** CampCommand's processing of Personal Data on behalf of the Customer in order to provide the CampCommand camp-management platform and related support.
- **Duration:** This Addendum applies for the term of the Agreement and continues until all Personal Data has been deleted or returned in accordance with Section 9.

---

## 3. Nature and purpose of processing

CampCommand processes Personal Data solely to provide and support the platform's functionality, which includes: staff and user management; camper records and health/allergy management; dietary and commissary planning; retreat and guest-group rental management including a tokenized guest portal; building-systems and operational records; reporting; and AI-assisted features (see Section 8). Processing operations include hosting, storage, retrieval, organization, transmission to authorized users, backup, and deletion.

CampCommand does not sell Personal Data and does not process it for its own independent commercial purposes.

---

## 4. Categories of data subjects and Personal Data

### 4.1 Categories of data subjects

- **Camp staff and administrators** — users of the platform.
- **Campers, who are typically minors** — the children attending or registered at the camp.
- **Retreat / guest-group representatives and guests** — external parties renting camp facilities and using the guest portal.
- **Public reporters** — members of the public who submit information (for example, safety or incident reports) where that feature is used.

### 4.2 Categories of Personal Data

- **Contact and identity data** — names, email addresses, phone numbers, and similar identifiers of staff, guardians, guests, and reporters.
- **Health and medical data of minors** — camper allergies, medical restrictions, and nurse-uploaded health documents. (Sensitive Data.)
- **Dietary data** — dietary needs and restrictions.
- **Financial records** — operational financial data such as invoices, charges, and commissary/rental accounting. **Payment card numbers are excluded** — CampCommand records payment information (amounts, method, dates) but does NOT store credit-card numbers; card processing, if any, is handled by the Customer outside CampCommand.
- **Operational data** — schedules, assignments, group memberships, roles and permissions, building/maintenance records, audit-log entries, and similar records generated in the course of running the camp.

The Customer must not submit special categories of data beyond those the platform is designed to handle without first agreeing appropriate arrangements with CampCommand.

---

## 5. Roles of the Parties

The Customer is the **Controller** and determines the purposes and means of processing the Personal Data it submits. CampCommand is the **Processor** and processes Personal Data only on the Customer's behalf and on its documented instructions. The Customer is responsible for ensuring it has a valid legal basis for the processing and for obtaining any necessary consents (including, where required, verifiable parental consent for the data of minors).

---

## 6. Processor obligations

CampCommand agrees to:

1. **Process only on documented instructions.** Process Personal Data only on the Customer's documented instructions (including with regard to international transfers), which comprise the Agreement, this Addendum, and any subsequent written instructions, unless required to do otherwise by law — in which case CampCommand will inform the Customer of that legal requirement before processing, unless the law prohibits such notice.
2. **Confidentiality.** Ensure that personnel authorized to process Personal Data are bound by appropriate confidentiality obligations and access it only as needed to perform their duties.
3. **Security measures.** Implement and maintain appropriate technical and organizational measures to protect Personal Data, as described in Section 10.
4. **Assist with data-subject requests.** Taking into account the nature of the processing, provide reasonable assistance (including appropriate technical and organizational measures, insofar as possible) to help the Customer respond to requests from Data Subjects exercising their rights (access, rectification, erasure, restriction, portability, objection).
5. **Assist with compliance obligations.** Provide the Customer with reasonable assistance regarding security, breach notification, data protection impact assessments, and prior consultations with supervisory authorities, taking into account the information available to CampCommand.
6. **Breach notification.** Notify the Customer **without undue delay** and, where feasible, no later than **72 hours** after becoming aware of a Personal Data Breach affecting the Customer's Personal Data, and provide information reasonably available to CampCommand to help the Customer meet its own notification obligations.
7. **Deletion or return.** On termination or expiry of the Agreement, delete or return Personal Data in accordance with Section 9.
8. **Records and demonstrable compliance.** Make available to the Customer information reasonably necessary to demonstrate compliance with this Addendum, subject to Section 11.

---

## 7. Sub-processors

7.1 The Customer provides **general authorization** for CampCommand to engage the Sub-processors listed below to support delivery of the service. CampCommand imposes data-protection obligations on each Sub-processor that are materially no less protective than those in this Addendum, and remains responsible for each Sub-processor's performance.

7.2 **Current Sub-processors:**

| Sub-processor | Role / Service | Nature of processing | Location |
| --- | --- | --- | --- |
| **Supabase** | Hosting: managed PostgreSQL database, authentication, and file storage (on AWS infrastructure) | Stores and processes all camp data, user credentials, and uploaded files | the United States (Supabase on AWS, US region) |
| **Anthropic** | AI features: reading pool test-strip images and reading allergy/health documents to assist data entry | Processes the specific images/documents submitted to those features to return structured results | the United States |

7.3 **Changes to Sub-processors.** CampCommand will give the Customer **30 days'** prior notice of any intended addition or replacement of a Sub-processor by email to account administrators, giving the Customer the opportunity to object on reasonable data-protection grounds. If the Parties cannot resolve a reasonable objection, the Customer may terminate the affected portion of the service.

---

## 8. AI features

Certain optional features use AI to assist camp staff — specifically, reading pool test-strip photos to extract chemistry readings, and reading uploaded allergy/health documents to help populate records. When these features are used, the relevant image or document is transmitted to **Anthropic** for processing and a structured result is returned. As of the effective date, under Anthropic's commercial terms, submitted inputs and outputs are not used to train models and are retained only transiently to provide the feature. Customers who do not wish to use these features can simply refrain from using them, as they are optional and are invoked only when a staff member chooses to submit an image or document for AI-assisted reading.

---

## 9. Deletion and return of data

On termination or expiry of the Agreement, CampCommand will, at the Customer's choice, delete or return all Personal Data processed on the Customer's behalf, and delete existing copies, unless applicable law requires continued storage. CampCommand will delete Personal Data within 30 days of termination, with backups purged on the ordinary backup-rotation cycle. Following deletion, CampCommand will confirm in writing on request.

---

## 10. Security measures

CampCommand maintains technical and organizational security measures appropriate to the risk, described at a high level in the **CampCommand Security Overview** (`docs/SECURITY.md`) and summarized here:

- **Tenant isolation** enforced at the database layer via PostgreSQL Row-Level Security across the platform's data tables, so one camp cannot access another's data.
- **Role-based access control** (admin / staff / viewer) plus staff-group module permissions.
- **Fail-closed handling of camper health data**, with named health records restricted to administrators and explicitly-cleared staff, de-identified aggregates for others, and files kept in a private bucket accessed only via short-lived signed URLs.
- **Encryption** of data in transit (TLS) and at rest.
- **Least-privilege guest portal** for external groups, limited to token-scoped functions with revocable/rotatable links and no direct database access.
- **Append-only audit logging** of sensitive actions (health changes, role/membership changes, financial changes, portal-link regeneration, exports, deletions).
- **Authentication** by email/password with leaked-password protection and available authenticator-app MFA.
- **SOC 2 Type II** infrastructure (Supabase on AWS) with automated backups.

The Security Overview describes the compliance posture of CampCommand's infrastructure providers; CampCommand builds its own practices to be consistent with those standards but does not itself hold an independent SOC 2, HIPAA, or GDPR certification.

---

## 11. Audit and inspection rights

CampCommand will make available to the Customer information reasonably necessary to demonstrate compliance with this Addendum. Where the Customer reasonably requires further assurance, CampCommand will provide available third-party reports and security documentation, such as Supabase's SOC 2 report subject to confidentiality, and respond to reasonable written security questionnaires. Any on-site or hands-on audit is subject to reasonable prior written notice of **30 days**, is limited to **once per 12-month period** absent a Personal Data Breach or regulator requirement, must not compromise other customers' data or CampCommand's security, and is conducted at the Customer's expense during business hours under appropriate confidentiality terms.

---

## 12. International transfers

Where CampCommand or its Sub-processors process Personal Data in a country other than the one in which the Customer is located, such transfers will be carried out in accordance with Applicable Data Protection Law. Where required for transfers out of the EEA, UK, or Switzerland, the Parties agree to rely on an appropriate transfer mechanism, such as the European Commission's **Standard Contractual Clauses** (and the UK International Data Transfer Addendum where applicable), which are incorporated by reference and completed as set out in Annex 1 (Subprocessors). The processing locations of Supabase and Anthropic are in the United States, and the applicable transfer mechanism is the Standard Contractual Clauses (where applicable).

---

## 13. Liability

Each Party's liability arising out of or related to this Addendum is subject to the limitations and exclusions of liability set out in the Agreement. Liability for data-protection matters is allocated as set out in the main Agreement between the parties.

---

## 14. General

- This Addendum is governed by the law and jurisdiction stated in the Agreement, except where Applicable Data Protection Law requires otherwise; the governing law is that of the State of Delaware, United States.
- If any provision of this Addendum is found unenforceable, the remaining provisions continue in effect.
- This Addendum may be updated to reflect changes in Applicable Data Protection Law or CampCommand's processing; material changes will be communicated as described in the Agreement.

---

**Signatures**

| | Controller (Customer) | Processor (CampCommand) |
| --- | --- | --- |
| Name | __________________ | __________________ |
| Title | __________________ | __________________ |
| Entity | __________________ | CampCommand |
| Date | __________________ | __________________ |
