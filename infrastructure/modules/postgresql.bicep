// PostgreSQL Flexible Server module
@description('Location for the PostgreSQL server')
param location string = resourceGroup().location

@description('Name of the PostgreSQL server')
param serverName string

@description('Administrator username for the server')
@secure()
param administratorLogin string

@description('Administrator password for the server')
@secure()
param administratorPassword string

@description('PostgreSQL version')
@allowed([
  '16'
  '15'
  '14'
  '13'
  '12'
])
param postgresqlVersion string = '16'

@description('SKU name for the PostgreSQL server')
param skuName string = 'Standard_B2s'

@description('SKU tier')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param skuTier string = 'Burstable'

@description('Storage size in GB')
param storageSizeGB int = 32

@description('Backup retention days')
param backupRetentionDays int = 7

@description('Enable geo-redundant backup')
param geoRedundantBackup string = 'Disabled'

@description('Tags to apply to the resource')
param tags object = {}

@description('Database name to create')
param databaseName string = 'cps230'

@description('Enable high availability')
param highAvailability bool = false

resource postgresqlServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresqlVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: geoRedundantBackup
    }
    highAvailability: highAvailability ? {
      mode: 'ZoneRedundant'
    } : {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Configure firewall rule to allow Azure services
resource firewallRuleAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: postgresqlServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Create the main database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: postgresqlServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Enable required extensions
resource extensionUuid 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-03-01-preview' = {
  parent: postgresqlServer
  name: 'azure.extensions'
  properties: {
    value: 'uuid-ossp'
    source: 'user-override'
  }
}

output serverId string = postgresqlServer.id
output serverName string = postgresqlServer.name
output serverFqdn string = postgresqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
