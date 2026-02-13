// Key Vault module for storing application secrets
@description('Location for the Key Vault resource')
param location string = resourceGroup().location

@description('Name of the Key Vault')
param keyVaultName string

@description('Object ID of the user or service principal to grant access')
param principalId string

@description('Type of principal (ServicePrincipal, User, or Group)')
@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
param principalType string = 'ServicePrincipal'

@description('Tags to apply to the resource')
param tags object = {}

@description('SKU name for the Key Vault')
@allowed([
  'standard'
  'premium'
])
param skuName string = 'standard'

@description('Enable soft delete for the Key Vault')
param enableSoftDelete bool = true

@description('Number of days to retain soft-deleted vaults and secrets')
param softDeleteRetentionInDays int = 90

@description('Enable purge protection')
param enablePurgeProtection bool = true

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: skuName
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: enableSoftDelete
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enablePurgeProtection: enablePurgeProtection ? true : null
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Grant Key Vault Secrets Officer role to the principal
resource keyVaultSecretsOfficerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, principalId, 'Key Vault Secrets Officer')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7') // Key Vault Secrets Officer
    principalId: principalId
    principalType: principalType
  }
}

// Output the Key Vault resource ID and name
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
