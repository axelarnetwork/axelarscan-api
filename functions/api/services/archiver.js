const axios = require('axios');
const moment = require('moment');
const config = require('config-yml');
const {
  delete_by_query,
} = require('./index');
const {
  log,
} = require('../utils');

const service_name = 'archiver';
const environment = process.env.ENVIRONMENT ||
  config?.environment;

const {
  endpoints,
} = { ...config?.[environment] };

let {
  store_blocks,
  cache_timeout_seconds,
} = { ...config?.[environment] };

store_blocks = store_blocks ||
  100000;
cache_timeout_seconds = cache_timeout_seconds ||
  300;

module.exports = async () => {
  const collections =
    [
      'blocks',
    ];

  if (
    collections.length > 0 &&
    endpoints?.rpc
  ) {
    // initial rpc
    const rpc = axios.create(
      {
        baseURL: endpoints.rpc,
      },
    );

    const response = await rpc.get(
      '/status',
    ).catch(error => { return { data: { results: null, error } }; });

    const {
      latest_block_height,
    } = { ...response?.data?.result?.sync_info };

    const latest_block = Number(latest_block_height);

    if (latest_block > store_blocks) {
      for (const collection of collections) {
        log(
          'info',
          service_name,
          'archive',
          {
            collection,
            store_blocks,
          },
        );

        const output = await delete_by_query(
          collection,
          {
            range: {
              height: {
                lt: latest_block - store_blocks,
              },
            },
          },
        );

        log(
          'debug',
          service_name,
          'archive output',
          output,
        );
      }
    }
  }

  const cache_collections =
    [
      'axelard',
      'cosmos',
    ];

  for (const collection of cache_collections) {
    log(
      'info',
      service_name,
      'archive',
      {
        collection,
        cache_timeout_seconds,
      },
    );

    const output = await delete_by_query(
      collection,
      {
        bool: {
          must: [
            {
              range: {
                updated_at: {
                  lt: moment()
                    .subtract(
                      cache_timeout_seconds,
                      'seconds',
                    )
                    .unix(),
                },
              },
            },
          ],
          must_not: collection === 'axelard' ?
            [
              {
                bool: {
                  should: [
                    { exists: { field: 'type' } },
                    { match: { type: 'proxy' } },
                  ],
                  minimum_should_match: 1, 
                },
              },
            ] :
            [],
        },
      },
    );

    log(
      'debug',
      service_name,
      'archive output',
      output,
    );
  }

  return;
};