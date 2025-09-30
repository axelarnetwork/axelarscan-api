# Axelarscan API

## API Endpoints

- mainnet: [https://api.axelarscan.io/api](https://api.axelarscan.io/api)
- testnet: [https://testnet.api.axelarscan.io/api](https://testnet.api.axelarscan.io/api)

## Stacks

- AWS Lambda
- AWS API Gateway
- AWS EventBridge
- OpenSearch (for caching and indexing)

## Architecture

### TVL (Total Value Locked) System

The TVL system is built using caching and background processing.

#### Core Components

1. **`getTVL` Function** (`methods/tvl/getTVL.js`)
   - Calculates TVL across all supported assets and chains
   - Supports caching for fast response times
   - Processes 31+ assets across 70+ blockchain networks

2. **Background Update Service** (`services/interval-update/updateTVL.js`)
   - Runs periodically to pre-calculate TVL data
   - Processes assets in batches to avoid timeouts
   - Only runs on mainnet in production

3. **OpenSearch Caching** (`services/indexer/`)
   - Stores calculated TVL data for fast retrieval
   - Manages IBC channel data and token information
   - Provides search and query capabilities

#### Caching Strategy

**Production Behavior:**
- Background job processes assets in 10 groups over 10-minute intervals
- Each asset is calculated individually and cached immediately
- API calls return cached data (sub-second response times)
- Only processes ~3 assets per 6-minute window

**Cache Parameters:**
- `forceCache: true` - Forces fresh calculation, bypasses cache
- `isIntervalUpdate: true` - Indicates background job execution
- `customAssetsOnly: true` - Processes only custom/contract assets

**Cache Collections:**
- `token_tvls` - Individual asset TVL data
- `ibc_channels` - Inter-blockchain communication channel data
- `token_prices` - Token price information
- `token_infos` - Token metadata and configuration

#### Performance Characteristics

- **Production**: Sub-second response (cached data)
- **Local Development**: 5-10 minutes (full calculation)
- **Background Processing**: ~3 assets per 6-minute window
- **Total Operations**: 31 assets × 71 chains = 2,201 blockchain queries

#### Local Development

For local development setup and usage instructions, see [local/README.md](local/README.md).

Quick start:
```bash
# Setup OpenSearch indices and populate IBC data
node local/setup-indexer.js

# Pre-populate cache data (recommended)
node local/run-updates.js

# Run the dev server
pnpm dev
```

## Deployment

### Prerequisites

1. [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-prereqs.html)
2. [Configuring the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
3. [Install terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli)

```bash
pnpm i
cd ./terraform/testnet
terraform init
terraform apply
```
