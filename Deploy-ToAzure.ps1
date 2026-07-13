<#
.SYNOPSIS
    CPS230 Solution - One-Click Azure Deployment Script (PowerShell)

.DESCRIPTION
    This script deploys the complete CPS230 solution to Azure including:
    - Azure Static Web App (Frontend)
    - Azure Functions (Backend API)
    - PostgreSQL Database
    - Key Vault
    - Application Insights & Monitoring

.PREREQUISITES
    - Azure CLI installed
    - Azure PowerShell module installed
    - Logged in to Azure (Connect-AzAccount)
    - Node.js 20.x installed
    - Git repository cloned

.EXAMPLE
    .\Deploy-ToAzure.ps1
#>

#Requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    # Set-Content -Encoding utf8 writes a BOM on Windows PowerShell 5.1, which
    # corrupts .env files and JSON request bodies. Write UTF-8 without a BOM on
    # every version.
    param([string]$Path, [string[]]$Lines)
    $content = ($Lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# Display banner
Write-Host @"

  ______ _____   _____ _____  ____   ___
 / _____|  __ \ / ____|  __ \/__ \ / _ \
| |     | |__) | (___ | |__) | ) || |_| |
| |     |  ___/ \___ \|  ___/ / /  \__  |
| |____ | |     ____) | |    / /_     | |
 \_____ |_|    |_____/|_|   |____|    |_|

Azure Deployment Script (PowerShell)

"@ -ForegroundColor Cyan

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (!(Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Azure CLI is not installed. Please install from https://aka.ms/azure-cli" -ForegroundColor Red
    exit 1
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed. Please install version 20.x from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check if logged in to Azure
try {
    az account show | Out-Null
} catch {
    Write-Host "ERROR: Not logged in to Azure. Please run 'az login' first." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Prerequisites check passed`n" -ForegroundColor Green

# Get deployment parameters
Write-Host "=== Deployment Configuration ===" -ForegroundColor Blue

$environment = Read-Host "Environment name (dev/staging/prod) [default: prod]"
if ([string]::IsNullOrWhiteSpace($environment)) { $environment = "prod" }

$location = Read-Host "Azure location [default: australiaeast]"
if ([string]::IsNullOrWhiteSpace($location)) { $location = "australiaeast" }

$resourceGroup = Read-Host "Resource group name [default: rg-cps230-$environment]"
if ([string]::IsNullOrWhiteSpace($resourceGroup)) { $resourceGroup = "rg-cps230-$environment" }

$baseName = Read-Host "Base name for resources [default: cps230]"
if ([string]::IsNullOrWhiteSpace($baseName)) { $baseName = "cps230" }

$postgresPassword = Read-Host "PostgreSQL admin password (min 8 chars)" -AsSecureString
$postgresPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($postgresPassword))

if ($postgresPasswordPlain.Length -lt 8) {
    Write-Host "ERROR: Password must be at least 8 characters" -ForegroundColor Red
    exit 1
}

# Initial admin account = the first application login (local username/password),
# kept separate from the PostgreSQL database password.
$adminEmail = Read-Host "Admin username (email address)"
if ([string]::IsNullOrWhiteSpace($adminEmail)) {
    Write-Host "ERROR: Admin email is required" -ForegroundColor Red
    exit 1
}

$adminFullName = Read-Host "Admin full name [System Administrator]"
if ([string]::IsNullOrWhiteSpace($adminFullName)) { $adminFullName = "System Administrator" }

# Dedicated admin password (prompted + confirmed), NOT reused from PostgreSQL.
$adminPasswordPlain = $null
while ($true) {
    $adminPasswordSecure = Read-Host "Admin password (min 8 chars)" -AsSecureString
    $adminPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPasswordSecure))
    if ($adminPasswordPlain.Length -lt 8) {
        Write-Host "ERROR: Admin password must be at least 8 characters" -ForegroundColor Red
        continue
    }
    $adminConfirmSecure = Read-Host "Confirm admin password" -AsSecureString
    $adminConfirmPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminConfirmSecure))
    if ($adminPasswordPlain -ne $adminConfirmPlain) {
        Write-Host "ERROR: Passwords do not match; please try again" -ForegroundColor Red
        continue
    }
    break
}

# External-tenant SSO (optional). Leave the SSO tenant blank to deploy with local
# authentication only. Two directories are involved:
#   * HOST tenant – where you are deploying (this az/az login context). The App
#     Registration lives here and must be multi-tenant.
#   * SSO tenant  – your users' Azure AD / Entra directory. Its admin grants
#     consent (URL printed at the end) to create the Enterprise App there.
# These values are baked into the frontend at build time and set on the Function
# App, so they must be collected before the frontend is built.
Write-Host ""
Write-Host "SSO lets users from a SEPARATE Azure AD (Entra) tenant sign in." -ForegroundColor Cyan
Write-Host "You need a multi-tenant App Registration in the HOST tenant first." -ForegroundColor Cyan
$azureTenantId = Read-Host "SSO (users') Directory (tenant) ID (optional, blank = local auth only)"
$azureClientId = ""
$initialPromasterEmails = ""
if (![string]::IsNullOrWhiteSpace($azureTenantId)) {
    $azureClientId = Read-Host "Host App Registration - Application (client) ID"
    if ([string]::IsNullOrWhiteSpace($azureClientId)) {
        Write-Host "ERROR: Client ID is required when an SSO tenant is provided" -ForegroundColor Red
        exit 1
    }
    $initialPromasterEmails = Read-Host "Initial promaster email(s), comma-separated (blank = assign via local admin)"
}

# Get GitHub repository URL (optional)
try {
    $githubRepo = git config --get remote.origin.url 2>$null
} catch {
    $githubRepo = ""
}

$githubRepoInput = Read-Host "GitHub repository URL [default: $githubRepo]"
if (![string]::IsNullOrWhiteSpace($githubRepoInput)) { $githubRepo = $githubRepoInput }

# Display summary
Write-Host "`n=== Deployment Summary ===" -ForegroundColor Yellow
Write-Host "Environment: $environment"
Write-Host "Location: $location"
Write-Host "Resource Group: $resourceGroup"
Write-Host "Base Name: $baseName"
Write-Host "Admin Email: $adminEmail"
if ([string]::IsNullOrWhiteSpace($azureTenantId)) {
    Write-Host "External-tenant SSO: not configured (local auth only)"
} else {
    Write-Host "External-tenant SSO: enabled (SSO tenant $azureTenantId, host app $azureClientId)"
}
Write-Host "GitHub Repo: $githubRepo"
Write-Host ""

$confirm = Read-Host "Proceed with deployment? (yes/no)"
if ($confirm -ne "yes" -and $confirm -ne "y") {
    Write-Host "Deployment cancelled."
    exit 0
}

# Start deployment
Write-Host "`n=== Starting Deployment ===" -ForegroundColor Blue

# Step 1: Deploy Infrastructure
Write-Host "`nStep 1/6: Deploying Azure Infrastructure..." -ForegroundColor Yellow
$deploymentName = "cps230-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$deploymentResult = az deployment sub create `
    --location $location `
    --template-file infrastructure/main.bicep `
    --parameters `
        environmentName=$environment `
        location=$location `
        baseName=$baseName `
        resourceGroupName=$resourceGroup `
        postgresAdminPassword=$postgresPasswordPlain `
        initialAdminEmail=$adminEmail `
        githubRepositoryUrl=$githubRepo `
    --name $deploymentName `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Infrastructure deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Infrastructure deployed successfully" -ForegroundColor Green

# Extract outputs
$postgresHost = $deploymentResult.properties.outputs.postgresqlServerFqdn.value
$postgresDb = $deploymentResult.properties.outputs.postgresqlDatabaseName.value
$functionAppName = $deploymentResult.properties.outputs.functionAppName.value
$staticWebAppName = $deploymentResult.properties.outputs.staticWebAppName.value
$staticWebAppUrl = $deploymentResult.properties.outputs.staticWebAppUrl.value
$staticWebAppApiKey = $deploymentResult.properties.outputs.staticWebAppApiKey.value

# Step 2: Initialize Database
Write-Host "`nStep 2/6: Initializing Database Schema..." -ForegroundColor Yellow

Write-Host "Waiting for PostgreSQL to be ready..."
Start-Sleep -Seconds 30

# Add current IP to firewall
$currentIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
# The Bicep names the server psql-<base>-<env>-<uniqueSuffix>, not "<base>-<env>".
# Derive the real name from the FQDN (its first label) so the rule targets the
# server that actually exists.
$postgresServerName = $postgresHost.Split('.')[0]
Write-Host "Adding IP $currentIp to PostgreSQL firewall ($postgresServerName)..."
az postgres flexible-server firewall-rule create `
    --resource-group $resourceGroup `
    --name $postgresServerName `
    --rule-name "DeploymentScript" `
    --start-ip-address $currentIp `
    --end-ip-address $currentIp | Out-Null

# Run database schema
Write-Host "Running database schema initialization..."
$env:PGPASSWORD = $postgresPasswordPlain
psql "host=$postgresHost port=5432 dbname=$postgresDb user=cps230admin sslmode=require" -f database/schema.sql

# Run migrations
Get-ChildItem -Path "database/migrations/*.sql" | ForEach-Object {
    Write-Host "Running migration: $($_.Name)"
    psql "host=$postgresHost port=5432 dbname=$postgresDb user=cps230admin sslmode=require" -f $_.FullName
}

Write-Host "✓ Database initialized successfully" -ForegroundColor Green

# Step 3: Build and Deploy Backend
Write-Host "`nStep 3/6: Building and Deploying Backend Functions..." -ForegroundColor Yellow

Push-Location backend
npm ci
npm run build
# Strip dev dependencies before packaging. Left in, node_modules is ~1.5 GB
# (it includes the whole dev toolchain), which makes the zip huge and the
# config-zip upload slow or prone to timing out. Production deps only is ~10-15 MB.
npm prune --production
Pop-Location

# Create backend zip (exclude TypeScript sources and sourcemaps; only the
# built dist + production node_modules are needed at runtime)
if (Test-Path "backend.zip") { Remove-Item "backend.zip" }
$zipStaging = Join-Path ([System.IO.Path]::GetTempPath()) "cps230-backend-zip"
if (Test-Path $zipStaging) { Remove-Item $zipStaging -Recurse -Force }
New-Item -ItemType Directory -Path $zipStaging | Out-Null
Copy-Item "backend/host.json","backend/package.json" $zipStaging
Copy-Item "backend/dist" $zipStaging -Recurse
Copy-Item "backend/node_modules" $zipStaging -Recurse
Compress-Archive -Path "$zipStaging/*" -DestinationPath "backend.zip"
Remove-Item $zipStaging -Recurse -Force

# Deploy the backend by uploading the package to the Function App's storage
# account and pointing the app at it via WEBSITE_RUN_FROM_PACKAGE.
#
# We deliberately avoid `az functionapp deployment source config-zip` and
# `func azure functionapp publish`: both push to the Kudu/SCM endpoint, which
# frequently times out on slower uplinks ("write operation timed out"). Uploading
# to blob storage is chunked and retryable, and needs no Functions Core Tools.
Write-Host "Deploying backend via storage package (WEBSITE_RUN_FROM_PACKAGE)..." -ForegroundColor Yellow
$storageAccount = az storage account list --resource-group $resourceGroup --query "[0].name" -o tsv
$storageKey = az storage account keys list --account-name $storageAccount --resource-group $resourceGroup --query "[0].value" -o tsv
az storage container create --name deployments --account-name $storageAccount --account-key $storageKey --output none

Write-Host "Uploading backend package to blob storage..."
az storage blob upload --account-name $storageAccount --account-key $storageKey `
    --container-name deployments --name backend.zip --file backend.zip `
    --overwrite --max-connections 4 --output none

# Long-lived read SAS (run-from-package needs ongoing access to the blob).
$sasExpiry = (Get-Date).ToUniversalTime().AddYears(3).ToString("yyyy-MM-ddTHH:mmZ")
$sasToken = az storage blob generate-sas --account-name $storageAccount --account-key $storageKey `
    --container-name deployments --name backend.zip --permissions r --expiry $sasExpiry --https-only -o tsv
$packageUrl = "https://$storageAccount.blob.core.windows.net/deployments/backend.zip?$sasToken"

az functionapp config appsettings set --name $functionAppName --resource-group $resourceGroup `
    --settings WEBSITE_RUN_FROM_PACKAGE=$packageUrl --output none
Write-Host "Restarting Function App to mount the package..."
az functionapp restart --name $functionAppName --resource-group $resourceGroup --output none
Remove-Item "backend.zip" -ErrorAction SilentlyContinue

Write-Host "✓ Backend deployed successfully (live ~1-2 min after restart)" -ForegroundColor Green

# Step 4: Create Initial Admin User
Write-Host "`nStep 4/6: Creating Initial Admin User..." -ForegroundColor Yellow

$adminCreated = $false
$env:PGPASSWORD = $postgresPasswordPlain
$pgConn = "host=$postgresHost port=5432 dbname=$postgresDb user=cps230admin sslmode=require"

# Only seed an admin when the users table is empty (matches deploy.sh behavior).
$userCountRaw = (psql $pgConn -t -A -c "SELECT COUNT(*) FROM user_profiles;" 2>$null)
$userCount = 0
$countOk = ($LASTEXITCODE -eq 0) -and [int]::TryParse(($userCountRaw -replace '\D', ''), [ref]$userCount)

if (-not $countOk) {
    Write-Host "WARNING: Could not read existing users; skipping admin creation. Create one later with: .\Manage-Access.ps1 -Action NewAdmin" -ForegroundColor Yellow
} elseif ($userCount -gt 0) {
    Write-Host "Users already exist. Skipping initial admin creation." -ForegroundColor Yellow
} else {
    # Generate a bcrypt hash using the backend's bcryptjs (installed in Step 3).
    # The password is passed via an env var so it never lands in the command line,
    # and hashSync avoids async-callback quoting headaches. Uses the dedicated
    # admin password entered above, NOT the PostgreSQL password.
    $env:ADMIN_PW = $adminPasswordPlain
    Push-Location backend
    $passwordHash = (node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_PW, 12))")
    $hashExit = $LASTEXITCODE
    Pop-Location
    Remove-Item Env:\ADMIN_PW -ErrorAction SilentlyContinue

    if ($hashExit -ne 0 -or [string]::IsNullOrWhiteSpace($passwordHash)) {
        Write-Host "WARNING: Failed to generate password hash; skipping admin creation. Create one later with: .\Manage-Access.ps1 -Action NewAdmin" -ForegroundColor Yellow
    } else {
        # psql -v + :'var' produces properly-quoted SQL literals. This matters because
        # the bcrypt hash contains '$' characters that PowerShell and SQL would otherwise
        # try to interpret. Passing the raw value keeps it intact.
        #
        # Run via -f (a file), NOT -c: psql only interpolates :'var' when reading
        # from a file or stdin. With -c the ':' reaches the server verbatim and
        # fails with "syntax error at or near \":\"".
        $adminSqlFile = New-TemporaryFile
        Write-Utf8NoBom -Path $adminSqlFile.FullName -Lines @(
            "INSERT INTO user_profiles (email, full_name, role, password_hash, auth_type)"
            "VALUES (:'email', :'fullname', 'promaster', :'pwhash', 'local')"
            "ON CONFLICT (email) DO NOTHING;"
        )
        psql $pgConn `
            -v "email=$adminEmail" `
            -v "fullname=$adminFullName" `
            -v "pwhash=$($passwordHash.Trim())" `
            -f $adminSqlFile.FullName | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Initial admin user created (role: promaster)" -ForegroundColor Green
            $adminCreated = $true
        } else {
            Write-Host "WARNING: Failed to create initial admin user. Create one later with: .\Manage-Access.ps1 -Action NewAdmin" -ForegroundColor Yellow
        }
    }
}

# Step 5: Build and Deploy Frontend
Write-Host "`nStep 5/6: Building and Deploying Frontend..." -ForegroundColor Yellow

# Write build-time configuration. The VITE_* values are baked into the bundle by
# Vite, so they MUST be present before 'npm run build'. Without VITE_AZURE_CLIENT_ID
# the SPA sends an empty client_id to Azure AD and sign-in fails with AADSTS900144.
Write-Host "Creating production environment configuration..."
Write-Utf8NoBom -Path ".env.production" -Lines @(
    "VITE_API_URL=https://$functionAppName.azurewebsites.net/api"
    "VITE_AZURE_TENANT_ID=$azureTenantId"
    "VITE_AZURE_CLIENT_ID=$azureClientId"
    "VITE_REDIRECT_URI=$staticWebAppUrl"
)

npm ci
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend dependency install failed" -ForegroundColor Red; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend build failed" -ForegroundColor Red; exit 1 }

# Deploy to Static Web App. --env production is required; without it the SWA CLI
# deploys to a preview environment and the production URL keeps the old content.
$env:SWA_CLI_DEPLOYMENT_TOKEN = $staticWebAppApiKey
npx "@azure/static-web-apps-cli" deploy "dist" `
    --deployment-token $staticWebAppApiKey `
    --env production `
    --no-use-keychain
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Frontend deployed successfully" -ForegroundColor Green

# Step 6: Post-deployment Configuration
Write-Host "`nStep 6/6: Configuring Application Settings..." -ForegroundColor Yellow

az functionapp cors add `
    --resource-group $resourceGroup `
    --name $functionAppName `
    --allowed-origins $staticWebAppUrl | Out-Null

# Configure external-tenant SSO on the backend and App Registration (if provided).
# The App Registration lives in the HOST tenant (this az login context), NOT the
# SSO/users tenant.
if (![string]::IsNullOrWhiteSpace($azureClientId)) {
    Write-Host "Configuring external-tenant SSO..." -ForegroundColor Yellow

    # Backend validates tokens against these. appsettings set merges, so other
    # settings (connection string, etc.) are preserved.
    #   AZURE_TENANT_ID           = the SSO (users') tenant, used to validate tokens
    #   INITIAL_PROMASTER_EMAILS  = who becomes admin on first SSO login
    #   ENABLE_AAD_USER_MANAGEMENT= off; users are managed in their own tenant
    az functionapp config appsettings set `
        --name $functionAppName `
        --resource-group $resourceGroup `
        --settings AZURE_TENANT_ID=$azureTenantId AZURE_CLIENT_ID=$azureClientId INITIAL_PROMASTER_EMAILS=$initialPromasterEmails ENABLE_AAD_USER_MANAGEMENT=false `
        --output none
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Function App SSO settings configured" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Failed to set Function App SSO settings" -ForegroundColor Yellow
    }

    # Ensure the App Registration is multi-tenant so users from the SSO tenant can
    # sign in. Without this, Azure rejects them (AADSTS50020 / AADSTS700016).
    $currentAudience = az ad app show --id $azureClientId --query "signInAudience" -o tsv 2>$null
    if ($currentAudience -eq "AzureADMultipleOrgs" -or $currentAudience -eq "AzureADandPersonalMicrosoftAccount") {
        Write-Host "✓ App Registration is already multi-tenant ($currentAudience)" -ForegroundColor Green
    } else {
        $audienceTmp = New-TemporaryFile
        Write-Utf8NoBom -Path $audienceTmp.FullName -Lines @('{"signInAudience": "AzureADMultipleOrgs"}')
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications(appId='$azureClientId')" `
            --headers "Content-Type=application/json" `
            --body "@$($audienceTmp.FullName)" 2>$null
        $audienceExit = $LASTEXITCODE
        Remove-Item $audienceTmp -ErrorAction SilentlyContinue
        if ($audienceExit -eq 0) {
            Write-Host "✓ App Registration set to multi-tenant (AzureADMultipleOrgs)" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Could not set multi-tenant flag. In the Azure Portal set 'Supported account types' to 'Accounts in any organizational directory'." -ForegroundColor Yellow
        }
    }

    # Register the site as a SPA redirect URI, preserving any existing ones.
    $existingJson = az ad app show --id $azureClientId --query "spa.redirectUris" -o json 2>$null
    $existing = @()
    if (![string]::IsNullOrWhiteSpace($existingJson)) {
        try { $existing = @($existingJson | ConvertFrom-Json) } catch { $existing = @() }
    }
    if ($existing -contains $staticWebAppUrl) {
        Write-Host "✓ Redirect URI already configured" -ForegroundColor Green
    } else {
        $uris = @($existing + $staticWebAppUrl | Where-Object { $_ } | Select-Object -Unique)
        $body = @{ spa = @{ redirectUris = $uris } } | ConvertTo-Json -Depth 5 -Compress
        $tmp = New-TemporaryFile
        Write-Utf8NoBom -Path $tmp.FullName -Lines @($body)
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications(appId='$azureClientId')" `
            --headers "Content-Type=application/json" `
            --body "@$($tmp.FullName)" 2>$null
        $patchExit = $LASTEXITCODE
        Remove-Item $tmp -ErrorAction SilentlyContinue
        if ($patchExit -eq 0) {
            Write-Host "✓ App Registration redirect URI configured" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Could not update the App Registration. Add '$staticWebAppUrl' as a SPA redirect URI manually." -ForegroundColor Yellow
        }
    }
}

Write-Host "✓ Configuration completed" -ForegroundColor Green

# Deployment Complete
Write-Host @"

╔═══════════════════════════════════════════════════════════╗
║                DEPLOYMENT SUCCESSFUL! 🎉                  ║
╚═══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "=== Deployment Information ===" -ForegroundColor Blue
Write-Host "Resource Group:    " -NoNewline; Write-Host $resourceGroup -ForegroundColor Green
Write-Host "Application URL:   " -NoNewline; Write-Host $staticWebAppUrl -ForegroundColor Green
Write-Host "Database Host:     " -NoNewline; Write-Host $postgresHost -ForegroundColor Green
Write-Host "Function App:      " -NoNewline; Write-Host "$functionAppName.azurewebsites.net" -ForegroundColor Green
Write-Host ""

if ($adminCreated) {
    Write-Host "=== Initial Admin Login (local auth) ===" -ForegroundColor Blue
    Write-Host "Username: " -NoNewline; Write-Host $adminEmail -ForegroundColor Green
    Write-Host "Password: " -NoNewline; Write-Host "(the admin password you set during install)" -ForegroundColor Green
    Write-Host "Role:     " -NoNewline; Write-Host "promaster (full admin)" -ForegroundColor Green
    Write-Host "!  Change this password after first login." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "=== Admin Access ===" -ForegroundColor Blue
    Write-Host "No local admin was seeded. Assign admins via INITIAL_PROMASTER_EMAILS (SSO)," -ForegroundColor Yellow
    Write-Host "or run: .\Manage-Access.ps1 -Action NewAdmin to create a local admin." -ForegroundColor Yellow
    Write-Host ""
}

# External-tenant SSO requires a one-time admin consent in the USERS' tenant.
if (![string]::IsNullOrWhiteSpace($azureTenantId)) {
    $adminConsentUrl = "https://login.microsoftonline.com/$azureTenantId/adminconsent?client_id=$azureClientId&redirect_uri=$staticWebAppUrl"
    Write-Host "=== ACTION REQUIRED - In Your SSO (Users') Tenant ===" -ForegroundColor Magenta
    Write-Host "A Global Administrator of the SSO tenant ($azureTenantId) must open this" -ForegroundColor Yellow
    Write-Host "consent URL once. It creates the Enterprise App in that tenant so its users" -ForegroundColor Yellow
    Write-Host "can sign in. Until then, sign-in fails with 'need admin approval' (AADSTS65001)." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  $adminConsentUrl" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Next Steps ===" -ForegroundColor Yellow
Write-Host "1. Navigate to: $staticWebAppUrl"
if (![string]::IsNullOrWhiteSpace($azureTenantId)) {
    Write-Host "2. Have an SSO-tenant admin grant consent (URL above), then sign in with SSO"
} else {
    Write-Host "2. Log in with the local admin credentials above"
}
Write-Host "3. Configure Process Manager credentials in Settings"
Write-Host "4. Run initial sync to import processes"
Write-Host ""

Write-Host "Deployment completed at $(Get-Date)" -ForegroundColor Green
