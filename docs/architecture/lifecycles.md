# Job, Application, and resume lifecycles

## Job lifecycle

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PUBLISHED
  DRAFT --> ARCHIVED
  PUBLISHED --> CLOSED
  CLOSED --> ARCHIVED
```

Only Draft and Published Jobs can be edited. Public reads require `PUBLISHED` and a non-expired deadline; reads do not silently change status.

## Application lifecycle

`CREATING` is a technical reservation and never appears in Applicant-facing results.

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED
  SUBMITTED --> UNDER_REVIEW
  SUBMITTED --> SHORTLISTED
  SUBMITTED --> REJECTED
  UNDER_REVIEW --> SHORTLISTED
  UNDER_REVIEW --> REJECTED
  SHORTLISTED --> INTERVIEW
  SHORTLISTED --> REJECTED
  INTERVIEW --> OFFER
  INTERVIEW --> REJECTED
  OFFER --> HIRED
  OFFER --> REJECTED
  SUBMITTED --> WITHDRAWN
  UNDER_REVIEW --> WITHDRAWN
  SHORTLISTED --> WITHDRAWN
  INTERVIEW --> WITHDRAWN
  OFFER --> WITHDRAWN
```

The database unique index prevents duplicate Applicant/Job Applications. Status updates are conditional on the current status, protecting Employer-review and Applicant-withdrawal races.

## Resume flow

```mermaid
sequenceDiagram
  participant Applicant
  participant API
  participant Storage as Private storage
  participant DB as MongoDB
  Applicant->>API: Upload current PDF resume
  API->>Storage: Store private asset
  API->>DB: Save current safe metadata
  Applicant->>API: Submit Application
  API->>DB: Reserve unique Applicant and Job pair
  API->>Storage: Create immutable snapshot
  API->>DB: Finalize Application with snapshot metadata
```

A snapshot is independent of later current-resume replacement/deletion. Snapshot failure prevents a successful Application; a failure after snapshot creation triggers a cleanup attempt. Notification delivery is best effort after the database mutation and never rolls the mutation back.
