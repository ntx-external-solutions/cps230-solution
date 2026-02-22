# Azure AD B2C Setup Guide - Step by Step

Follow these steps exactly - I've automated everything else!

## Part 1: Create B2C Tenant (5 minutes - Portal)

### Step 1: Open the B2C Creation Page
1. Click this link: https://portal.azure.com/#create/Microsoft.AzureActiveDirectoryB2C
2. Click **"Create a new Azure AD B2C Tenant"**

### Step 2: Fill in the Form
```
Organization name:     CPS230 Solution
Initial domain name:   cps230solution    ← Try this first
                      (if taken, try: cps230dev or cps230palouse)
Country/Region:        Australia
```

### Step 3: Create
- Click **"Review + create"**
- Click **"Create"**
- Wait 2-3 minutes (the portal will show a progress indicator)

### Step 4: Note Your Tenant Name
Once created, you'll see a message like:
```
Your Azure AD B2C tenant has been created: cps230solution.onmicrosoft.com
```
**Write down** the name before `.onmicrosoft.com` (e.g., `cps230solution`)

---

## Part 2: Run Automated Setup (2 minutes - Terminal)

Once the tenant is created, come back here and run:

```bash
./setup-b2c.sh
```

This script will:
- ✅ Switch to your B2C tenant
- ✅ Create the app registration
- ✅ Configure redirect URIs
- ✅ Save your configuration

**When prompted**, enter the tenant name you wrote down (e.g., `cps230solution`)

---

## Part 3: Create User Flow (3 minutes - Portal)

The script will tell you to create a user flow. Here's exactly how:

### Step 1: Navigate to B2C
1. Go to: https://portal.azure.com
2. In the top-right corner, click your profile icon
3. Click **"Switch directory"**
4. Select **"CPS230 Solution"** (your B2C tenant)
5. In the search bar at top, type: **"Azure AD B2C"**
6. Click **"Azure AD B2C"** from the results

### Step 2: Create User Flow
1. In the left menu, click **"User flows"**
2. Click **"+ New user flow"**
3. Select **"Sign up and sign in"**
4. Click **"Recommended"** version
5. Click **"Create"**

### Step 3: Configure the Flow
Fill in the form:

```
Name: signupsignin

Local accounts
├─ Email signup: ✓ (checked)

Multifactor authentication
├─ (leave as default - optional)

User attributes and token claims
├─ Click "Show more..."
├─ Select these checkboxes:
   Collect attribute    Return claim
   ✓ Email Address     ✓ Email Addresses
   ✓ Display Name      ✓ Display Name
                       ✓ User's Object ID
```

4. Scroll to bottom and click **"Create"**

### Step 4: Verify
You should see "B2C_1_signupsignin" in your user flows list.

---

## Part 4: Final Configuration (2 minutes - Terminal)

Back in your terminal, run:

```bash
./configure-deployment.sh
```

This will automatically:
- ✅ Update Function App with B2C settings
- ✅ Update frontend environment variables
- ✅ Rebuild the frontend
- ✅ Deploy to Static Web App

---

## Part 5: Create Your Admin Account (2 minutes)

1. Visit: **https://ambitious-meadow-01fb2d300.4.azurestaticapps.net**
2. Click **"Sign Up"**
3. Enter:
   - Email: `jonathan@palouse.io`
   - Display Name: `Jonathan Butler`
   - Password: (create a secure password)
4. Complete the sign-up process

---

## Part 6: Promote to Promaster (1 minute - Terminal)

Run this to connect to the database:

```bash
psql "host=psql-cps230-dev-w4n7p6pwjelzi.postgres.database.azure.com dbname=cps230 user=cps230admin sslmode=require"
```

When prompted for password, use: `P@ssw0rd123!SecurePassword`

Then in psql, run:

```sql
UPDATE user_profiles
SET role = 'promaster'
WHERE email = 'jonathan@palouse.io';

-- Verify it worked
SELECT email, role FROM user_profiles;

-- Exit
\q
```

---

## ✅ You're Done!

Visit https://ambitious-meadow-01fb2d300.4.azurestaticapps.net and sign in!

You should now have full Promaster access to:
- ✅ Manage users
- ✅ Create/edit systems
- ✅ Create/edit processes
- ✅ Configure settings
- ✅ Sync with Nintex PM

---

## Troubleshooting

**"Tenant name is already taken"**
→ Try: `cps230dev`, `cps230palouse`, or `cps230test`

**"Can't find the B2C tenant"**
→ Make sure you switched directory in the portal (top-right corner)

**"App registration failed"**
→ Make sure you're logged into the B2C tenant: `az login --tenant [your-tenant].onmicrosoft.com --allow-no-subscriptions`

**"User flow not showing up"**
→ Wait 30 seconds and refresh the portal page

**Need help?**
→ Check the console for errors or let me know where you're stuck!
