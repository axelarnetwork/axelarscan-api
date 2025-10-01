# Local Development Setup

This directory contains files for running the Axelarscan API locally using AWS SAM.

> For general project information and architecture details, see the [main README](../README.md).

## Prerequisites

- [Node.js](https://nodejs.org/en) (v18 or higher)
- [Docker and Docker Compose](https://www.docker.com/products/docker-desktop/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

## Environment Setup

Copy `.env.example` into `.env` and adjust variables if needed.

## Usage

### Run resources

If you want to use a OpenSearch instance locally, run:

```bash
docker compose -f local/docker-compose.local.yml up -d
```

### Setup OpenSearch indices

After starting OpenSearch, you need to create the required indices and populate them with data:

```bash
# Setup all required indices and populate IBC channels
node local/setup-indexer.js
```

Alternatively, you can run the following:

```bash
# Or recreate all indices (useful if you have mapping issues)
node local/setup-indexer.js --recreate

# Skip IBC channel population (just create indices)
node local/setup-indexer.js --no-ibc-populate
```

This script will:

- Create required OpenSearch indices: `ibc_channels`, `token_tvls`, `token_prices`, `token_infos`
- Set up correct field mappings (e.g., `chain_id` as `text` for IBC queries)
- Populate IBC channel data from Axelar testnet (unless `--no-ibc-populate` is used)

### Pre-populate Cache Data

Run the background update service to pre-calculate and cache TVL data, just like production:

```bash
# Run all background updates (bulk TVL + other services)
node local/run-updates.js
```

Alternatively, run one of the following:

```bash
# Run only TVL updates (per-asset mode for granular caching)
node local/run-updates.js tvl

# Update a specific asset only
node local/run-updates.js tvl --asset=uaxl

# Run other services individually
node local/run-updates.js tokensPrice
node local/run-updates.js stats
node local/run-updates.js config
node local/run-updates.js tokenInfo
```

### Start the local API

```bash
pnpm dev
```

The API will be available at [http://localhost:3000](http://localhost:3000).

You can visit it to browse all the available methods.

**Modes:**

- **Bulk mode** (`node local/run-updates.js`): Single getTVL call processing all assets at once (faster, matches HTTP behavior)
- **Per-asset mode** (`node local/run-updates.js tvl`): Processes each asset individually (better for debugging, incremental caching)

After running this, your API calls will return cached data quickly!

### Dashboard

After spinning up the Docker containers, you can access the dashboard at [http://localhost:5601](http://localhost:5601).

## Files

- `template.yaml` - SAM template for local development
- `sam-wrapper.js` - Wrapper function that converts responses to API Gateway format
- `docker-compose.local.yml` - Docker Compose file to run OpenSearch and OpenSearch Dashboards locally
- `dev.js` - Script to start the local API development server
- `setup-indexer.js` - Script to create required OpenSearch indices and populate IBC channel data
- `run-updates.js` - Script to run background update services and pre-populate cache data

## How it works

1. The `template.yaml` defines a Lambda function that uses `sam-wrapper.handler`
2. The `sam-wrapper.js` calls the original `index.handler` and wraps the response in the proper API Gateway format
3. This allows the original Lambda function to work without modification while providing the correct response format for SAM/API Gateway

## Troubleshooting

If SAM doesn't find Docker, run:

```bash
docker context inspect
```

Then set the Docker host (replace `{user}` with your username):

```bash
export DOCKER_HOST=unix:///home/{user}/.docker/desktop/docker.sock
```
