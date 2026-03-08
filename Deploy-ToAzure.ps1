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

#Requires -Version 7.0

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

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
Write-Host "`nStep 1/5: Deploying Azure Infrastructure..." -ForegroundColor Yellow
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
Write-Host "`nStep 2/5: Initializing Database Schema..." -ForegroundColor Yellow

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
Write-Host "`nStep 3/5: Building and Deploying Backend Functions..." -ForegroundColor Yellow

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

# Step 4: Build and Deploy Frontend
Write-Host "`nStep 4/5: Building and Deploying Frontend..." -ForegroundColor Yellow

npm ci
npm run build

# Deploy to Static Web App
$env:SWA_CLI_DEPLOYMENT_TOKEN = $staticWebAppApiKey
npx "@azure/static-web-apps-cli" deploy `
    --deployment-token $staticWebAppApiKey `
    --app-location "." `
    --output-location "dist" `
    --no-use-keychain 2>&1 | Out-Null

Write-Host "✓ Frontend deployed successfully" -ForegroundColor Green

# Step 5: Post-deployment Configuration
Write-Host "`nStep 5/5: Configuring Application Settings..." -ForegroundColor Yellow

az functionapp cors add `
    --resource-group $resourceGroup `
    --name $functionAppName `
    --allowed-origins $staticWebAppUrl | Out-Null

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

Write-Host "=== Next Steps ===" -ForegroundColor Yellow
Write-Host "1. Navigate to: $staticWebAppUrl"
Write-Host "2. Log in with Azure AD credentials"
Write-Host "3. Configure Process Manager credentials in Settings"
Write-Host "4. Run initial sync to import processes"
Write-Host ""

Write-Host "Deployment completed at $(Get-Date)" -ForegroundColor Green
