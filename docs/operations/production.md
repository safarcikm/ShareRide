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

Done on 2026-11-22, except steps 10 and 11 (still Martin's). Kept for a
rebuild and as the record. Claude first merges the blueprint and the
published legal texts, and makes the first release, which creates the
`production` branch that Render needs. Then Martin's steps, in order. Keys go into Render's secret store only, never into chat, email or
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
   project files, `meeting-points/`), then the same for
   `packages/db/src/places/sight-meeting-points.csv`, the sights' car parks
   ([spec 21](../specs/2026-11-22-meeting-points-for-every-settlement.md),
   3.6). The points arrive as drafts. Check each one and activate it, or
   use **Confirm and activate** on the list for the ones that pass the
   checks; a photo is recommended, not required (ADR 0036). Nobody can post
   a ride until points are active. The console needs you to choose the file
   yourself: Claude cannot attach a file in the browser.
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
9. **Staging stays open.** Martin chose on 2026-11-22 to leave **Invite
   code required** off on staging too. Its pages tell search engines not to
   list them (spec 23). To close it later: staging's console, **Settings**,
   **Beta**, turn on **Invite code required**; testers then get codes from
   the console.
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
- `WEB_APP_URL` stays `https://puffinride.is`: members' Face ID or
  fingerprint is bound to its host (ADR 0048), so a change stops every
  device set up before it, and each member sets it up again in Settings.
- [Show the puffin beside our emails](staging.md#show-the-puffin-beside-our-emails):
  one `hello@` user for both.

## Get an email when people join

Each operator chooses this for themselves
([spec 25](../specs/2026-11-23-new-member-emails.md)):

1. Make sure your PuffinRide account has a confirmed email address: in the
   app, **Settings**, add it and open the link in the email.
2. In the console, **Emails to you**, tick **Email me when new members
   join**. It says **Saved.** and where the emails go.

The first email comes a minute or so after someone finishes signing up;
anyone who joins in the hour after that comes in the next one. Untick it to
stop.

## Turn on photos

Done on 2026-11-22. Production keeps its photos apart from staging's.
Hetzner's S3 credentials open every bucket in their project, so the
production bucket goes in a Hetzner project of its own:

1. In the Hetzner Console, **New project** `PuffinRide production`, then
   **Object Storage**, **Create Bucket**: location Nuremberg (`nbg1`), name
   `puffinride-photos`, visibility **Private**.
2. In that project's **Security**, **S3 credentials**, generate
   credentials and copy the secret key straight into Render.
3. In `puffinride-api`, **Environment**: `PHOTO_STORAGE` = `hetzner`,
   `PHOTO_BUCKET_ENDPOINT` = `https://nbg1.your-objectstorage.com`,
   `PHOTO_BUCKET` = `puffinride-photos`, and `PHOTO_BUCKET_ACCESS_KEY` and
   `PHOTO_BUCKET_SECRET_KEY`, all five in one save; with only the keys,
   photos stay off. Render deploys again. Check: the page's
   `Content-Security-Policy` names
   `https://puffinride-photos.nbg1.your-objectstorage.com` under `img-src`.
4. Check as on staging ([Turn on photos](staging.md#turn-on-photos), step 4).

## Google Search Console

Search engines may index production's public pages only (spec 23): Find,
the meeting points, the places, the legal texts and Cookies, each in Icelandic
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
   (On 2026-11-23 Google verified the domain on its own, from the record
   Google Workspace already has, so this step was not needed.)
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

## Turn on Google Analytics

The website counts visits with Google Analytics only for visitors who
accept the question about cookies, and only by each screen's pattern
([spec 23](../specs/2026-11-22-google-analytics-and-search.md),
[ADR 0045](../decisions/0045-google-analytics-on-the-website-after-consent.md)).
Without `GOOGLE_ANALYTICS_ID` the site asks nothing and loads nothing from
Google; the phone apps never count.

Done on 2026-11-23: account `PuffinRide` (417208564), property `PuffinRide`
(565494786), web stream `PuffinRide website` with measurement ID
`G-7FY53BDC5M`, set in Render. The steps, for a new property:

Once, as `admin@puffinride.is`:

1. In [Google Analytics](https://analytics.google.com), **Admin**,
   **Create**, **Account** `PuffinRide`, then **Property** `PuffinRide`:
   time zone Iceland, currency ISK. Accept the **data processing terms**
   when asked (**Admin**, **Account details**, **Data processing terms**).
2. **Data streams**, **Add stream**, **Web**: `https://puffinride.is`,
   name `PuffinRide website`. Turn **Enhanced measurement** off: it would
   send the real address of each screen.
3. In the property, **Data collection and modification**:
   **Data retention**: event data **14 months**, and **Reset on new user
   activity** off, so nothing is kept longer than the privacy policy says;
   **Data collection**: Google signals off, and under **Advanced settings to
   allow for ads personalization**, **Disallow all** regions. In the
   account's **Account details**, data sharing: every box off.
4. Copy the stream's **Measurement ID** (`G-` and ten letters and digits).
5. In Render, `puffinride-api`, **Environment**: `GOOGLE_ANALYTICS_ID` =
   that ID. Save; Render deploys again. The ID is not a secret, but it is
   set here, not in the blueprint, so staging never counts.

To check: open `https://puffinride.is` in a private window. The question
about cookies shows at the bottom, and the browser's network tab shows
nothing from Google. **Accept**: `gtag/js` loads, and Google Analytics'
**Realtime** report shows one visitor on `/` within a minute. Open a trip:
Realtime shows `/trips/[id]`, never the trip's ID. On **Cookies** (Cookies
at the end of the front page, or Profile, About PuffinRide, Cookies), turn
it off: the `_ga` cookies go.

Links in ads and on flyers can carry campaign tags, such as
`https://puffinride.is/?lang=is&utm_source=flyer&utm_medium=qr&utm_campaign=launch`,
and Google Analytics shows them under **Acquisition**. Only `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content` and `utm_term` are kept, with
letters, digits, dots, dashes and underscores; anything else in the address
never reaches Google.

To turn it off for everyone, remove `GOOGLE_ANALYTICS_ID` in Render: the
question and Google's tag go with the next deploy. Cookies already set
expire on their own (13 months at most).

Privacy Policy version 3 describes it and is not material, so nobody
accepts it again. Announce it with an announcement in the console if you
like (spec 1, 3.4: minor changes are announced without blocking).

## Upgrade to Render Pro

ADR 0018 recommends Render's Pro plan for production: 7 days of
point-in-time recovery instead of 3, and environments isolated from each
other's private network. It costs about $25 a month on top of the
services. After upgrading, open the project, the `production` environment,
**Settings**: turn on blocking private network traffic across its boundary,
and mark it protected. The recovery window grows from then on; it does not
reach back.
