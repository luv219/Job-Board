# Job Board Application — project overview

## Summary

A full-stack TypeScript Job Board for Applicants and Employers. The project focuses on realistic ownership, lifecycle, security, and operations constraints rather than only CRUD screens.

Applicants create a profile, maintain a private PDF resume, discover/save Jobs, submit one Application per Job, track status, and withdraw eligible Applications. Employers create a Company, manage Job lifecycle, review authorized Applications, access immutable resume snapshots, and move candidates through the implemented hiring states.

The architecture is a React/Express/MongoDB modular monolith with small shared contracts. It uses rotating refresh sessions, ownership-scoped queries, provider boundaries for email/storage, Docker production images, CI quality gates, metrics, and guarded local performance tooling.

## Engineering challenges

- Preserving one-Application-per-Applicant/Job under concurrent submissions.
- Separating a mutable current resume from the immutable record used for a submitted Application.
- Keeping role and Company ownership authorization inside API/database filters.
- Supporting deterministic local search while allowing an explicit Atlas Search configuration.
- Maintaining destructive-test and performance-seed guardrails.

## Resume-ready project entry

**Job Board Application — MERN, TypeScript, Docker**

- Built an Applicant/Employer Job Board with profile management, Company-owned Job lifecycle, saved Jobs, and hiring-pipeline workflows.
- Implemented Argon2id authentication, short-lived JWT access tokens, rotating hashed refresh sessions, role/ownership authorization, verification, and password recovery.
- Designed private PDF resume storage with immutable Application snapshots and database-enforced duplicate-application protection.
- Added Dockerized non-root production artifacts, GitHub Actions quality gates, structured metrics, and guarded local MongoDB performance tooling.

## Current limitations and next scale decisions

There is no deployed demo, automatic deployment, recruiter-team model, messaging, scheduling, payments, AI matching, Redis, or worker queue. Atlas Search, SMTP, and Cloudinary require environment configuration. The next scale choices should follow observed SLO, latency, and multi-replica evidence—not a speculative infrastructure migration.
