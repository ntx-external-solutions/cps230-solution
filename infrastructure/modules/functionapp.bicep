// Azure Functions App module
@description('Location for the Function App')
param location string = resourceGroup().location

@description('Name of the Function App')
param functionAppName string

@description('Name of the App Service Plan')
param appServicePlanName string

@description('Name of the Storage Account for Function App')
param storageAccountName string

@description('Application Insights connection string')
param applicationInsightsConnectionString string

@description('Key Vault URI for secrets')
param keyVaultUri string

@description('PostgreSQL connection string (stored as Key Vault reference)')
@secure()
param postgresqlConnectionString string

@description('Managed identity principal ID')
param managedIdentityPrincipalId string

@description('Tags to apply to the resources')
param tags object = {}

@description('Function App runtime')
@allowed([
  'node'
  'dotnet'
  'python'
])
param runtime string = 'node'

@description('Runtime version')
param runtimeVersion string = '20'

@description('SKU name for App Service Plan')
@allowed([
  'Y1'  // Consumption
  'EP1' // Elastic Premium
  'EP2'
  'EP3'
])
param skuName string = 'Y1'

// Create Storage Account for Function App
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// Create App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName == 'Y1' ? 'Dynamic' : 'ElasticPremium'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// Create Function App with system-assigned managed identity
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    reserved: true
    siteConfig: {
      linuxFxVersion: '${runtime}|${runtimeVersion}'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: runtime
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsightsConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~${runtimeVersion}'
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVaultUri
        }
        {
          name: 'POSTGRESQL_CONNECTION_STRING'
          value: postgresqlConnectionString
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
        supportCredentials: false
      }
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppPrincipalId string = functionApp.identity.principalId
output storageAccountId string = storageAccount.id
output appServicePlanId string = appServicePlan.id
