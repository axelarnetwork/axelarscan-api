const normalize_obj = object => Array.isArray(object) ?
  object :
  Object.fromEntries(
    Object.entries(object)
      .map(([k, v]) => [
        k,
        typeof v === 'object' ?
          normalize_obj(v) :
          typeof v === 'boolean' ?
            v :
            !isNaN(v) ?
              Number(v) :
              v
      ])
  );

const transfer_collections = [
  'deposit_addresses',
  'transfers',
  'batches',
  'token_sent_events',
  'ibc_channels',
  'tvls',
];

module.exports = {
  normalize_obj,
  transfer_collections,
};