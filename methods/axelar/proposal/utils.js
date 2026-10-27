const { createHash } = require('crypto');
const { gunzipSync } = require('zlib');

const { toArray } = require('../../../utils/parser');

// upper bound when decompressing bytecode
const MAX_WASM_SIZE = 16 * 1024 * 1024;

const isGzip = buffer =>
  buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

// replace `wasm_byte_code` (base64, optionally gzipped) of a message with the
// sha256 checksum and size of the uncompressed wasm. the checksum matches the
// on-chain code `data_hash` and the checksums.txt of a release
const stripWasmByteCode = message => {
  if (!message || typeof message !== 'object') return;
  if (!('wasm_byte_code' in message)) return;

  const { wasm_byte_code } = message;
  delete message.wasm_byte_code;

  if (typeof wasm_byte_code !== 'string' || !wasm_byte_code) return;

  try {
    let wasm = Buffer.from(wasm_byte_code, 'base64');
    if (isGzip(wasm)) {
      wasm = gunzipSync(wasm, { maxOutputLength: MAX_WASM_SIZE });
    }

    message.wasm_byte_code_checksum = createHash('sha256')
      .update(wasm)
      .digest('hex');
    message.wasm_byte_code_size = wasm.length;
  } catch (error) {}
};

// strip the bytecode from every place a proposal can carry it: v1 messages,
// legacy content wrapped in a message and v1beta1 content.
// the full list of proposals must stay well below the 6MB lambda response limit
const stripProposalWasmByteCode = proposal => {
  toArray(proposal?.messages).forEach(m => {
    stripWasmByteCode(m);
    stripWasmByteCode(m?.content);
  });
  stripWasmByteCode(proposal?.content);

  return proposal;
};

module.exports = {
  stripProposalWasmByteCode,
};
