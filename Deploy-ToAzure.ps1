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

$adminEmail = Read-Host "Initial admin email address"
if ([string]::IsNullOrWhiteSpace($adminEmail)) {
    Write-Host "ERROR: Admin email is required" -ForegroundColor Red
    exit 1
}

# Azure AD SSO (optional). Leave blank to deploy with local authentication only.
# These values are baked into the frontend at build time and set on the Function
# App, so they must be collected before the frontend is built.
$azureTenantId = Read-Host "Azure AD Tenant ID (optional, blank = local auth only)"
$azureClientId = ""
if (![string]::IsNullOrWhiteSpace($azureTenantId)) {
    $azureClientId = Read-Host "Azure AD Client ID (App Registration)"
    if ([string]::IsNullOrWhiteSpace($azureClientId)) {
        Write-Host "ERROR: Client ID is required when a Tenant ID is provided" -ForegroundColor Red
        exit 1
    }
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
    Write-Host "Azure AD SSO: not configured (local auth only)"
} else {
    Write-Host "Azure AD SSO: enabled (tenant $azureTenantId)"
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
Write-Host "Adding IP $currentIp to PostgreSQL firewall..."
az postgres flexible-server firewall-rule create `
    --resource-group $resourceGroup `
    --name "$baseName-$environment" `
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
Pop-Location

# Create backend zip
if (Test-Path "backend.zip") { Remove-Item "backend.zip" }
Compress-Archive -Path "backend/*" -DestinationPath "backend.zip"

az functionapp deployment source config-zip `
    --resource-group $resourceGroup `
    --name $functionAppName `
    --src backend.zip | Out-Null

Write-Host "✓ Backend deployed successfully" -ForegroundColor Green

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
    $adminFullName = "System Administrator"

    # Generate a bcrypt hash using the backend's bcryptjs (installed in Step 3).
    # The password is passed via an env var so it never lands in the command line,
    # and hashSync avoids async-callback quoting headaches.
    $env:ADMIN_PW = $postgresPasswordPlain
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
        psql $pgConn `
            -v "email=$adminEmail" `
            -v "fullname=$adminFullName" `
            -v "pwhash=$($passwordHash.Trim())" `
            -c "INSERT INTO user_profiles (email, full_name, role, password_hash, auth_type) VALUES (:'email', :'fullname', 'promaster', :'pwhash', 'local') ON CONFLICT (email) DO NOTHING;" | Out-Null

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

# Configure Azure AD SSO on the backend and App Registration (if provided).
if (![string]::IsNullOrWhiteSpace($azureClientId)) {
    Write-Host "Configuring Azure AD SSO..." -ForegroundColor Yellow

    # Backend validates tokens against these. appsettings set merges, so other
    # settings (connection string, etc.) are preserved.
    az functionapp config appsettings set `
        --name $functionAppName `
        --resource-group $resourceGroup `
        --settings AZURE_TENANT_ID=$azureTenantId AZURE_CLIENT_ID=$azureClientId `
        --output none
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Function App SSO settings configured" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Failed to set Function App SSO settings" -ForegroundColor Yellow
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
    Write-Host "Email:    " -NoNewline; Write-Host $adminEmail -ForegroundColor Green
    Write-Host "Password: " -NoNewline; Write-Host "(the PostgreSQL admin password you entered)" -ForegroundColor Green
    Write-Host "Role:     " -NoNewline; Write-Host "promaster (full admin)" -ForegroundColor Green
    Write-Host "!  Change this password after first login." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "=== Admin Access ===" -ForegroundColor Blue
    Write-Host "No local admin was seeded. Either the first Azure AD sign-in becomes admin," -ForegroundColor Yellow
    Write-Host "or run: .\Manage-Access.ps1 -Action NewAdmin to create a local admin." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "=== Next Steps ===" -ForegroundColor Yellow
Write-Host "1. Navigate to: $staticWebAppUrl"
Write-Host "2. Log in with Azure AD credentials"
Write-Host "3. Configure Process Manager credentials in Settings"
Write-Host "4. Run initial sync to import processes"
Write-Host ""

Write-Host "Deployment completed at $(Get-Date)" -ForegroundColor Green
