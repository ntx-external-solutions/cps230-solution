# Cost Optimization Guide

## Overview

The CPS230 solution supports two deployment modes:

1. **Cost-Optimized Mode** (~$35-55/month) - Recommended for small/medium deployments
2. **Enterprise Mode** (~$480-590/month) - For high-availability, production workloads

## Cost Breakdown

### Cost-Optimized Configuration (`costOptimized: true`)

| Resource | SKU | Monthly Cost |
|----------|-----|--------------|
| PostgreSQL Flexible Server | Burstable_B1ms (1 vCore) | ~$15 |
| Azure Functions | Y1 Consumption Plan | ~$0-10 (pay per execution) |
| Static Web App | Free Tier | $0 |
| Storage Account | Standard_LRS | ~$5 |
| Log Analytics | Pay-as-you-go | ~$10-15 |
| Application Insights | Pay-as-you-go | ~$5 |
| Key Vault | Pay-per-operation | ~$1 |
| **Total** | | **~$35-55/month** |

### Enterprise Configuration (`costOptimized: false`)

| Resource | SKU | Monthly Cost |
|----------|-----|--------------|
| PostgreSQL Flexible Server | Standard_D2s_v3 (2 vCore) + HA | ~$300-400 |
| Azure Functions | EP1 Elastic Premium | ~$150 |
| Static Web App | Standard Tier | ~$9 |
| Storage Account | Standard_LRS | ~$5 |
| Log Analytics | Pay-as-you-go (90 day retention) | ~$10-15 |
| Application Insights | Pay-as-you-go | ~$5 |
| Key Vault | Pay-per-operation | ~$1 |
| **Total** | | **~$480-590/month** |

## Deployment with Cost Optimization

### Option 1: Interactive Deployment Script

```bash
./deploy.sh
```

When prompted, enter `yes` for cost-optimized configuration:
```
Enable cost-optimized configuration? (Reduces costs ~90%, yes/no) [yes]: yes
```

### Option 2: Direct Bicep Deployment

```bash
az deployment sub create \
  --name cps230-deployment \
  --location australiaeast \
  --template-file infrastructure/main.bicep \
  --parameters \
    environmentName=prod \
    baseName=cps230 \
    location=australiaeast \
    postgresAdminPassword="YourSecurePassword" \
    initialAdminEmail="admin@example.com" \
    costOptimized=true
```

## Switching Between Modes

### From Enterprise to Cost-Optimized

1. **Delete existing deployment** (backup your data first!):
```bash
az group delete --name rg-cps230-prod --yes
```

2. **Redeploy with cost-optimized settings**:
```bash
./deploy.sh
# Answer "yes" to cost optimization
```

### From Cost-Optimized to Enterprise

1. Update the deployment with `costOptimized=false`:
```bash
az deployment sub create \
  --name cps230-upgrade \
  --location australiaeast \
  --template-file infrastructure/main.bicep \
  --parameters \
    environmentName=prod \
    baseName=cps230 \
    costOptimized=false \
    postgresAdminPassword="YourPassword" \
    initialAdminEmail="admin@example.com"
```

## Feature Comparison

| Feature | Cost-Optimized | Enterprise |
|---------|----------------|------------|
| Database Size | 32 GB | 128 GB |
| Database vCores | 1 (Burstable) | 2 (General Purpose) |
| High Availability | ❌ No | ✅ Zone-Redundant |
| Geo-Redundant Backup | ❌ No | ✅ Yes |
| Backup Retention | 7 days | 14 days |
| Function App Cold Start | ~1-5 seconds | < 1 second (pre-warmed) |
| Function App Scale | Slower (Consumption) | Faster (Premium) |
| Static Web App CDN | Basic | Enhanced (custom domains, etc.) |
| **Best For** | Dev/Test, Small Teams | Production, Enterprise |

## Recommendations

### Use Cost-Optimized Mode If:
- You're in development or testing phase
- You have < 10 concurrent users
- Occasional cold starts (1-5 sec) are acceptable
- You don't need high availability
- Your database is < 20 GB

### Use Enterprise Mode If:
- You're running production workloads
- You need 99.99% availability SLA
- You have > 50 concurrent users
- Sub-second response times are critical
- You need geo-redundant disaster recovery
- Your database is > 50 GB

## Additional Cost Savings

### 1. Azure Reserved Instances
Save up to 72% by committing to 1 or 3-year terms for:
- PostgreSQL Flexible Server
- App Service Plan (Functions EP1)

### 2. Log Analytics Optimization
- Reduce retention to 30 days (default is 30-90)
- Set data caps to limit ingestion costs
- Use diagnostic settings filters

### 3. Monitoring
```bash
# Check your actual costs
az cost-management query \
  --type ActualCost \
  --dataset-grouping name="ResourceGroupName" type="Dimension" \
  --timeframe MonthToDate
```

## Cost Estimation Tool

Use the Azure Pricing Calculator to estimate costs for your specific workload:
https://azure.microsoft.com/en-us/pricing/calculator/

## First User = Promaster

**Important**: Regardless of deployment mode, the first user to sign in with Azure AD automatically receives the 'promaster' role, allowing them to configure the system and add other users.

This ensures a smooth onboarding experience for customers.
