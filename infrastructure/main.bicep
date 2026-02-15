// Main deployment template for CPS230 Solution
targetScope = 'subscription'

@description('Name of the resource group')
param resourceGroupName string = 'rg-cps230-${environmentName}'

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environmentName string = 'prod'

@description('Primary location for all resources')
param location string = 'australiaeast'

@description('Base name for resources (will be combined with environment)')
@minLength(3)
@maxLength(10)
param baseName string = 'cps230'

@description('Administrator username for PostgreSQL')
param postgresAdminUsername string = 'cps230admin'

@description('Administrator password for PostgreSQL')
@secure()
@minLength(8)
param postgresAdminPassword string

@description('Initial admin user email for the application')
param initialAdminEmail string

@description('GitHub repository URL for Static Web App (optional)')
param githubRepositoryUrl string = ''

@description('GitHub repository branch')
param githubRepositoryBranch string = 'main'

@description('Tags to apply to all resources')
param tags object = {
  Application: 'CPS230-Solution'
  Environment: environmentName
  ManagedBy: 'Bicep'
}

// Generate unique names for resources
var uniqueSuffix = uniqueString(subscription().id, resourceGroupName, location)
var keyVaultName = 'kv-${baseName}-${uniqueSuffix}'
var postgresServerName = 'psql-${baseName}-${environmentName}-${uniqueSuffix}'
var functionAppName = 'func-${baseName}-${environmentName}-${uniqueSuffix}'
var storageAccountName = 'st${baseName}${environmentName}${take(uniqueSuffix, 8)}'
var appServicePlanName = 'asp-${baseName}-${environmentName}'
var staticWebAppName = 'stapp-${baseName}-${environmentName}-${uniqueSuffix}'
var appInsightsName = 'appi-${baseName}-${environmentName}'
var logAnalyticsName = 'log-${baseName}-${environmentName}'

// Create resource group
resource resourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// Deploy monitoring infrastructure
module monitoring 'modules/monitoring.bicep' = {
  scope: resourceGroup
  name: 'monitoring-deployment'
  params: {
    location: location
    applicationInsightsName: appInsightsName
    logAnalyticsWorkspaceName: logAnalyticsName
    tags: tags
    retentionInDays: environmentName == 'prod' ? 90 : 30
  }
}

// Deploy PostgreSQL database
module postgresql 'modules/postgresql.bicep' = {
  scope: resourceGroup
  name: 'postgresql-deployment'
  params: {
    location: location
    serverName: postgresServerName
    administratorLogin: postgresAdminUsername
    administratorPassword: postgresAdminPassword
    postgresqlVersion: '16'
    skuName: environmentName == 'prod' ? 'Standard_D2s_v3' : 'Standard_B2s'
    skuTier: environmentName == 'prod' ? 'GeneralPurpose' : 'Burstable'
    storageSizeGB: environmentName == 'prod' ? 128 : 32
    backupRetentionDays: environmentName == 'prod' ? 14 : 7
    geoRedundantBackup: environmentName == 'prod' ? 'Enabled' : 'Disabled'
    highAvailability: environmentName == 'prod' ? true : false
    tags: tags
    databaseName: 'cps230'
  }
}

// Deploy Azure Functions (without Key Vault initially)
module functionApp 'modules/functionapp.bicep' = {
  scope: resourceGroup
  name: 'functionapp-deployment'
  params: {
    location: location
    functionAppName: functionAppName
    appServicePlanName: appServicePlanName
    storageAccountName: storageAccountName
    applicationInsightsConnectionString: monitoring.outputs.connectionString
    keyVaultUri: '' // Will be configured after Key Vault is created
    postgresqlConnectionString: 'Host=${postgresql.outputs.serverFqdn};Database=${postgresql.outputs.databaseName};Username=${postgresAdminUsername};Password=${postgresAdminPassword};SSL Mode=Require'
    managedIdentityPrincipalId: ''
    tags: tags
    runtime: 'node'
    runtimeVersion: '20'
    skuName: environmentName == 'prod' ? 'EP1' : 'Y1'
  }
  dependsOn: [
    postgresql
    monitoring
  ]
}

// Deploy Key Vault after Function App is created
module keyVault 'modules/keyvault.bicep' = {
  scope: resourceGroup
  name: 'keyvault-deployment'
  params: {
    location: location
    keyVaultName: keyVaultName
    principalId: functionApp.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
    tags: tags
    skuName: 'standard'
    enableSoftDelete: true
    enablePurgeProtection: environmentName == 'prod' ? true : false
  }
  dependsOn: [
    functionApp
  ]
}

// Deploy Static Web App (must use supported region)
module staticWebApp 'modules/staticwebapp.bicep' = {
  scope: resourceGroup
  name: 'staticwebapp-deployment'
  params: {
    location: 'eastasia' // Static Web Apps not available in australiaeast, using eastasia (closest to Australia)
    staticWebAppName: staticWebAppName
    skuName: environmentName == 'prod' ? 'Standard' : 'Free'
    tags: tags
    repositoryUrl: githubRepositoryUrl
    repositoryBranch: githubRepositoryBranch
    apiFunctionAppHostname: functionApp.outputs.functionAppHostName
  }
}

// Outputs for reference and post-deployment configuration
output resourceGroupName string = resourceGroup.name
output postgresqlServerFqdn string = postgresql.outputs.serverFqdn
output postgresqlDatabaseName string = postgresql.outputs.databaseName
output functionAppUrl string = functionApp.outputs.functionAppUrl
output functionAppName string = functionApp.outputs.functionAppName
output staticWebAppUrl string = staticWebApp.outputs.staticWebAppUrl
output staticWebAppName string = staticWebApp.outputs.staticWebAppName
output staticWebAppApiKey string = staticWebApp.outputs.staticWebAppApiKey
output keyVaultName string = keyVault.outputs.keyVaultName
output keyVaultUri string = keyVault.outputs.keyVaultUri
output applicationInsightsName string = monitoring.outputs.applicationInsightsName
output applicationInsightsConnectionString string = monitoring.outputs.connectionString
