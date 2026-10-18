# NVFR Leadership Development Institute
## Evaluation & Feedback Management System
### Software Requirements & Design Specification

| Document field | Value |
|---|---|
| Version | 1.0 |
| Date | October 17, 2026 |
| Project | NVFR LDI Evaluation Management System |
| Status | Initial requirements — development review |
| Audience | NVFR LDI development team and program leadership |

## 1. Executive Summary

### 1.1 Purpose

The Northern Virginia Fire & Rescue Leadership Development Institute (NVFR LDI) requires a web-based system to create, distribute, collect, manage, analyze, and report evaluations from students participating in its annual leadership development programs.

Evaluations include instructional sessions, instructors, practical exercises, meals, accommodations, facilities, daily activities, overall program effectiveness, and future staff recruitment.

### 1.2 Objectives

1. Simplify creation and administration of large numbers of surveys.
2. Standardize evaluations using reusable questionnaire templates.
3. Integrate assignments with the LDI schedule, programs, and student accounts.
4. Automate survey opening and closing based on scheduled activities.
5. Support multiple question types, validation, and conditional logic.
6. Provide real-time participation monitoring and reporting.
7. Support genuinely anonymous as well as identified surveys.
8. Enable comparisons across sessions, programs, instructors, and years.
9. Minimize repetitive administrative work and maintain historical integrity.
10. Keep the student experience fast, accessible, and mobile-first.

### 1.3 Initial Scale

| Dimension | Planning assumption |
|---|---|
| Event duration | 5–6 days |
| Programs | Company Officer and Command Officer |
| Surveys per day | 2–10 per program |
| Survey assignments per event | Approximately 50–100 |
| Participants | Approximately 30–50 |
| Questions per survey | Approximately 3–20 |
| Events | At least one annually |
| Retention | Multiple years, per approved policy |

These are sizing assumptions, not system limits. Support more programs, participants, evaluations, and events without fundamental redesign.

## 2. Core Architecture

**Separate what is asked from where, when, and to whom it is asked.**

- **Survey template:** reusable draft or blueprint.
- **Survey definition/version:** immutable published questionnaire structure.
- **Survey assignment:** an instance of a definition offered to a specific audience, session, and time window.
- **Survey response:** one participant's draft or completed submission to an assignment.
- **Survey answer:** a response to a particular question within a submission.

```text
Event
├── Programs and participants
├── Schedule and instructional sessions
├── Template library
│   └── Versioned survey definitions
├── Assignments (one definition → many assignments)
│   ├── Audience and eligibility
│   ├── Session and/or campaign
│   ├── Open/close rules
│   └── Responses → Answers
└── Reporting and analytics
```

### 2.1 Major Modules

| Module | Responsibility |
|---|---|
| Template Library | Reusable questionnaire designs |
| Questionnaire Builder | Sections, questions, configuration, preview, publishing |
| Assignment Manager | Audience/session association and bulk generation |
| Campaign Manager | Optional administrative groupings and bulk updates |
| Scheduling Engine | Absolute/relative availability and manual overrides |
| Student Portal | Eligible surveys, completion, submission |
| Operations Dashboard | Day-of monitoring and rapid actions |
| Reporting Engine | Participation, numerical results, comments, comparisons, exports |
| Administration | Roles, settings, audit records, event management |

Integrate these capabilities into the existing LDI application, authentication, and instructional schedule where practical.

## 3. Roles and Permissions

| Role | Main permissions |
|---|---|
| System Administrator | All configuration, events, permissions, templates, assignments, reporting |
| LDI Administrator | Build surveys, schedule, bulk manage, monitor and export authorized results |
| Program Leadership | View/manage assigned program evaluations and authorized reports |
| Instructor (optional) | View authorized aggregate results and comments for own sessions |
| Student | See eligible evaluations; submit, save, or edit as allowed; see completion status |

Requirements:

- Enforce permissions **server-side** on every operation and export.
- Support event- and program-scoped access.
- Do not expose other students' responses.
- Instructor access to free-text comments and small-group results must be explicitly configurable.

## 4. Event, Program, Session, and Category Model

An **event** is a particular annual institute (e.g., *2026 NVFR LDI*) and has a name, dates, timezone, and status.

A **program** is a participating cohort (initially Company Officer Leadership Program and Command Officer Leadership Program); do not hardcode a maximum of two.

A **session** is a scheduled instructional activity with title, description, start/end times, program association(s), instructor(s), location, activity type, and status. A session can have zero or multiple survey assignments.

Initial **survey categories**:

1. Instructional Sessions
2. Practical Exercises
3. Instructor Evaluations
4. Food & Hospitality
5. Facilities & Accommodations
6. Daily Feedback
7. Overall Program
8. Future Staff Recruitment
9. General / Other

Administrators should be able to configure categories and optional tags. Shared surveys (e.g., hotel or overall program) need not belong to an instructional session.

## 5. Questionnaire Engine

### 5.1 Common Question Properties

Every question should carry:

- Stable question identifier and type.
- Label/text and optional explanatory description.
- Required/optional setting and display order.
- Type-specific configuration and validation.
- Optional visibility conditions.
- Optional stable reporting metric identifier.
- Version association so historical answers retain their meaning.

### 5.2 Supported Question Types

| ID | Type | Typical example | Key configuration |
|---|---|---|---|
| QT-001 | Numeric rating | Instructor knowledge: 1–5 | Min/max, value labels, N/A |
| QT-002 | Likert agreement | Material will be useful in my role | 3/5/7 points, labels, N/A |
| QT-003 | Single-choice | Was difficulty appropriate? | Choices, Other + text, optional shuffle |
| QT-004 | Multi-choice | Which future topics interest you? | Choices, minimum/maximum selection, Other |
| QT-005 | Short text | Most valuable takeaway | Min/max length, placeholder, validation |
| QT-006 | Long text | Suggestions for improvement | Multiline, min/max length |
| QT-007 | Yes/No | Interested in returning as staff? | Binary choices; consider Maybe via single-choice |
| QT-008 | Dropdown | Select department | Choices, search, Other |
| QT-009 | Ranking | Prioritize future topics | Rank all/subset, accessible controls |
| QT-010 | Matrix/Grid | Rate instructor, relevance, delivery | Rows, columns, scale, N/A, required rows |
| QT-011 | Specialized fields | Email, phone, date, number, URL | Data-type validation |
| QT-012 | Informational content | Instructions or section introduction | Formatted display without response |

**Initial-release priority:** rating, Likert, single/multiple choice, short/long text, Yes/No, dropdown, and matrix. Ranking and specialized fields may follow, although email/contact validation is needed if staff recruitment launches immediately.

Example rating scale: 1 Poor, 2 Fair, 3 Good, 4 Very Good, 5 Excellent. Use consistent scales wherever comparable reporting is intended.

### 5.3 Sample Question Definition

```json
{
  "id": "question-001",
  "type": "rating",
  "title": "Rate the instructor's effectiveness",
  "description": null,
  "required": true,
  "order": 1,
  "configuration": {
    "min": 1,
    "max": 5,
    "allow_na": true
  },
  "visibility_rules": [],
  "reporting_metric": "instructor_effectiveness"
}
```

This illustrates the concept; the final schema is an implementation decision.

### 5.4 Validation and Accessibility

- Validate inputs client-side **and** server-side.
- Reject invalid choices, selection counts, data types, out-of-range values, and excessive text.
- Do not require hidden questions.
- When a prior answer changes and a dependent question becomes hidden, clear or omit the hidden answer at submission.
- Matrix questions must render as usable individual cards/controls on narrow screens.
- Ranking must have an accessible keyboard/mobile alternative to drag-and-drop.

### 5.5 Sections

Surveys may contain ordered sections with titles/descriptions and ordered questions. Administrators can create, rename, duplicate, reorder, and conditionally show sections. Longer evaluations should support section navigation.

## 6. Conditional Logic

Conditional rules determine whether a question or section is shown based on earlier answers.

Example: *Did you stay at the LDI-provided hotel?* If **Yes**, show cleanliness/comfort questions; if **No**, skip them.

Example: *Would you be interested in serving as future LDI staff?* If **Yes** or **Maybe**, show role preferences and contact details.

Initial operators: equals, not equals, selected option contains/does not contain, answered, unanswered. Future rules may allow numeric comparisons and AND/OR combinations.

Requirements:

- Apply conditions to questions or entire sections.
- Detect and prevent circular dependencies.
- Preview conditional paths in the builder.
- Enforce rules consistently at the server on submission.

## 7. Templates, Definitions, and Versioning

### 7.1 Standard Template Library

| Template | Intended use |
|---|---|
| Standard Session Evaluation | Routine presentations |
| Extended Session Evaluation | Major workshops or presentations |
| Practical Exercise Evaluation | Hands-on activities |
| Instructor Evaluation | Focused instructional feedback |
| Meal Evaluation | Food and service |
| Hotel Evaluation | Lodging and amenities |
| Daily Feedback | General day-specific experience |
| Overall Program Evaluation | End-of-institute assessment |
| Staff Interest | Future recruitment |

Administrators can create, preview, duplicate, categorize, archive, and version templates.

### 7.2 Template Variables

Support tokens including `{{session_title}}`, `{{instructor_name}}`, `{{class_name}}`, `{{event_name}}`, and `{{session_date}}`.

Example: “How would you rate the presentation delivered by {{instructor_name}}?” Unresolved required tokens must produce a warning before publication. Multi-instructor sessions must have a defined display rule.

### 7.3 Immutable Published Definitions

Published question/option content must be immutable. Editing a published questionnaire creates a **new definition version**; prior submissions retain a link to the version originally answered.

Changes to a template must not silently alter existing survey assignments. Customizing a definition must not alter its source template or unrelated assignments.

## 8. Survey Assignments

An assignment connects an immutable definition version to an evaluation opportunity.

| Property | Purpose |
|---|---|
| Assignment ID | Stable key |
| Event ID | Annual institute |
| Definition version ID | Questions to be shown |
| Title and description | Student-facing labeling |
| Category/tags | Organization |
| Session ID (nullable) | Optional instructional activity |
| Audience associations | One or more programs/groups/individuals |
| Campaign memberships | Optional administrative collections |
| Open/close rules | Availability |
| Publication status | Draft/published |
| Anonymity mode | Anonymous or identified |
| Required flag | Mandatory vs optional |
| Submission settings | One/multiple, draft save, allow edits |
| Audit metadata | Creator, timestamps |

**Cardinality:** One survey definition/version → many assignments → many responses. Each assignment maintains an independent response set, even when sharing a definition.

Audience targeting should support Company, Command, both, staff, specific groups, and individual students. Enforce eligibility on every read and submission.

## 9. Campaigns

Optional campaigns group assignments for operations (e.g., “Monday Evaluations,” “Accommodations,” “End-of-Program”). They support filtering, aggregate progress, and bulk publishing/opening/closing/deadline changes/archive.

Campaign membership must not be required. Bulk changes should show the affected assignments in a confirmation and record changes in an audit log.

## 10. Scheduling Engine and Lifecycle

### 10.1 Opening/Closing Rules

| Rule | Example |
|---|---|
| Absolute | Open October 19 at 09:30 |
| Session start | Open when presentation begins |
| Session end | Open when presentation ends |
| Relative offset | Open 15 minutes after session ends |
| Day boundary | Open at 17:00 for daily feedback |
| Elapsed interval | Close 48 hours after opening |
| Event end | Close at event conclusion |
| Manual | Administrator decides |

Relative windows should update when the session schedule changes, unless a manual override has been applied. Define whether edited times should propagate to assignments that are already open or closed; notify administrators when a schedule change would alter a live survey.

Store timestamps consistently (e.g., UTC); evaluate and display rules in the event's explicit timezone, including daylight saving time.

### 10.2 Lifecycle

```text
Draft → Scheduled → Open → Closed → Archived
```

Support publishing, early opening, immediate closing, deadline extensions, reopening, and archival. Distinguish **publication state** from **effective availability**; “scheduled” and “open” can be derived from publication and time rules.

Closed or archived surveys remain available for authorized historical reporting. Routine administration must not permanently delete survey responses.

### 10.3 Publication Validation

Warn/block as appropriate for: missing questions, unresolved template tokens, invalid conditional rules, missing audiences, impossible time windows, or inconsistent settings.

## 11. Schedule Integration and Bulk Creation

Integrate survey assignment controls into the existing instructional schedule.

- Display an accessible status indicator beside each session: ready, draft/incomplete, or no evaluation.
- From a session, assign a template, manage an assignment, view participation/results, or access a QR code.
- Select one or many sessions by date, program, category, or individual selection.
- Bulk-assign a template with shared anonymity, scheduling, and publication options.
- Generate assignments with the session's title, instructor, audience, and relative opening time.
- Preview generated assignments before confirmation.
- Detect duplicates and offer skip/review/explicit additional assignment options.
- Never silently overwrite a preexisting assignment.

### 11.1 Bulk Creation Wizard

1. **Select sessions:** individual, day, program, or entire event.
2. **Select template/definition:** standardized or customized.
3. **Configure defaults:** audience, open/close rules, anonymity, submissions, campaign.
4. **Review:** proposed assignments, warnings, and duplicates.
5. **Generate:** create records and show success/failure details.

Changes should be transactional where possible; otherwise report partial failures accurately.

## 12. Administrative Survey Dashboard

Default to the selected event. Show summary counts for total, draft, scheduled, open, closed, responses, participation, and items needing attention.

| Column | Information |
|---|---|
| Day | Associated date |
| Program | Company, Command, or Shared |
| Survey | Assignment title |
| Session | Related instructional session, if any |
| Category | Feedback category |
| Opens/Closes | Availability window |
| Status | Effective availability |
| Responses | Submitted / eligible |
| Actions | Edit, preview, manage, report, QR |

Support search by survey/session/instructor/category/campaign; filter by event, program, day, category, campaign, status, and completion rate; sort and paginate; select multiple assignments for bulk actions.

## 13. Daily Operations Dashboard

Provide a day-specific management view for Planning and program leadership. Group Company, Command, and shared evaluations separately.

| Program | Session/survey | Status | Responses |
|---|---|---|---|
| Company | Leadership Fundamentals | Closed | 24/27 |
| Company | Communications | Open | 18/27 |
| Command | Strategic Leadership | Open | 7/9 |
| Shared | Lunch Evaluation | Open | 21/36 |

*Figures illustrative.*

From this view, authorized staff can open/close, extend, preview, monitor, report, and copy evaluation URLs or QR codes. Highlight missing assignments and unusually low participation without exposing anonymous answers.

## 14. Student Evaluation Portal

Students should see **only eligible assignments**, grouped into Available, Upcoming, Completed, and Closed/Missed.

- Show clear titles, availability, required/optional status, and completion status.
- Count progress against **currently available** assignments; exclude future assignments from the available-completion denominator.
- Distinguish saved drafts from submitted responses.
- Support responsive completion with clear validation and submission confirmation.
- Optionally save/resume partial responses.
- Optionally allow editing until an administrator-defined deadline.
- Clearly indicate when an assignment is anonymous or identified.
- Provide a direct route from the instructional schedule and per-assignment link/QR code.

Submission limits (e.g., one response per eligible student) must be enforced server-side.

## 15. Anonymous and Identified Surveys

Anonymous evaluations are recommended for instruction, instructors, meals, accommodations, and overall program feedback. **Future staff recruitment must be a separate, identified assignment** with explicit notice.

### 15.1 Anonymous Completion Without Response Linkage

A student may need to prove completion without linking their answers to their account. Use a privacy-reviewed architecture that separates eligibility/completion records from submitted response content. A possible approach is single-use authorization credentials with unlinkability protections, but an ordinary token lookup table that connects a respondent to a response **does not provide strong anonymity**.

Requirements:

- Do not place a student ID in an anonymous response.
- Minimize IP/device/user-agent data, logs, analytics identifiers, timestamps, and export metadata capable of reidentification.
- Make anonymity claims accurately; merely hiding names in the UI is insufficient.
- Avoid storing the link between a single-use authorization and an answer payload.
- Restrict detailed results for small groups.
- Consider suppression of group breakdowns with fewer than five responses (configurable default); free-text comments still require privacy review.
- Explain to students how anonymous responses and completion tracking work.

Identified staff-interest data must only be visible to authorized leadership and subject to retention rules.

## 16. Reporting and Analytics

Support reporting by assignment, question, session, instructor, program, day, category, campaign, event, and year.

### 16.1 Question-Specific Metrics

| Type | Reports |
|---|---|
| Numeric ratings | Count, mean, median, min/max, distribution, favorable percentage |
| Likert | Distribution; agree, neutral, disagree percentages |
| Single choice | Count and percentage by option |
| Multiple choice | Count and percentage by option; totals may exceed 100% |
| Matrix | Per-row distribution and aggregate scores |
| Free text | Authorized, filterable comments |
| Ranking | Position distributions and aggregate preferences |

Exclude N/A from numerical averages, and distinguish missing/skipped responses from N/A answers.

### 16.2 Participation

```text
Participation rate = submitted eligible responses / eligible participants
```

For single-submission surveys, count unique completed participants. For multi-submission surveys, specify a separate participation measure so repeated answers do not inflate the numerator. Enrollment/eligibility snapshots should be stable enough for accurate historical reporting.

### 16.3 Comparisons

Compare common metrics across sessions and instructors and support year-over-year analysis using stable reporting identifiers. Do not automatically compare materially different question wording/scales without documented mapping.

### 16.4 Exports

**Initial:** CSV and Excel for individual assignments, aggregate reports, participation summaries, campaigns, and event totals. **Future:** printable/PDF reports.

Respect roles and anonymity in every export; record sensitive report exports in an audit log.

## 17. QR Codes and Reminders

Each assignment should have a unique URL and QR code. Administrators can copy the link, download the QR code, and print an access sheet. Bulk QR export is a desirable addition.

QR codes must **not** bypass authentication or eligibility checks. After scanning, display the survey if eligible/open, or an appropriate explanation otherwise.

Future reminders: in-app/email notices when a survey opens, closes soon, or is incomplete; allow timing, audience, frequency, and required-only configuration. Never reveal anonymous responses through reminders.

## 18. Logical Data Model

| Entity | Purpose |
|---|---|
| Event | Annual institute |
| Program | Company/Command/other cohort |
| EventParticipant | Event/program enrollment |
| Session | Instructional schedule entry |
| SessionInstructor | Session-to-instructor association |
| SurveyCategory | Configurable grouping |
| SurveyTemplate | Template identity |
| SurveyTemplateVersion | Versioned template configuration |
| SurveyDefinition | Questionnaire identity |
| SurveyDefinitionVersion | Immutable published question set |
| SurveySection | Ordered section within definition version |
| SurveyQuestion | Version-specific question and configuration |
| SurveyAssignment | Evaluation instance tied to context and schedule |
| SurveyAssignmentAudience | Eligibility target(s) |
| SurveyCampaign | Optional administrative collection |
| SurveyCampaignAssignment | Campaign membership |
| SurveyResponse | Draft/submitted response |
| SurveyAnswer | Typed answer to a versioned question |
| SurveyCompletion | Separate student completion tracking |
| SurveyAuditLog | Administrative actions |

A relational database such as PostgreSQL is suitable. Store relationships, responses, and permissions relationally; use JSON/JSONB where helpful for type-specific question configuration. Preserve foreign keys and index common filters (event, program, date, status, assignment). Design anonymity boundaries deliberately rather than joining response tables to student identity by default.

## 19. API Design Considerations

Illustrative routes (adapt to application conventions):

```http
GET    /api/events/{eventId}/survey-assignments
POST   /api/survey-assignments
PATCH  /api/survey-assignments/{assignmentId}
POST   /api/survey-assignments/bulk-create
POST   /api/survey-assignments/bulk-update
GET    /api/survey-assignments/{assignmentId}/report
POST   /api/survey-assignments/{assignmentId}/responses
GET    /api/students/me/evaluations
```

Use consistent error structures, authorization, validation, filtering, pagination, sorting, idempotency/duplicate submission protection, audit events, and safe bulk updates.

## 20. Security, Privacy, and Nonfunctional Requirements

### 20.1 Security

- Reuse existing authentication where practical.
- Enforce least-privilege role and program restrictions server-side.
- Use HTTPS throughout; protect sessions and CSRF-sensitive operations.
- Validate and sanitize inputs; safely render student comments and rich instructional content to prevent XSS.
- Rate-limit public-facing and submission endpoints.
- Prevent unauthorized submission and duplicate responses.
- Keep personally identifying staff-interest data separate from anonymous feedback.
- Apply appropriate data retention, backup, and recovery policies.
- Record security-significant administrative actions and sensitive exports.

### 20.2 Nonfunctional Targets

| Area | Requirement/target |
|---|---|
| Capacity | Initially support at least 100 concurrent users (validation target) |
| Mobile | Student-first responsive UI on phones and tablets |
| Accessibility | Target WCAG 2.2 AA; keyboard/screen reader and non-color status labels |
| Reliability | Student submissions remain available if analytics/reporting is degraded |
| Performance | Responsive survey loads and dashboard filtering under expected event load |
| Maintainability | Modular question renderer and validator architecture |
| Extensibility | Additional programs, question types, reporting dimensions without major redesign |
| Time handling | UTC persistence with event-local timezone display and rules |
| Backup | Preserve questionnaires, assignments, responses, and permissions |

## 21. Workflows

### Before LDI

1. Create/select annual event and programs.
2. Import or configure the instructional schedule and instructors.
3. Review/update standard templates.
4. Select sessions and bulk-generate assignments.
5. Add shared food, hotel, program, and staff-interest assignments.
6. Review audiences, scheduling, anonymity, and publication warnings.
7. Preview and publish.

### During LDI

1. Open the Daily Operations Dashboard.
2. Confirm evaluations open as sessions finish.
3. Monitor participation and missing assignments.
4. Open early/extend/close assignments as needed.
5. Review authorized aggregate feedback.

### After LDI

1. Close remaining assignments.
2. Generate session, program, instructor, and event summaries.
3. Export authorized data.
4. Review identified future-staff interest separately.
5. Compare consistent metrics year-over-year.
6. Archive while preserving historical versions.

## 22. Representative User Stories and Acceptance Criteria

### US-001: Build a questionnaire

As an administrator, I can add, configure, reorder, require, preview, and save questions of different types. Validation runs on submission.

### US-002: Reuse a template

As an administrator, I can choose a template, create a definition, and customize it without changing the template or other assignments.

### US-003: Bulk-assign sessions

As an administrator, I can select many sessions, choose a template, set rules, review duplicates, and generate independent assignments in one action.

### US-004: Relative scheduling

As an administrator, I can open a survey at session end; updating the session schedule recalculates availability unless overridden.

### US-005: Student dashboard

As a student, I see only eligible evaluations with clear available, upcoming, completed, and closed groupings and accurate progress.

### US-006: Participation monitoring

As program leadership, I can see submitted/eligible counts by day and program and navigate to permitted reports.

### US-007: Anonymous feedback

As a student, I can provide candid feedback without having my answers stored against my student account; completion tracking is separate.

### US-008: Results and export

As authorized leadership, I can compare compatible quantitative metrics, view appropriately protected comments, and export allowed reports.

### US-009: Safe publication

As an administrator, I receive clear validation errors for missing audiences, invalid conditions, unresolved tokens, and impossible time windows before publication.

### US-010: Historical integrity

As an analyst, I can interpret earlier answers using the exact questionnaire/option version used at submission, despite later edits.

## 23. Development Phases and Priorities

| Phase | Priority | Scope |
|---|---|---|
| 1. Core engine | Must | Core question types, sections, validation, templates, immutable definitions, response collection |
| 2. Assignment and schedule | Must | Audiences, sessions, relative/absolute availability, lifecycle, bulk generation, duplicates |
| 3. Interfaces | Must | Student portal, admin dashboard, daily operations, filtering, bulk actions |
| 4. Reporting | Must | Metrics, participation, comparisons, CSV/Excel, privacy-protected exports |
| 5. Advanced | Should/Future | Conditional logic, campaigns, QR bulk export, drafts/editing, reminders, instructor dashboards, year-over-year analysis, ranking |

**Exception:** Basic conditional logic and validated contact fields should move into the initial release if future-staff recruitment is launched immediately. Core privacy and versioning requirements must not be deferred.

### Phase Acceptance Gates

- **Phase 1:** Create/preview/submit validated questionnaires; published versions remain unchanged.
- **Phase 2:** Assign one definition to many sessions; correct eligibility and availability; bulk create without silent duplicates.
- **Phase 3:** Mobile students can complete assigned surveys; staff can manage and monitor daily operations.
- **Phase 4:** Accurate denominators and aggregates; anonymous exports free of identifying metadata.
- **Phase 5:** Advanced features work without changing historical responses or violating permissions.

## 24. Suggested Initial Survey Templates

### 24.1 Standard Instructional Session Evaluation

1. **Rating matrix:** instructor knowledge, presentation, content relevance, instruction quality, overall session quality.
2. **Likert:** “The information presented will be useful in my role as a fire officer.”
3. **Single choice:** time allocated — Too Little / About Right / Too Much.
4. **Long text (optional):** most valuable information presented.
5. **Long text (optional):** recommended improvements.

### 24.2 Meal Evaluation

1. Meal quality (rating).
2. Food variety (rating).
3. Dietary needs accommodated? Yes / No / Not Applicable.
4. Additional comments (optional long text).

### 24.3 Hotel Evaluation

1. Stayed at LDI-provided hotel? (Yes/No).
2. If yes, matrix rating: cleanliness, comfort, amenities, overall experience.
3. If yes, experienced any problems? (Yes/No).
4. If problems, describe them (optional long text).

### 24.4 Overall Program Evaluation

Consider overall satisfaction, curriculum relevance, instructional quality, facilities, organization, practical exercises, time allocation, leadership preparedness, most/least valuable portions, suggested improvements, and likelihood of recommendation.

### 24.5 Future Staff Interest — **Identified**

1. Interested in serving as staff? Yes / Maybe / No.
2. If Yes/Maybe, preferred roles (multi-choice): instructor, evaluator, company mentor, command mentor, logistics, planning/administration, other.
3. Relevant experience/skills (long/short text).
4. Full name (required when expressing interest).
5. Preferred email (validated).
6. Preferred phone (validated or optional).

Keep this assignment separate from anonymous evaluations.

## 25. Audit Logging

Log administrative events such as template creation/modification, questionnaire publication, assignment creation and bulk updates, scheduling overrides, archival, permission changes, and report exports.

Suggested fields:

```text
id, actor_id, event_type, entity_type, entity_id,
previous_value, new_value, timestamp
```

Redact sensitive data and do not accidentally place anonymous responses or identifying submission tokens in audit logs.

## 26. Operational Considerations

- **Survey fatigue:** standard session surveys should generally take 1–2 minutes. Limit required free text.
- **Standardization:** use consistent scales/metric identifiers for comparisons.
- **Availability:** schedule-driven surveys should allow manual operational override.
- **Shared surveys:** do not require a one-to-one session association.
- **Small groups:** suppress potentially identifying breakdowns and review written comments carefully.
- **Data integrity:** never reinterpret historical answers using a newer version of a question.
- **Publication readiness:** warn on missing audience, empty questions, invalid dates, and unresolved dynamic labels.

## 27. Definition of Done — Initial Operational Release

1. Administrators can manage reusable templates and versioned questionnaires.
2. Core question types and validation work on desktop and mobile.
3. One definition can power multiple independent session assignments.
4. Audiences include Company, Command, and shared groups.
5. Bulk assignment from the instructional schedule works.
6. Availability supports automated rules and administrative overrides.
7. Students see only eligible surveys and can submit successfully.
8. Admins can monitor correct completion/eligibility counts.
9. Reports and CSV/Excel exports are accurate and permission-controlled.
10. Anonymous and identified feedback are appropriately separated.
11. Historical definition versions and submissions remain intact.
12. Role-based authorization, auditing, backup, and basic accessibility checks pass.

## 28. Future Enhancements

- AI-assisted comment summaries and theme identification.
- Instructor performance portals.
- Automated reminders and notification scheduling.
- Bulk printable QR code packages.
- PDF report packs and scheduled leadership reports.
- Advanced multi-year analysis.
- Integration with additional training and staff management systems.
- Additional programs, events, and organizational reporting.

AI-generated qualitative analyses should remain reviewable and traceable to authorized source comments, subject to privacy restrictions.

## 29. Open Design Decisions

| Decision | Initial recommendation |
|---|---|
| Authentication | Existing LDI student accounts |
| Hosting | Integrate with existing platform |
| Database | Existing relational database, PostgreSQL where practical |
| Default instructional anonymity | Anonymous |
| Staff recruitment | Separate identified survey |
| Submission limit | One per eligible student by default, configurable |
| Deadline policy | Open near session end; close at event conclusion by default |
| Survey versions | Immutable once published |
| Instructor access | Opt-in, leadership-controlled |
| Editing after submission | Per-assignment setting |
| Draft persistence | Support if schedule permits; privacy-review anonymous drafts |
| Campaigns | Optional grouping |
| Historical retention | Define approved policy |
| Small-group threshold | Configurable; start with five for segmented reports |
| Shared metrics | Stable identifiers and documented scale mappings |

## 30. Final Design Recommendation

Build around five linked capabilities: **Template Library**, **Questionnaire Builder**, **Assignment & Scheduling Manager**, **Operations Dashboard**, and **Reporting & Analytics**.

The most frequent LDI administrative action should be **assigning an existing evaluation to a scheduled session**, not rebuilding a questionnaire. A small library of standardized, versioned forms should support dozens or hundreds of individual evaluations through independent assignments, eligibility rules, schedules, and response sets.

This design maximizes day-of-event operational efficiency while preserving data integrity, privacy, and the ability to improve the program over future years.

---

*End of Software Requirements & Design Specification — Version 1.0*
