# Vercel testing deployment

The original Vercel build failed because `DJANGO_SECRET_KEY` was missing. The local `.env` is intentionally excluded from Git. Supply deployment secrets securely through **Vercel → Project → Settings → Environment Variables**; never commit them or paste them into chat.

Vercel functions have a read-only deployment bundle and temporary, instance-local writable storage. The local SQLite database and uploaded media cannot become permanent cloud storage just by deploying this repository. This configuration therefore provides an **explicit disposable testing mode**, with a visible warning on login and every workspace page. It needs no external database or storage subscription.

## Deploy the test app

1. Import `hague143/operation-engineer` into Vercel and select `feature/assetinspect` (or the branch containing this fix).
2. Use the repository root as **Root Directory** and **Django** as the framework. The committed `vercel.json` sets **Build Command** to `python scripts/build_vercel.py`. Remove older dashboard overrides such as `npm run build`, a static output directory, or old hand-written `/api` rewrites. Leave Install Command and Output Directory at their Django defaults.
3. Add these four variables for **both Preview and Production**. Feature-branch deployments normally use Preview variables, so setting only Production does not fix their build.

| Name | Value |
| --- | --- |
| `ASSETINSPECT_VERCEL_DEMO` | `1` |
| `DJANGO_SECRET_KEY` | A new random secret of at least 50 characters |
| `DEMO_INSPECTOR_PASSWORD` | A password you choose, at least 12 characters |
| `DEMO_REVIEWER_PASSWORD` | A different password, at least 12 characters |

Generate the secret **on your own machine**, then copy its output directly into Vercel's secure value field:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

On Windows you can use `py -3.12` in place of `python`. No secret value is needed in GitHub or chat. Keep these values stable within the deployment; changing the secret logs users out.

4. Select **Redeploy** after saving the variables. A settings change does not modify an already built deployment. Ensure the deployment uses the new commit, not the earlier `0b18efe` build.
5. Open the Vercel deployment. Sign in as **`demo.inspector`** or **`demo.reviewer`**, using the respective password you configured. Three assets, six inspections, synthetic photographs, findings, and review history are generated during the build.

`DJANGO_DEBUG` is forced off in Vercel mode. Exact deployment/branch/production hostnames are read from Vercel's system environment variables; the application does not trust all `*.vercel.app` tenants. If system variables are disabled, enable them or provide your exact hostname in `DJANGO_ALLOWED_HOSTS`.

For a custom domain, set `DJANGO_ALLOWED_HOSTS` to that hostname (no scheme/path) and `DJANGO_CSRF_TRUSTED_ORIGINS` to its `https://` origin. Multiple values are comma-separated. Redeploy after editing. The proxy's forwarded HTTPS header is respected so login/CSRF and secure cookies work behind Vercel.

## What this mode does

- The build checks required settings, migrates a **separate synthetic database**, generates demo accounts/photos, and collects static files. Your local database, `.env`, and private photographs are never uploaded or migrated.
- Vercel's native Django integration discovers `assetinspect.wsgi.application` and serves collected CSS/JS/SVG through its static output. The synthetic database/private images are explicitly bundled into the function, not exposed as public static assets.
- A cold function instance copies the built synthetic template into its writable temporary directory. Startup does not run migrations or generate passwords/images on each request.
- Seeded account IDs and password hashes are identical across instances. Secure, signed-cookie sessions allow those sample users to stay authenticated across instances without a shared session database.
- New assets, annotations, uploads, review decisions, and reports still use the real application workflow and server-side permission rules **inside the current instance**.
- **Changes/uploads are temporary and may reset or differ between instances**, cold starts, scaling events, or redeployments. A later request can reach another instance and not find a newly created record. This mode is for synthetic testing, not durable records or guaranteed multi-instance workflow consistency. Signed-cookie logout clears that browser's cookie; it cannot centrally revoke an already copied cookie. Demo sessions expire after one hour.
- Vercel's request-body limit is below the original local upload limit. This mode limits photographs to **3 MB total per batch** (and per file), with matching browser/server validation. A gateway can still reject a request before Django if a client bypasses browser validation. Local development keeps its 10 MB/file, 8-file limits.
- Read-only submitted/approved evidence, independent review, authenticated image routes, CSV protection, and PDF disclaimers continue to apply. Sample accounts are not administrators.

Do not enter confidential asset data into this disposable deployment. For permanent saving, run the local app or deploy to a host with persistent storage; a durable Vercel deployment would require a shared database and private object storage, which this testing configuration does not claim to provide.

## Troubleshooting

| Error | Action |
| --- | --- |
| `DJANGO_SETTINGS_FAILED` / missing `DJANGO_SECRET_KEY` | Set the secret in **Preview and Production**, then redeploy the new commit. Do not add a default secret to source code. |
| Missing `ASSETINSPECT_VERCEL_DEMO` | Set it to `1`; the app refuses to silently use nonpersistent local settings on Vercel. |
| Missing/short/equal demo passwords | Set two distinct passwords of at least 12 characters; rebuild so the seeded accounts use them. |
| Missing demo template on startup | Restore the committed Build Command and `functions` includeFiles setting from `vercel.json`, then redeploy. |
| `DisallowedHost` | Enable Vercel system variables or add the exact deployment/custom hostname to `DJANGO_ALLOWED_HOSTS`; redeploy. |
| CSRF failure on a custom domain | Configure the exact HTTPS origin and allowed hostname; confirm you are using HTTPS, then clear old site cookies. |
| Upload returns `413` | Use a batch smaller than 3 MB; Vercel can reject oversized requests before Django. |
| Newly created record disappears | Expected limitation of instance-local demo state. Use local/persistent hosting when you need durable records. |

## Verification and scope

`python manage.py test` includes isolated Vercel build/configuration/cold-start tests: required secrets, exact hosts, HTTPS/CSRF login, debug disabled, signed sessions, sample private media, PDF/CSV exports, instance isolation, and upload limits. It builds only an isolated temporary project copy and does not touch your local data. `VERIFICATION.md` records the performed checks.

No Vercel account credentials are available to the coding agent, so the agent can prepare/push this fix and test the deployment paths locally, but cannot enter your secret values or claim that your hosted redeployment succeeded. Complete the settings and Redeploy steps above to apply it.
