<#
.SYNOPSIS
    CPS230 Solution - Post-deployment access management (PowerShell)

.DESCRIPTION
    Standalone helper for two common post-deployment tasks:

      * NewAdmin      Create (or reset) a local username/password admin user
                      directly in the PostgreSQL database.

      * ConfigureSso  Wire up Azure AD single sign-on for an already-deployed
                      environment: set the Function App settings, register the
                      site's redirect URI on the App Registration, and rebuild
                      + redeploy the frontend so the VITE_* values are baked in.

    This does not require re-running the full deployment.

.PARAMETER Action
    NewAdmin or ConfigureSso.

.EXAMPLE
    # Create/reset a local admin
    .\Manage-Access.ps1 -Action NewAdmin -ResourceGroup rg-cps230-prod -Email admin@contoso.com

.EXAMPLE
    # Configure Azure AD SSO and redeploy the frontend
    .\Manage-Access.ps1 -Action ConfigureSso -ResourceGroup rg-cps230-prod `
        -TenantId <tenant-guid> -ClientId <app-client-id>

.EXAMPLE
    # Configure SSO settings only, without rebuilding the frontend
    .\Manage-Access.ps1 -Action ConfigureSso -ResourceGroup rg-cps230-prod `
        -TenantId <tenant-guid> -ClientId <app-client-id> -SkipFrontendRedeploy
#>

#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateSet('NewAdmin', 'ConfigureSso')]
    [string]$Action,

    [string]$ResourceGroup,

    # --- NewAdmin parameters ---
    [string]$Email,
    [securestring]$Password,
    [securestring]$PostgresPassword,
    [string]$FullName = 'System Administrator',
    [ValidateSet('user', 'business_analyst', 'promaster')]
    [string]$Role = 'promaster',
    [string]$DatabaseName = 'cps230',
    [string]$PostgresUser = 'cps230admin',
    [string]$PostgresHost,

    # --- ConfigureSso parameters ---
    [string]$TenantId,
    [string]$ClientId,
    [string]$FunctionAppName,
    [string]$StaticWebAppName,
    [switch]$SkipFrontendRedeploy
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step { param([string]$Message) Write-Host "`n=== $Message ===" -ForegroundColor Blue }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function ConvertTo-Plain {
    # Works on both Windows PowerShell 5.1 and PowerShell 7
    # (ConvertFrom-SecureString -AsPlainText is 7-only).
    param([securestring]$Secure)
    if ($null -eq $Secure) { return $null }
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Write-Utf8NoBom {
    # Set-Content -Encoding utf8 writes a BOM on 5.1, which corrupts .env files
    # and JSON request bodies. Write UTF-8 without a BOM on every version.
    param([string]$Path, [string[]]$Lines)
    $content = ($Lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-Prerequisites {
    if (!(Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Err "Azure CLI is not installed. Install from https://aka.ms/azure-cli"
        exit 1
    }
    # native command; az account show returns non-zero when not logged in
    az account show 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Not logged in to Azure. Run 'az login' first."
        exit 1
    }
}

# The repo root is wherever this script lives.
$RepoRoot = $PSScriptRoot

function Show-Usage {
    Write-Host ""
    Write-Host "Manage-Access.ps1 - CPS230 post-deployment access management" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  Create or reset a local admin user:"
    Write-Host "    .\Manage-Access.ps1 -Action NewAdmin -ResourceGroup <rg> -Email <email>"
    Write-Host ""
    Write-Host "  Configure Azure AD SSO and redeploy the frontend:"
    Write-Host "    .\Manage-Access.ps1 -Action ConfigureSso -ResourceGroup <rg> -TenantId <guid> -ClientId <guid>"
    Write-Host ""
    Write-Host "PARAMETERS:" -ForegroundColor Yellow
    Write-Host "  -Action          NewAdmin | ConfigureSso   (required)"
    Write-Host "  -ResourceGroup   Azure resource group name (required)"
    Write-Host "  NewAdmin:        -Email, [-Password], [-PostgresPassword], [-Role], [-FullName]"
    Write-Host "  ConfigureSso:    -TenantId, -ClientId, [-SkipFrontendRedeploy]"
    Write-Host ""
    Write-Host "Any required value not passed on the command line will be prompted for." -ForegroundColor DarkGray
    Write-Host "Run 'Get-Help .\Manage-Access.ps1 -Full' for details." -ForegroundColor DarkGray
    Write-Host ""
}

# ---------------------------------------------------------------------------
# Action: NewAdmin
# ---------------------------------------------------------------------------
function Invoke-NewAdmin {
    Write-Step "Create / Reset Local Admin User"

    if (!(Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js is not installed (required to hash the password). Install version 20.x from https://nodejs.org"
        exit 1
    }
    if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
        Write-Err "psql (PostgreSQL client) is not installed. Install it and re-run."
        exit 1
    }

    # Resolve the PostgreSQL host if not supplied.
    if ([string]::IsNullOrWhiteSpace($PostgresHost)) {
        Write-Info "Discovering PostgreSQL server in resource group '$ResourceGroup'..."
        $script:PostgresHost = az postgres flexible-server list `
            --resource-group $ResourceGroup `
            --query "[0].fullyQualifiedDomainName" -o tsv 2>$null
        if ([string]::IsNullOrWhiteSpace($PostgresHost)) {
            Write-Err "Could not find a PostgreSQL flexible server in '$ResourceGroup'. Pass -PostgresHost explicitly."
            exit 1
        }
    }
    Write-Info "PostgreSQL host: $PostgresHost"

    # Collect inputs (prompt for anything not passed).
    if ([string]::IsNullOrWhiteSpace($Email)) {
        $script:Email = Read-Host "Admin email address"
    }
    if ([string]::IsNullOrWhiteSpace($Email)) { Write-Err "Email is required."; exit 1 }

    if ($null -eq $PostgresPassword) {
        $script:PostgresPassword = Read-Host "PostgreSQL admin password (to connect to the DB)" -AsSecureString
    }
    if ($null -eq $Password) {
        $script:Password = Read-Host "New password for '$Email'" -AsSecureString
    }

    $pgPwPlain = ConvertTo-Plain $PostgresPassword
    $adminPwPlain = ConvertTo-Plain $Password

    if ([string]::IsNullOrEmpty($pgPwPlain))    { Write-Err "PostgreSQL password is required."; exit 1 }
    if ([string]::IsNullOrEmpty($adminPwPlain)) { Write-Err "Admin password is required."; exit 1 }
    if ($adminPwPlain.Length -lt 8) {
        Write-Err "Admin password must be at least 8 characters."
        exit 1
    }

    $env:PGPASSWORD = $pgPwPlain
    $pgConn = "host=$PostgresHost port=5432 dbname=$DatabaseName user=$PostgresUser sslmode=require"

    # Verify connectivity early so failures are obvious.
    psql $pgConn -t -A -c "SELECT 1;" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Could not connect to the database. Check the password, firewall rules, and that your IP is allowed."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }

    # Ensure the backend's bcryptjs is available for hashing.
    $backendDir = Join-Path $RepoRoot 'backend'
    if (!(Test-Path (Join-Path $backendDir 'node_modules/bcryptjs'))) {
        Write-Info "Installing backend dependencies (needed for password hashing)..."
        Push-Location $backendDir
        npm ci
        Pop-Location
    }

    # Hash the password. Passed via env var so it never appears on the command
    # line, and hashSync keeps things simple.
    Write-Info "Hashing password..."
    $env:ADMIN_PW = $adminPwPlain
    Push-Location $backendDir
    $passwordHash = (node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_PW, 12))")
    $hashExit = $LASTEXITCODE
    Pop-Location
    Remove-Item Env:\ADMIN_PW -ErrorAction SilentlyContinue

    if ($hashExit -ne 0 -or [string]::IsNullOrWhiteSpace($passwordHash)) {
        Write-Err "Failed to generate password hash."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }

    # Upsert. ON CONFLICT lets this both create a first admin and reset an
    # existing user's password/role. psql -v + :'var' quotes each value safely,
    # which matters because the bcrypt hash contains '$' characters.
    Write-Info "Writing user '$Email' (role: $Role)..."
    psql $pgConn `
        -v "email=$Email" `
        -v "fullname=$FullName" `
        -v "pwhash=$($passwordHash.Trim())" `
        -v "role=$Role" `
        -c "INSERT INTO user_profiles (email, full_name, role, password_hash, auth_type)
            VALUES (:'email', :'fullname', :'role', :'pwhash', 'local')
            ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                role          = EXCLUDED.role,
                auth_type     = 'local';" | Out-Null
    $insertExit = $LASTEXITCODE

    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

    if ($insertExit -ne 0) {
        Write-Err "Failed to write the admin user."
        exit 1
    }

    Write-Host ""
    Write-Info "Done."
    Write-Host "  Email: $Email"
    Write-Host "  Role:  $Role"
    Write-Host "  Auth:  local (username/password)"
    Write-Warn "Have the user change this password after first login."
}

# ---------------------------------------------------------------------------
# Action: ConfigureSso
# ---------------------------------------------------------------------------
function Invoke-ConfigureSso {
    Write-Step "Configure Azure AD SSO"

    if ([string]::IsNullOrWhiteSpace($TenantId)) { $script:TenantId = Read-Host "Azure AD Tenant ID" }
    if ([string]::IsNullOrWhiteSpace($ClientId)) { $script:ClientId = Read-Host "Azure AD Client ID (App Registration)" }
    if ([string]::IsNullOrWhiteSpace($TenantId) -or [string]::IsNullOrWhiteSpace($ClientId)) {
        Write-Err "Both -TenantId and -ClientId are required."
        exit 1
    }

    # Discover the Function App and Static Web App if not provided.
    if ([string]::IsNullOrWhiteSpace($FunctionAppName)) {
        Write-Info "Discovering Function App in '$ResourceGroup'..."
        $script:FunctionAppName = az functionapp list --resource-group $ResourceGroup --query "[0].name" -o tsv 2>$null
    }
    if ([string]::IsNullOrWhiteSpace($FunctionAppName)) {
        Write-Err "Could not find a Function App in '$ResourceGroup'. Pass -FunctionAppName explicitly."
        exit 1
    }

    if ([string]::IsNullOrWhiteSpace($StaticWebAppName)) {
        Write-Info "Discovering Static Web App in '$ResourceGroup'..."
        $script:StaticWebAppName = az staticwebapp list --resource-group $ResourceGroup --query "[0].name" -o tsv 2>$null
    }
    if ([string]::IsNullOrWhiteSpace($StaticWebAppName)) {
        Write-Err "Could not find a Static Web App in '$ResourceGroup'. Pass -StaticWebAppName explicitly."
        exit 1
    }

    $swaHostname = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv 2>$null
    if ([string]::IsNullOrWhiteSpace($swaHostname)) {
        Write-Err "Could not read the Static Web App hostname."
        exit 1
    }
    $swaUrl = "https://$swaHostname"

    Write-Info "Function App:   $FunctionAppName"
    Write-Info "Static Web App: $StaticWebAppName ($swaUrl)"

    # 1) Backend settings. appsettings set merges — existing keys (JWT_SECRET,
    #    connection string, etc.) are preserved.
    Write-Info "Setting Function App SSO settings..."
    az functionapp config appsettings set `
        --name $FunctionAppName `
        --resource-group $ResourceGroup `
        --settings AZURE_TENANT_ID=$TenantId AZURE_CLIENT_ID=$ClientId `
        --output none
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to update Function App settings."
        exit 1
    }
    Write-Info "Function App settings updated."

    # 2) Register the SPA redirect URI on the App Registration, preserving any
    #    that are already there.
    Write-Info "Registering SPA redirect URI on the App Registration..."
    $existingJson = az ad app show --id $ClientId --query "spa.redirectUris" -o json 2>$null
    $existing = @()
    if (-not [string]::IsNullOrWhiteSpace($existingJson)) {
        try { $existing = @($existingJson | ConvertFrom-Json) } catch { $existing = @() }
    }

    if ($existing -contains $swaUrl) {
        Write-Info "Redirect URI already configured."
    } else {
        $uris = @($existing + $swaUrl | Where-Object { $_ } | Select-Object -Unique)
        $body = @{ spa = @{ redirectUris = $uris } } | ConvertTo-Json -Depth 5 -Compress

        # az rest reads the body from a file with '@' to avoid shell-quoting issues.
        $tmp = New-TemporaryFile
        Write-Utf8NoBom -Path $tmp.FullName -Lines @($body)
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications(appId='$ClientId')" `
            --headers "Content-Type=application/json" `
            --body "@$($tmp.FullName)" 2>$null
        $patchExit = $LASTEXITCODE
        Remove-Item $tmp -ErrorAction SilentlyContinue

        if ($patchExit -eq 0) {
            Write-Info "App Registration updated (SPA platform)."
        } else {
            Write-Warn "Could not update the App Registration automatically."
            Write-Warn "Manually add '$swaUrl' as a SPA redirect URI in the Azure Portal."
        }
    }

    # 3) Rebuild + redeploy the frontend so the VITE_* values are baked in.
    if ($SkipFrontendRedeploy) {
        Write-Warn "Skipping frontend rebuild (-SkipFrontendRedeploy)."
        Write-Warn "SSO won't work in the browser until the frontend is rebuilt with the new VITE_AZURE_* values."
    } else {
        Write-Info "Rebuilding frontend with SSO configuration..."
        $envFile = Join-Path $RepoRoot '.env.production'
        Write-Utf8NoBom -Path $envFile -Lines @(
            "VITE_API_URL=https://$FunctionAppName.azurewebsites.net/api"
            "VITE_AZURE_TENANT_ID=$TenantId"
            "VITE_AZURE_CLIENT_ID=$ClientId"
            "VITE_REDIRECT_URI=$swaUrl"
        )

        Push-Location $RepoRoot
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
        } catch {
            Pop-Location
            Write-Err $_.Exception.Message
            exit 1
        }
        Pop-Location

        Write-Info "Retrieving Static Web App deployment token..."
        $token = az staticwebapp secrets list `
            --name $StaticWebAppName `
            --resource-group $ResourceGroup `
            --query "properties.apiKey" -o tsv 2>$null
        if ([string]::IsNullOrWhiteSpace($token)) {
            Write-Err "Could not retrieve the deployment token. Deploy the frontend manually."
            exit 1
        }

        Write-Info "Deploying frontend to the production environment..."
        # --env production is required; without it the CLI deploys to a preview
        # environment and the production URL keeps serving the old build.
        npx "@azure/static-web-apps-cli" deploy (Join-Path $RepoRoot 'dist') `
            --deployment-token $token `
            --env production
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Frontend deployment failed."
            exit 1
        }
        Write-Info "Frontend redeployed."
    }

    Write-Host ""
    Write-Info "SSO configuration complete."
    Write-Host "  Sign-in URL: $swaUrl"
    Write-Warn "The first Azure AD user to sign in becomes a Promaster (admin)."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Action)) {
    Show-Usage
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ResourceGroup)) {
    Write-Err "-ResourceGroup is required."
    Show-Usage
    exit 1
}

Assert-Prerequisites

switch ($Action) {
    'NewAdmin'     { Invoke-NewAdmin }
    'ConfigureSso' { Invoke-ConfigureSso }
}
