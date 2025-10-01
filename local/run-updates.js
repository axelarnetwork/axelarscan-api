#!/usr/bin/env node

/*
  Run the background update services locally to pre-populate cache data.

  Usage:
    node local/run-updates.js                    # Run all updates (per-asset TVL + other services)
    node local/run-updates.js tvl                # Only run TVL updates (per-asset mode)
    node local/run-updates.js tvl --asset=uaxl   # Update specific asset only
    node local/run-updates.js tokensPrice        # Only run token price updates
    node local/run-updates.js stats              # Only run stats updates
    node local/run-updates.js config             # Only run config updates
    node local/run-updates.js tokenInfo          # Only run token info updates

  Modes:
    - Per-asset mode (default): Processes each asset individually for granular caching
    - Specific asset mode: Updates only the specified asset
*/

require('dotenv').config();

const { getTVL } = require('../methods');
const { getAssets, getITSAssets } = require('../utils/config');
const updateTokensPrice = require('../services/interval-update/updateTokensPrice');
const updateStats = require('../services/interval-update/updateStats');
const updateConfig = require('../services/interval-update/updateConfig');
const updateTokenInfo = require('../services/interval-update/updateTokenInfo');

const args = process.argv.slice(2);
const service = args.find(arg => !arg.startsWith('--')) || 'all';
const assetArg = args.find(arg => arg.startsWith('--asset='));
const specificAsset = assetArg ? assetArg.replace('--asset=', '') : null;

async function runTVLUpdates(asset = null) {
  if (asset) {
    // Update specific asset
    await getTVL({
      asset: asset,
      forceCache: true,
      isIntervalUpdate: true,
    });
    console.log(`✅ Updated TVL for asset: ${asset}`);
  } else {
    // Per-asset mode: process each asset individually for granular caching
    const allAssets = [...(await getAssets()), ...(await getITSAssets())];
    console.log(`📊 Processing ${allAssets.length} assets individually...`);

    const results = {};
    for (let i = 0; i < allAssets.length; i++) {
      const asset = allAssets[i];
      console.log(`🔄 [${i + 1}/${allAssets.length}] ${asset.id}...`);

      try {
        const result = await getTVL({
          asset: asset.id,
          forceCache: true,
          isIntervalUpdate: true,
        });
        results[asset.id] = result;
        console.log(`✅ [${i + 1}/${allAssets.length}] ${asset.id}`);
      } catch (error) {
        console.error(
          `❌ [${i + 1}/${allAssets.length}] ${asset.id}: ${error.message}`
        );
      }
    }

    console.log(`✅ Updated TVL for ${Object.keys(results).length} assets`);
  }
}

async function runUpdates() {
  console.log('🔄 Starting background update services...');
  console.log(`📊 Mode: ${service === 'all' ? 'All services' : service}`);
  if (specificAsset) {
    console.log(`🎯 Target asset: ${specificAsset}`);
  }

  const startTime = Date.now();

  try {
    // TVL updates
    if (service === 'tvl' || service === 'all') {
      console.log('📈 Running TVL updates...');
      await runTVLUpdates(specificAsset);
      console.log('✅ TVL updated');
    }

    // Token price updates
    if (service === 'tokensPrice' || service === 'all') {
      console.log('💰 Running token price updates...');
      await updateTokensPrice();
      console.log('✅ Token prices updated');
    }

    // Stats updates
    if (service === 'stats' || service === 'all') {
      console.log('📊 Running stats updates...');
      await updateStats();
      console.log('✅ Stats updated');
    }

    // Config updates
    if (service === 'config' || service === 'all') {
      console.log('⚙️ Running config updates...');
      await updateConfig();
      console.log('✅ Config updated');
    }

    // Token info updates
    if (service === 'tokenInfo' || service === 'all') {
      console.log('ℹ️ Running token info updates...');
      await updateTokenInfo();
      console.log('✅ Token info updated');
    }

    // Unknown service
    if (
      !['tvl', 'tokensPrice', 'stats', 'config', 'tokenInfo', 'all'].includes(
        service
      )
    ) {
      console.error(`❌ Unknown service: ${service}`);
      console.log(
        'Available services: tvl, tokensPrice, stats, config, tokenInfo, all'
      );
      process.exit(1);
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 All updates completed in ${(duration / 1000).toFixed(2)}s`);
    console.log('💡 Now your API calls should return cached data quickly!');
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `❌ Error after ${(duration / 1000).toFixed(2)}s:`,
      error.message
    );
    process.exit(1);
  }
}

runUpdates();
