// Azure Static Web App module
@description('Location for the Static Web App')
param location string = resourceGroup().location

@description('Name of the Static Web App')
param staticWebAppName string

@description('SKU name for Static Web App')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

@description('Tags to apply to the resource')
param tags object = {}

@description('Repository URL (optional, for GitHub integration)')
param repositoryUrl string = ''

@description('Repository branch (optional, for GitHub integration)')
param repositoryBranch string = 'main'

@description('Backend Function App hostname to configure as API')
param apiFunctionAppHostname string = ''

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName
  }
  properties: !empty(repositoryUrl) ? {
    repositoryUrl: repositoryUrl
    branch: repositoryBranch
    buildProperties: {
      appLocation: '/'
      apiLocation: ''
      outputLocation: 'dist'
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'GitHub'
  } : {
    buildProperties: {
      appLocation: '/'
      apiLocation: ''
      outputLocation: 'dist'
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'None'
  }
}

// Configure backend API if Function App hostname is provided
resource staticWebAppConfig 'Microsoft.Web/staticSites/config@2023-01-01' = if (!empty(apiFunctionAppHostname)) {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    API_URL: 'https://${apiFunctionAppHostname}/api'
  }
}

output staticWebAppId string = staticWebApp.id
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppApiKey string = staticWebApp.listSecrets().properties.apiKey
