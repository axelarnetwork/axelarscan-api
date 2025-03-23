const { Contract, FallbackProvider, JsonRpcProvider, ZeroAddress, keccak256, toUtf8Bytes } = require('ethers');

const { getChainData } = require('../config');
const { request } = require('../http');
const { toArray } = require('../parser');
const { toNumber, toBigNumber, formatUnits } = require('../number');

const createRPCProvider = (url, chainId) => new JsonRpcProvider(url, chainId ? toNumber(chainId) : undefined);
const getProvider = chain => {
  const { chain_id, deprecated, endpoints } = { ...getChainData(chain, 'evm') };
  const rpcs = toArray(endpoints?.rpc);

  if (rpcs.length > 0 && !deprecated) {
    try {
      if (rpcs.length === 1) return createRPCProvider(rpcs[0], chain_id);
      return new FallbackProvider(
        rpcs.map((url, i) => ({
          provider: createRPCProvider(url, chain_id),
          priority: i + 1,
          weight: 1,
          stallTimeout: 1000,
        })),
        chain_id,
      );
    } catch (error) {}
  }

  return;
};

const getBalance = async (chain, address, contractData) => {
  const { rpc } = { ...getChainData(chain, 'evm')?.endpoints };
  if (!(rpc && address)) return;

  const { decimals } = { ...contractData };
  let { contract_address } = { ...contractData };

  // default to ZeroAddress
  contract_address = contract_address || contractData?.address || ZeroAddress;

  let balance;

  // post request to rpcs
  for (const url of toArray(rpc)) {
    try {
      const { result } = { ...await request(url, { method: 'post', params: { jsonrpc: '2.0', method: contract_address === ZeroAddress ? 'eth_getBalance' : 'eth_call', params: contract_address === ZeroAddress ? [address, 'latest'] : [{ to: contract_address, data: `${keccak256(toUtf8Bytes('balanceOf(address)')).substring(0, 10)}000000000000000000000000${address.substring(2)}` }, 'latest'], id: 0 } }) };

      if (result) {
        balance = toBigNumber(result);
        break;
      }
    } catch (error) {}
  }

  if (!balance) {
    // fallback to ethers
    try {
      const provider = getProvider(chain);

      if (contract_address === ZeroAddress) {
        balance = await provider.getBalance(address);
      }
      else {
        const contract = new Contract(contract_address, ['function balanceOf(address owner) view returns (uint256)'], provider);
        balance = await contract.balanceOf(address);
      }
    } catch (error) {}
  }

  return formatUnits(balance, decimals, false);
};

const getTokenSupply = async (chain, contractData) => {
  const { rpc } = { ...getChainData(chain, 'evm')?.endpoints };
  const { address, decimals } = { ...contractData };
  if (!(rpc && address && address !== ZeroAddress)) return;

  let supply;

  // post request to rpcs
  for (const url of toArray(rpc)) {
    try {
      const { result } = { ...await request(url, { method: 'post', params: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: address, data: keccak256(toUtf8Bytes('totalSupply()')) }, 'latest'], id: 0 } }) };

      if (result) {
        supply = toBigNumber(result);
        break;
      }
    } catch (error) {}
  }

  if (!supply) {
    // fallback to ethers
    try {
      const provider = getProvider(chain);

      const contract = new Contract(address, ['function totalSupply() view returns (uint256)'], provider);
      supply = await contract.totalSupply();
    } catch (error) {}
  }

  return formatUnits(supply, decimals, false);
};

module.exports = {
  getProvider,
  getBalance,
  getTokenSupply,
};