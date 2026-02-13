// Application Insights and Log Analytics module
@description('Location for the monitoring resources')
param location string = resourceGroup().location

@description('Name of the Application Insights resource')
param applicationInsightsName string

@description('Name of the Log Analytics workspace')
param logAnalyticsWorkspaceName string

@description('Tags to apply to the resources')
param tags object = {}

@description('Retention in days for Log Analytics')
param retentionInDays int = 30

// Create Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Create Application Insights
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output applicationInsightsId string = applicationInsights.id
output applicationInsightsName string = applicationInsights.name
output instrumentationKey string = applicationInsights.properties.InstrumentationKey
output connectionString string = applicationInsights.properties.ConnectionString
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
