# Production runbook

**Owner:** Martin · **Last reviewed:** 2026-11-22

Production is the public PuffinRide at **`https://puffinride.is`**, on
Render in Frankfurt ([ADR 0018](../decisions/0018-hosting-on-render-frankfurt.md)),
described by its own blueprint,
[`infra/render/production.yaml`](../../infra/render/production.yaml), and
released with a button ([ADR 0042](../decisions/0042-production-on-render-released-with-a-button.md)).
It holds real people's data: follow the
[privacy rules](../compliance/privacy-gdpr.md), and never copy its data to
staging or a laptop. Staging stays as it is ([staging runbook](staging.md));
most procedures there work here too, on the production names below.

| Part | Render name | What it is |
| ---- | ----------- | ---------- |
| Project | `PuffinRide`, environment `production` | Groups production's parts in the dashboard |
| API and web app | `puffinride-api` | Web service built from `apps/api/Dockerfile`; serves `/v1`, the web app and the console at `/admin`, on one origin |
| Clean-up | `puffinride-clean-up` | Cron job, every hour at minute 17 (UTC), as on staging: retention and erasure (spec 11) |
| Domains | `puffinride.is`, `www.puffinride.is` | Render redirects `www` to `puffinride.is`; DNS in ISNIC DNS Hosting |
| Database | `puffinride-db` | PostgreSQL 18 with PostGIS, private network only; point-in-time recovery for 3 days (7 on Render's Pro plan) |
| Settings | `puffinride-production` | Environment group: `NODE_ENV=production`, `APP_ENV=production`, `LOG_LEVEL`, the Sentry DSNs |

What makes it production, rather than a second staging:

- `APP_ENV=production` refuses the sample trips and meeting points, the
  draft legal texts and test payments.
- It follows the `production` branch, not `main`: a merge reaches staging
  only, until someone releases it ([Release](#release)).
- Its own `AUTH_SECRET` and database. Email is on from the start
  (`EMAIL_PROVIDER=mailjet`). No payments in the app: passengers pay the
  driver in person (ADR 0038), switched on in the console.
- The console takes a password as well as passkeys while `ADMIN_PASSWORD`
  is set in the Render dashboard
  ([ADR 0044](../decisions/0044-console-password-on-production.md)); never
  put it in the blueprint.

## Set it up (once)

Claude first merges the blueprint and the published legal texts, and makes
the first release, which creates the `production` branch that Render needs. Then Martin's steps, in
order. Keys go into Render's secret store only, never into chat, email or
the repository.

1. **The blueprint.** In Render, **New**, **Blueprint**, the repository,
   branch `main`, and **Blueprint Path** `infra/render/production.yaml`.
   Render lists the project, the two services, the database and the group,
   and asks for the values the blueprint leaves out:
   - `SMS_PROVIDER`: `vonage`; `VONAGE_API_KEY` and `VONAGE_API_SECRET`:
     the same as staging's (Vonage dashboard, **API Settings**).
   - `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`: Mailjet, **Account
     settings**, **API key management**. `puffinride.is` must show as
     validated in Mailjet, with SPF and DKIM (staging runbook, "Turn on
     email"). The API does not start without them.
   - `GOOGLE_SIGN_IN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: leave
     empty for now; step 7 sets them.

   Choose **Apply**. The first build takes about 15 minutes. Check:
   `https://puffinride-api.onrender.com/v1/health/ready` (the service's own
   address, at the top of its page; Render may add letters to the name)
   answers `{"status":"ok"}`.
2. **Point the domain.** In ISNIC DNS Hosting, the domain `puffinride.is`,
   add two records. Leave the `staging` record and the Google Workspace and
   Mailjet records as they are.
   - type **A**, name empty, value `216.24.57.1` (Render's address for a
     domain itself; ISNIC has no ALIAS record);
   - type **CNAME**, name `www`, value the service's own address from step
     1, without `https://`.

   No `AAAA` record: Render answers on IPv4 only. In Render,
   `puffinride-api`, **Settings**, **Custom Domains**, choose **Verify**
   next to both. Check: `https://puffinride.is/v1/health/ready` answers
   `{"status":"ok"}`, `https://www.puffinride.is` leads to
   `https://puffinride.is`, and `puffinride.com` leads there too (its
   Cloudflare redirect, staging runbook, "Move to puffinride.is", step 3).
3. **Your own account.** On `https://puffinride.is`, sign up with your own
   phone. Check the texts you accept at `/legal/terms`, `/legal/privacy`
   and `/legal/community-rules`.
4. **The console.** Open `puffinride-api`, **Shell**, and run
   `node apps/api/src/operator-cli.ts add <your phone number>`: it gives
   your account the operator role and prints a link to save a passkey (it
   works once, for 30 minutes). Staging's passkeys and password do not work
   here. To sign in with a password instead
   ([ADR 0044](../decisions/0044-console-password-on-production.md)):
   - make a password of 12 characters or more that you use nowhere else,
     and keep it in your password manager;
   - in Render, `puffinride-api`, **Environment**, **Add Environment
     Variable**: key `ADMIN_PASSWORD`, value the password. **Save Changes**
     (Render deploys again, a few minutes);
   - at `https://puffinride.is/admin`, **Or sign in with a password**: your
     phone number and the password.

   To turn it off, delete `ADMIN_PASSWORD` there, then check **Passkeys**
   and the audit log as in the staging runbook ("Sign in with a password
   for now"). If you lose every passkey later, **Lost your passkey?** on the
   sign-in page texts a code to your phone, as on staging ("Lost every
   passkey").
5. **Settings in the console.** **Settings**, **Booking**: turn on **Pay
   the driver in person** and save; without it no booking can be confirmed,
   as production takes no payments in the app. Check that **Invite code
   required** is off.
6. **Meeting points.** **Meeting points**, **Import**, the file
   `packages/db/src/places/settlement-meeting-points.csv` (a copy is in the
   project files, `meeting-points/`). The points arrive as drafts. Check
   each one and activate it ([spec 21](../specs/2026-11-22-meeting-points-for-every-settlement.md));
   a photo is recommended, not required (ADR 0036). Nobody can post a ride
   until points are active.
7. **Google sign-in.** In [Google Cloud](https://console.cloud.google.com/),
   signed in as `admin@puffinride.is`, the project `PuffinRide`:
   - **Clients**, **Create client**: **Web application**, name
     `PuffinRide production`, one authorised redirect URI, exactly
     `https://puffinride.is/v1/auth/oauth/google/callback`. Copy the secret
     straight into Render.
   - **Branding**: home page `https://puffinride.is`, privacy policy
     `https://puffinride.is/legal/privacy`, terms of service
     `https://puffinride.is/legal/terms`. **Save**.
   - In Render, `puffinride-api`, **Environment**: `GOOGLE_SIGN_IN` =
     `google`, and the new client's `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET`. Save; Render deploys again.
8. **Uptime.** In Sentry, `shareride-api`, **Alerts**, **Uptime Monitors**:
   a monitor for `https://puffinride.is/v1/health/ready`, every minute,
   environment `production`, alerting you by email and in the Sentry app.
9. **Close staging to strangers.** In staging's console,
   **Settings**, **Beta**: turn on **Invite code required**, so nobody
   signs up on staging by mistake. Testers get codes from the console.
10. **Data agreements.** Sign each provider's data processing agreement
    and tick it in the [privacy register](../compliance/privacy-gdpr.md#providers):
    Render, Vonage, Sentry, Mailjet and, once photos are on, Hetzner. In
    Sentry's organisation **Security & Privacy**, turn on the data scrubber
    with its defaults and **Prevent Storing of IP Addresses**, and turn off
    **Allow Shared Issues** (staging runbook, "Error reports and uptime").
11. **Try it.** Post a ride from your account and book it from a second
    phone. Then tell Claude, who reads the logs and Sentry.

## Release

Production gets a version only when the GitHub action **Release to
production** runs ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)).
It moves the `production` branch to a commit on `main` whose CI passed, and
Render deploys it: migrations first (`preDeployCommand`), then traffic once
`/v1/health/ready` answers. If either fails, the running version stays.

Claude releases after checking staging, and tells Martin; Martin can too.
Before a release:

1. Staging runs the commit: its **Events** show the deploy live, and
   `https://staging.puffinride.is/v1/health/ready` answers.
2. Sentry shows no new error from staging since that deploy.
3. The two-deploy rule ([conventions](../engineering/conventions.md#database)):
   if the commits since the last release both teach the code to read a new
   kind of data and start saving it, release the reading half first.

To release: on GitHub, **Actions**, **Release to production**, **Run
workflow**. Leave **commit** empty for the newest commit on `main` whose
CI passed, which is what staging runs, or give one. The run's summary lists
the commits and migrations it brings. Docs-only commits deploy nothing.

## Change a legal text

The texts people accept are files in `packages/db/src/legal/texts`,
published on deploy
([ADR 0043](../decisions/0043-legal-documents-published-from-the-repository.md)).
A change is a new version: Claude adds its two files, in English and
Icelandic, and lists it in `published.ts` with a short summary of what
changed and whether it is material. A material version is accepted again by
everyone before they book, post or chat. Staging shows it after the merge,
production after the next release. A published file never changes: the
tests fail if it does.

## Roll back

1. Open `puffinride-api`, **Deploys**, find the last good deploy and choose
   **Rollback**. Render reuses its build, so it is quick. It turns off
   automatic deploys; turn them on again in **Settings** after step 2.
2. Release the same commit with the action, giving its commit and ticking
   **older**, so the branch says what runs. Or release a fix instead.

The database keeps newer migrations, which the older version must still
read: that is what the two-deploy rule is for. A legal version that a newer
release published stays published. The cron job has its own
**Deploys** page.

## Everything else

These work as in the [staging runbook](staging.md), on `puffinride-api`,
`puffinride-clean-up` and `puffinride-db`:

- [Read logs](staging.md#read-logs) and
  [error reports](staging.md#error-reports-and-uptime): Sentry's projects
  are shared, so filter on the environment `production`.
- [Switch SMS provider](staging.md#switch-sms-provider) and
  [Pause SMS](staging.md#pause-sms).
- [Restore the database](staging.md#restore-the-database), including
  `privacy reapply-erasures`. For production the blueprint to change is
  `infra/render/production.yaml`.
- [Retention runs and holds](staging.md#retention-runs-and-holds) and
  [Answer privacy requests](staging.md#answer-privacy-requests).
- [Rotate a secret](staging.md#rotate-a-secret).
- [Show the puffin beside our emails](staging.md#show-the-puffin-beside-our-emails):
  one `hello@` user for both.

## Turn on photos

Production keeps its photos apart from staging's. Hetzner's S3 credentials
open every bucket in their project, so the production bucket goes in a
Hetzner project of its own:

1. In the Hetzner Console, **New project** `PuffinRide production`, then
   **Object Storage**, **Create Bucket**: location Nuremberg (`nbg1`), name
   `puffinride-photos`, visibility **Private**.
2. In that project's **Security**, **S3 credentials**, generate
   credentials and copy the secret key straight into Render.
3. In `puffinride-api`, **Environment**: `PHOTO_STORAGE` = `hetzner`,
   `PHOTO_BUCKET_ENDPOINT` = `https://nbg1.your-objectstorage.com`,
   `PHOTO_BUCKET` = `puffinride-photos`, and `PHOTO_BUCKET_ACCESS_KEY` and
   `PHOTO_BUCKET_SECRET_KEY`. Save; Render deploys again.
4. Check as on staging ([Turn on photos](staging.md#turn-on-photos), step 4).

## Google Search Console

Search engines may index production's public pages only (spec 23): Find,
the meeting points, the places and the legal texts, each in Icelandic
(`?lang=is`) and English (`?lang=en`). The API serves `/robots.txt` and
`/sitemap.xml` from the active meeting points and the places, and answers
everything else, and every address on staging, with `X-Robots-Tag: noindex`.
Nothing to set: it follows `APP_ENV` (production when unset) and
`WEB_APP_URL`.

To tell Google about the site, once:

1. Open [Search Console](https://search.google.com/search-console) signed in
   as `admin@puffinride.is`, **Add property**, **Domain**: `puffinride.is`.
   Google shows a TXT record (`google-site-verification=…`).
2. At ISNIC, **DNS Hosting** for `puffinride.is`, add a **TXT** record on
   the domain itself (`@`) with that value. Keep the A and CNAME records.
3. Back in Search Console, **Verify**. It can take a few minutes, sometimes
   hours, for the record to show.
4. **Sitemaps**: add `https://puffinride.is/sitemap.xml`. Its status should
   become "Success", with the pages found.
5. Check one address with **URL inspection**, for example
   `https://puffinride.is/?lang=is`: "URL is available to Google", and
   **Test live URL** shows the page with its title.

The domain property covers `staging.puffinride.is` too: should a staging
address ever show in results, **Removals** hides it while the noindex drops
it.

## Upgrade to Render Pro

ADR 0018 recommends Render's Pro plan for production: 7 days of
point-in-time recovery instead of 3, and environments isolated from each
other's private network. It costs about $25 a month on top of the
services. After upgrading, open the project, the `production` environment,
**Settings**: turn on blocking private network traffic across its boundary,
and mark it protected. The recovery window grows from then on; it does not
reach back.
