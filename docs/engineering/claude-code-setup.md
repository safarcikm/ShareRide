# Claude Code setup

**Owner:** Martin · **Last reviewed:** 2026-11-13

Which plugins, skills and tools to install for this project, and why. Fewer,
well-chosen plugins work better than many: each one adds instructions to every
session, and overlapping workflows confuse each other.

## Terms

- **Skill:** a packaged set of instructions Claude loads when a task matches
  (for example "test-driven development").
- **Plugin:** a bundle of skills, commands, agents, hooks and MCP servers,
  installed from a marketplace.
- **MCP server:** a connection that gives Claude tools or live data (for
  example up-to-date library docs).
- **Project skill:** a skill committed in this repository under
  `.claude/skills/`, shared by everyone who works here.

All plugins below are in Anthropic's official marketplace,
`claude-plugins-official`, unless noted.

## Install now (Phase 1)

| Plugin | Why ShareRide needs it |
| ------ | ---------------------- |
| `superpowers` | The development method: brainstorm, write a spec, write a plan, build with test-driven development, review, finish the branch. Keeps AI-written code disciplined and leaves specs and plans in the repo for later review. |
| `frontend-design` | Produces distinctive, polished interfaces instead of generic ones. Useful from the first prototypes through every screen. |
| `context7` | Fetches current documentation for fast-moving libraries (Expo, React Native, MapLibre, Drizzle, Hono) so Claude doesn't rely on outdated memory. |
| `security-guidance` | Warns about security problems while code is written and reviews diffs. ShareRide handles identity, location and later money. |
| `pr-review-toolkit` | Specialised review agents for tests, error handling, type design, comments and simplification. Gives the owner a second pair of eyes before every merge. |
| `claude-md-management` | Keeps `CLAUDE.md` accurate as the project evolves; `/revise-claude-md` captures lessons from a session. |

## Install when the code is scaffolded (Phase 2)

| Plugin | Why |
| ------ | --- |
| `expo` | Official Expo skills (Expo Router, native UI, data fetching, upgrades, EAS builds, store submission, updates, workflows) plus the Expo MCP server. ADR 0003 is accepted; install it when the app is scaffolded. |
| `typescript-lsp` | Real code intelligence (go to definition, type errors) once TypeScript code exists. Needs `typescript-language-server` installed: `npm install -g typescript-language-server typescript`. |
| `playwright` | Lets Claude drive a browser to test and screenshot the web app. |

## Consider later

| Plugin | When |
| ------ | ---- |
| Sentry plugin (plugin directory) | When error tracking is connected, to investigate issues from Claude Code |
| `supabase` (plugin directory) | Only if the backend decision changes to Supabase |
| Design plugin by Anthropic (plugin directory) | For design critique, UX copy and accessibility reviews if design work grows |

## Deliberately not installed

- **Other Superpowers variants** (forks and remixes in the directory). One
  method only; two would compete for the same triggers.
- **`feature-dev`, `commit-commands`, `code-simplifier`.** Useful plugins, but
  Superpowers and `pr-review-toolkit` already cover these steps.
- **Community React Native skill packs.** The official Expo plugin covers this
  ground and is maintained by the Expo team.

## How to install

**Option A: in the Claude app or claude.ai.** Open the plugin directory, find
each plugin and enable it. Plugins enabled on your account sync to Claude Code
on all your devices.

**Option B: in the terminal.**

```sh
claude plugin install superpowers@claude-plugins-official --scope project
claude plugin install frontend-design@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
claude plugin install security-guidance@claude-plugins-official --scope project
claude plugin install pr-review-toolkit@claude-plugins-official --scope project
claude plugin install claude-md-management@claude-plugins-official --scope project
```

Or inside a session: `/plugin install superpowers@claude-plugins-official`.

The repository's [.claude/settings.json](../../.claude/settings.json) lists the
Phase 1 plugins under `enabledPlugins`, so Claude Code knows this project uses
them. Plugins hosted outside the marketplace repository (Superpowers is one)
still need the install command above once per machine; Claude Code shows
"enabled in project settings but isn't installed" until then.

## Project skills (in this repository)

| Skill | What it does |
| ----- | ------------ |
| `write-adr` | Creates a new ADR from the template with the next number, fills in context and options, and updates the ADR index. |

More project skills are added when a task repeats often enough to deserve one
(for example "add a meeting point" or "add a translation key"). Create them
with Superpowers' `writing-skills` or the skill-creator skill, and commit them
under `.claude/skills/`.

## Shared settings

`.claude/settings.json` (committed) holds team settings: enabled plugins and
permission rules, including a deny rule for reading `.env` files.
`.claude/settings.local.json` is for personal overrides and is ignored by git.

## Keeping this current

Review this list at the start of each phase. When adding or removing a plugin,
update this file and `.claude/settings.json` in the same PR, with the reason.
