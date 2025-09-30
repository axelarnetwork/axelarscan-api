/*
  Setup OpenSearch indices needed locally and optionally populate data.

  Usage:
    node local/setup-indexer.js                         # ensure all indices
    node local/setup-indexer.js --recreate              # recreate all indices
    node local/setup-indexer.js --no-ibc-populate       # skip populating IBC

  Environment variables (loaded from .env file):
    INDEXER_URL (default: http://localhost:9200)
    INDEXER_USERNAME (optional)
    INDEXER_PASSWORD (optional)
*/

require('dotenv').config();

const { request } = require('../utils/http');
const {
  IBC_CHANNEL_COLLECTION,
  TOKEN_TVL_COLLECTION,
  TOKEN_PRICE_COLLECTION,
  TOKEN_INFO_COLLECTION,
} = require('../utils/config');
const saveIBCChannels = require('../methods/tvl/saveIBCChannels');

const DEFAULT_INDEXER_URL = 'http://localhost:9200';

const getIndexerUrl = () => process.env.INDEXER_URL || DEFAULT_INDEXER_URL;

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    recreate: args.has('--recreate'),
    skipIbcPopulate: args.has('--no-ibc-populate'),
  };
};

// Mappings per index (minimal and safe for our queries)
const INDEX_MAPPINGS = {
  // used with match_phrase_prefix on chain_id -> must be text
  [IBC_CHANNEL_COLLECTION]: {
    mappings: {
      properties: {
        channel_id: { type: 'keyword' },
        chain_id: { type: 'text' },
        state: { type: 'keyword' },
        escrow_address: { type: 'keyword' },
        counterparty: {
          properties: {
            chain_id: { type: 'text' },
            escrow_address: { type: 'keyword' },
          },
        },
        latest_height: { type: 'long' },
        updated_at: { type: 'long' },
      },
    },
  },
  // token tvls are queried by updated_at range and sorted, and store arrays
  [TOKEN_TVL_COLLECTION]: {
    mappings: {
      properties: {
        updated_at: { type: 'long' },
        id: { type: 'keyword' },
        data: { type: 'object', enabled: true },
      },
    },
  },
  // token prices store price/time series; we at least ensure updated_at exists
  [TOKEN_PRICE_COLLECTION]: {
    mappings: {
      properties: {
        updated_at: { type: 'long' },
      },
    },
  },
  // token infos store metadata; ensure updated_at for any range/sort
  [TOKEN_INFO_COLLECTION]: {
    mappings: {
      properties: {
        updated_at: { type: 'long' },
      },
    },
  },
};

const ensureIndex = async (indexerUrl, indexName, recreate) => {
  if (recreate) {
    // delete if exists (ignore 404)
    await request(indexerUrl, { method: 'delete', path: `/${indexName}` });
  }

  // exists?
  const exists = await request(indexerUrl, {
    method: 'get',
    path: `/${indexName}`,
  });
  if (exists?.error?.status === 404 || recreate) {
    const mapping = INDEX_MAPPINGS[indexName] || undefined;
    const createRes = await request(indexerUrl, {
      method: 'put',
      path: `/${indexName}`,
      params: mapping,
    });
    if (!(createRes && createRes.acknowledged)) {
      throw new Error(
        `Failed to create index ${indexName}: ${JSON.stringify(createRes)}`
      );
    }
    console.log(`Created index: ${indexName}`);
  } else {
    // Validate mapping where we care
    if (indexName === IBC_CHANNEL_COLLECTION) {
      const mapping = await request(indexerUrl, {
        method: 'get',
        path: `/${indexName}/_mapping`,
      });
      const chainIdType =
        mapping?.[indexName]?.mappings?.properties?.chain_id?.type;
      if (chainIdType && chainIdType !== 'text') {
        console.warn(
          `Warning: ${indexName}.chain_id mapping is '${chainIdType}', expected 'text'. Use --recreate to fix.`
        );
      }
    }
    console.log(`Index exists: ${indexName}`);
  }
};

const countDocs = async (indexerUrl, indexName) => {
  const res = await request(indexerUrl, {
    method: 'get',
    path: `/${indexName}/_count`,
  });
  return res?.count || 0;
};

(async () => {
  try {
    const { recreate, skipIbcPopulate } = parseArgs();
    const indexerUrl = getIndexerUrl();

    // Make INDEXER_URL visible to indexer service used by any writers
    process.env.INDEXER_URL = indexerUrl;

    const targets = [
      IBC_CHANNEL_COLLECTION,
      TOKEN_TVL_COLLECTION,
      TOKEN_PRICE_COLLECTION,
      TOKEN_INFO_COLLECTION,
    ];

    console.log(`Using INDEXER_URL: ${indexerUrl}`);
    for (const indexName of targets) {
      await ensureIndex(indexerUrl, indexName, recreate);
      const c = await countDocs(indexerUrl, indexName);
      console.log(`Docs in ${indexName}: ${c}`);
    }

    if (!skipIbcPopulate) {
      console.log('Populating IBC channels from Axelar LCD...');
      await saveIBCChannels();
      const c = await countDocs(indexerUrl, IBC_CHANNEL_COLLECTION);
      console.log(`Done. Docs in ${IBC_CHANNEL_COLLECTION}: ${c}`);
    }

    console.log('Index setup complete.');
    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err?.message || err);
    process.exit(1);
  }
})();
