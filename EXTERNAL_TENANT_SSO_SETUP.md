# External-Tenant SSO Setup

This guide explains how to let users sign in to CPS230 with Azure AD / Entra ID
**single sign-on when the app is hosted in a different Azure tenant than the one
that holds your users.**

If the app and your users live in the *same* tenant, you don't need this — the
standard SSO configuration in the deploy scripts covers it. Read on only for the
**cross-tenant** case.

---

## The two tenants

| | HOST tenant | SSO tenant |
|---|---|---|
| What it is | The Azure subscription where the CPS230 app is deployed | Your users' Azure AD / Entra directory |
| Lives here | Static Web App, Function App, PostgreSQL, **and the App Registration** | Your people (the accounts that sign in) |
| Who administers it | Whoever deploys/operates CPS230 | The customer's IT / identity admins |
| `az login` context during deploy | **This one** | — |

The connection between them is an **Enterprise App** (a service principal) that
gets created in the SSO tenant when one of its admins **grants consent** to the
host App Registration. That is the "connection configuration" — there is no
secret, no network peering, just a one-time consent.

### How a sign-in flows

1. A user opens the app (hosted in the HOST tenant).
2. The frontend sends them to **their own** directory to authenticate
   (`login.microsoftonline.com/<SSO-tenant-id>`).
3. Their tenant issues a token whose **audience is the host App Registration's
   client ID** and whose **issuer is the SSO tenant**.
4. The backend validates that token (issuer = SSO tenant, audience = host client
   ID) and maps the user to a CPS230 role.

---

## Configuration values

Both the frontend and backend use the same two identifiers:

| Setting (frontend / backend) | Value |
|---|---|
| `VITE_AZURE_TENANT_ID` / `AZURE_TENANT_ID` | **SSO (users') tenant ID** |
| `VITE_AZURE_CLIENT_ID` / `AZURE_CLIENT_ID` | **Host App Registration's Application (client) ID** |
| `INITIAL_PROMASTER_EMAILS` (backend) | Comma-separated emails that become admin on first SSO login |
| `ENABLE_AAD_USER_MANAGEMENT` (backend) | `false` — the customer manages their own users |

> The token **audience is always the host client ID**, regardless of which tenant
> the user came from. Only the *authority/issuer* (the tenant) changes. That's why
> the token-validation code needs no change beyond pointing `AZURE_TENANT_ID` at
> the SSO tenant.

---

## Prerequisites (HOST tenant)

Create an App Registration in the **host** tenant if you don't already have one:

1. Azure Portal → **Microsoft Entra ID → App registrations → New registration**.
2. **Supported account types:** *Accounts in any organizational directory
   (Any Microsoft Entra ID tenant – Multitenant)*.
   - The deploy scripts set this flag for you (`signInAudience =
     AzureADMultipleOrgs`), but selecting it here is fine too.
3. Leave the redirect URI blank for now — the deploy script adds the Static Web
   App URL as a **SPA** redirect URI automatically.
4. Copy the **Application (client) ID** — this is `AZURE_CLIENT_ID`.

You also need the **SSO tenant's Directory (tenant) ID** — ask the customer's
identity admin, or find it under Entra ID → Overview in the SSO tenant.

---

## Running the deploy

The deploy scripts walk you through all of this. When prompted:

- **Bash** (`./deploy.sh`) — answer *yes* to "Configure external-tenant SSO now?"
- **PowerShell** (`.\Deploy-ToAzure.ps1`) — enter the SSO tenant ID when asked.
- **Post-deploy only** (already deployed): `.\Manage-Access.ps1 -Action ConfigureSso`

You'll provide:

1. **Host App Registration client ID** (from the host tenant)
2. **SSO (users') tenant ID**
3. **Initial promaster email(s)** — who becomes admin on first login

The script then, all in the **HOST tenant**:

- Sets the App Registration to multi-tenant.
- Registers the Static Web App URL as a SPA redirect URI.
- Sets the Function App settings (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `INITIAL_PROMASTER_EMAILS`, `ENABLE_AAD_USER_MANAGEMENT=false`).
- Builds the frontend with the SSO values baked in and deploys it.

Finally it prints an **admin-consent URL** — the one action that happens in the
**SSO tenant**.

---

## The one SSO-tenant step: admin consent

A **Global Administrator (or Privileged Role Administrator) of the SSO tenant**
must open the consent URL the script prints:

```
https://login.microsoftonline.com/<SSO-TENANT-ID>/adminconsent?client_id=<HOST-CLIENT-ID>&redirect_uri=<APP-URL>
```

Approving it:

- Creates the **Enterprise App** (service principal) in the SSO tenant.
- Consents the delegated sign-in scopes (`openid`, `profile`, `email`,
  `User.Read`) — low-privilege, no directory write access.

Until this is done, users from the SSO tenant see **"need admin approval"
(AADSTS65001)** when they try to sign in.

Optionally, the SSO-tenant admin can restrict who gets the app under
**Enterprise applications → CPS230 → Properties → Assignment required = Yes**, then
assign specific users/groups.

---

## First admin (promaster)

There is **no "first user becomes admin"** behavior in external-tenant mode — the
first person to sign in could be anyone in the customer's directory, so that would
be unsafe. Instead:

- Emails in `INITIAL_PROMASTER_EMAILS` get **promaster** on their first SSO login;
  everyone else starts as **user**.
- Or sign in with the **seeded local admin** (created during deploy) and assign
  roles from the app's user-management screen.

To change the list later:

```bash
az functionapp config appsettings set \
  --name <function-app> --resource-group <rg> \
  --settings INITIAL_PROMASTER_EMAILS="alice@customer.com,bob@customer.com"
```

(It only affects users at the moment their profile is first created; existing
users' roles are unchanged.)

---

## User management

CPS230 does **not** create or delete users in the SSO tenant. Those users are
managed by the customer in **their own** Entra portal. The in-app "Azure AD user
management" endpoints are disabled (`ENABLE_AAD_USER_MANAGEMENT=false`) and return
403 if called. Only enable them if the App Registration and the users share one
tenant *and* the app has been granted Graph directory permissions there.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `AADSTS65001` "need admin approval" | Consent not granted in SSO tenant | Have an SSO-tenant admin open the consent URL |
| `AADSTS50020` / `AADSTS700016` | App Registration still single-tenant | Set it to multi-tenant (re-run the script, or set it in the portal) |
| `AADSTS900144` empty client_id | Frontend built without `VITE_AZURE_CLIENT_ID` | Rebuild/redeploy the frontend (or run `Manage-Access.ps1 -Action ConfigureSso`) |
| Sign-in works but backend returns 401 | `AZURE_TENANT_ID` on the Function App points at the wrong tenant | Set it to the **SSO** tenant ID |
| New SSO user isn't admin | Email not in `INITIAL_PROMASTER_EMAILS` | Add it, or promote them from a local admin |

---

## What changes vs. same-tenant SSO — quick reference

- App Registration is **multi-tenant** and lives in the **host** tenant.
- `AZURE_TENANT_ID` / `VITE_AZURE_TENANT_ID` point at the **SSO** tenant, not the host.
- An **admin-consent** step runs once in the SSO tenant.
- Admin is assigned via **`INITIAL_PROMASTER_EMAILS`**, not first-login.
- In-directory user provisioning is **off**.
