# Documentation

Everything needed to understand, build and run ShareRide. Start with the
[development strategy](strategy/development-strategy.md).

## Strategy

- [Development strategy](strategy/development-strategy.md): the whole plan on a few pages
- [Roadmap](strategy/roadmap.md): phases, tracks and exit criteria
- [Open questions](strategy/open-questions.md): decisions still to make, with recommendations

## Product

- [Vision](product/vision.md): problem, users, what makes us different, success metrics
- [Features](product/features.md): MVP, launch and later
- [Pricing and seats](product/pricing-and-seats.md): the business rules
- [Meeting points](product/meeting-points.md): selection criteria, data, launch corridors

## Architecture

- [Overview](architecture/overview.md): system context, containers, modules, key flows, repository layout
- [Domain model](architecture/domain-model.md): entities, invariants, lifecycles, events
- [Integrations](architecture/integrations.md): external services and the rules for using them

## Decisions

- [Architecture Decision Records](decisions/README.md): index, process and template

## Engineering

- [Workflow](engineering/workflow.md): idea to production, and how Claude Code fits in
- [Conventions](engineering/conventions.md): code, money, time, i18n, API, database, accessibility
- [Testing strategy](engineering/testing-strategy.md)
- [CI/CD and releases](engineering/ci-cd-and-releases.md)
- [Security](engineering/security.md)
- [Claude Code setup](engineering/claude-code-setup.md): plugins, skills and why

## Operations

- [Staging runbook](operations/staging.md): set up, deploy, roll back, logs, restore

## Compliance

- [Legal and regulatory](compliance/legal-and-regulatory.md): taxi law, insurance, company, tax, payments, platform rules
- [Privacy and GDPR](compliance/privacy-gdpr.md): data inventory, rights, retention, breaches

## Working documents

- [Specs](specs/README.md): one design spec per feature
- [Plans](plans/README.md): one implementation plan per spec
- [Glossary](glossary.md): shared vocabulary in English and Icelandic

## Writing docs

- English, plain language, short sentences.
- Each doc starts with its owner and "Last reviewed" date; update the date when
  you check it.
- Link instead of repeating. One fact lives in one place.
- Diagrams in Mermaid so they are versioned with the text.
