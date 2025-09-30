const { getBalance, getTokenSupply } = require('./evm');
const { getChainData } = require('../config');
const { request } = require('../http');
const { split, toArray } = require('../parser');
const { isNumber, toNumber, formatUnits } = require('../number');

const getRPCs = chain => {
  const { chain_id, deprecated, endpoints } = {
    ...getChainData(chain, 'amplifier'),
  };
  const rpcs = toArray(endpoints?.rpc);

  if (rpcs.length > 0 && !deprecated) {
    try {
      return {
        getBalance: async (address, contractData) => {
          let output;

          if (address) {
            const { decimals } = { ...contractData };
            let { contract_address } = { ...contractData };

            if (!contract_address) {
              contract_address = contractData?.address;
            }

            switch (chain) {
              case 'sui':
                for (const rpc of rpcs) {
                  try {
                    const { result } = {
                      ...(await request(rpc, {
                        method: 'post',
                        params: {
                          jsonrpc: '2.0',
                          method: 'suix_getBalance',
                          params: [address, contract_address],
                          id: 0,
                        },
                      })),
                    };

                    if (result?.totalBalance) {
                      output = formatUnits(
                        result.totalBalance,
                        decimals,
                        false
                      );
                      break;
                    }
                  } catch (error) {}
                }
                break;
              case 'xrpl':
                for (const rpc of rpcs) {
                  try {
                    // tokenAddress {currency}.{account}
                    const [currency, account] = split(contract_address, {
                      delimiter: '.',
                    });

                    // others assets
                    if (currency && account) {
                      const { result } = {
                        ...(await request(rpc, {
                          method: 'post',
                          params: {
                            jsonrpc: '2.0',
                            method: 'gateway_balances',
                            params: [{ account }],
                            id: 0,
                          },
                        })),
                      };

                      if (result?.obligations) {
                        output = toNumber(result.obligations[currency]);
                        break;
                      }
                    }
                    // XRP
                    else {
                      const { result } = {
                        ...(await request(rpc, {
                          method: 'post',
                          params: {
                            jsonrpc: '2.0',
                            method: 'account_info',
                            params: [{ account: address }],
                            id: 0,
                          },
                        })),
                      };

                      if (result?.account_data?.Balance) {
                        output = formatUnits(
                          result.account_data.Balance,
                          decimals,
                          false
                        );
                        break;
                      }
                    }
                  } catch (error) {}
                }
                break;
              default:
                if (isNumber(chain_id)) {
                  output = await getBalance(chain, address, contractData);
                }
                break;
            }
          }

          return output;
        },
        getTokenSupply: async contractData => {
          const { address, decimals } = { ...contractData };

          let output;

          if (address) {
            switch (chain) {
              case 'sui':
                for (const rpc of rpcs) {
                  try {
                    const { result } = {
                      ...(await request(rpc, {
                        method: 'post',
                        params: {
                          jsonrpc: '2.0',
                          method: 'suix_getTotalSupply',
                          params: [address],
                          id: 0,
                        },
                      })),
                    };

                    if (result?.value) {
                      output = formatUnits(result.value, decimals, false);
                      break;
                    }
                  } catch (error) {}
                }
                break;
              default:
                if (isNumber(chain_id)) {
                  output = await getTokenSupply(chain, contractData);
                }
                break;
            }
          }

          return output;
        },
      };
    } catch (error) {}
  }

  return;
};

module.exports = {
  getRPCs,
};
