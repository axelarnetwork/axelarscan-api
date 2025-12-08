const { getLCDInstance } = require('./utils');
const { ENVIRONMENT } = require('../../utils/config');
const { request } = require('../../utils/http');
const { toArray } = require('../../utils/parser');
const { equalsIgnoreCase, isString } = require('../../utils/string');

module.exports = async params => {
  const { height } = { ...params };
  const instance = getLCDInstance(height);

  return Object.fromEntries(
    toArray(
      await Promise.all(
        ['stakingParams', 'bankSupply', 'stakingPool', 'slashingParams'].map(
          k =>
            new Promise(async resolve => {
              switch (k) {
                case 'stakingParams':
                  resolve([
                    k,
                    (
                      await request(instance, {
                        path: '/cosmos/staking/v1beta1/params',
                      })
                    )?.params,
                  ]);
                  break;
                case 'bankSupply': {
                  const denom =
                    ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl';
                  let supply;
                  let nextKey = true;

                  while (nextKey) {
                    const response = await request(instance, {
                      path: '/cosmos/bank/v1beta1/supply',
                      params: {
                        'pagination.limit': 3000,
                        'pagination.key': isString(nextKey)
                          ? nextKey
                          : undefined,
                      },
                    });

                    if (!response?.supply) break;

                    // find supply object of this denom from response
                    supply = toArray(response?.supply).find(d =>
                      equalsIgnoreCase(d.denom, denom)
                    );

                    nextKey = response?.pagination?.next_key;

                    // break when already got supply
                    if (nextKey && supply) break;
                  }

                  resolve([k, supply || null]);
                  break;
                }
                case 'stakingPool':
                  resolve([
                    k,
                    (
                      await request(instance, {
                        path: '/cosmos/staking/v1beta1/pool',
                      })
                    )?.pool,
                  ]);
                  break;
                case 'slashingParams':
                  resolve([
                    k,
                    (
                      await request(instance, {
                        path: '/cosmos/slashing/v1beta1/params',
                      })
                    )?.params,
                  ]);
                  break;
                default:
                  resolve();
                  break;
              }
            })
        )
      )
    )
  );
};
