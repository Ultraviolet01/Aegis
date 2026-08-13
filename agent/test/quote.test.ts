import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OkxQuoteClient, XLAYER_MAINNET_CHAIN_INDEX } from '../src/okx/quote.js';
import { createLogger } from '../src/logger.js';

/**
 * The reference price these tests cover feeds the oracle-deviation check,
 * which can trigger a real exit. A wrong price here moves user funds, so the
 * failure modes matter more than the happy path.
 */

const getQuote = vi.fn();

vi.mock('@okx-dex/okx-dex-sdk', () => ({
  OKXDexClient: class {
    dex = { getQuote: (...args: unknown[]) => getQuote(...args) };
  },
}));

const credentials = {
  apiKey: 'key',
  secretKey: 'secret',
  apiPassphrase: 'passphrase',
  projectId: 'project',
};

// Silent logger: these tests assert on return values, not console noise.
const logger = createLogger('error');

function makeClient() {
  return new OkxQuoteClient(credentials, logger);
}

/** An 18-decimal asset quoted into 6-decimal USDC — the real xStocks case. */
function quoteResponse(toTokenAmount: string, priceImpactPercent = '0.1') {
  return { data: [{ toTokenAmount, priceImpactPercent }] };
}

const oneToken18 = (10n ** 18n).toString();

beforeEach(() => {
  getQuote.mockReset();
});

describe('OkxQuoteClient.getReferencePrice', () => {
  it('normalizes decimals across an 18 -> 6 decimal pair', async () => {
    // 1 asset (1e18) -> 250 USDC (250e6). The price is 250, NOT 250e-12.
    getQuote.mockResolvedValue(quoteResponse((250n * 10n ** 6n).toString()));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9',
      toTokenAddress: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result?.price).toBeCloseTo(250, 6);
  });

  it('prices a multi-token position per unit, not per position', async () => {
    // 4 tokens -> 1000 USDC must read as 250/token. Returning 1000 here would
    // look like a 4x price spike and could trigger a false exit.
    getQuote.mockResolvedValue(quoteResponse((1000n * 10n ** 6n).toString()));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: (4n * 10n ** 18n).toString(),
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result?.price).toBeCloseTo(250, 6);
  });

  it('requests the X Layer mainnet chainIndex', async () => {
    getQuote.mockResolvedValue(quoteResponse((1n * 10n ** 6n).toString()));

    await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chainIndex: XLAYER_MAINNET_CHAIN_INDEX }),
    );
    expect(XLAYER_MAINNET_CHAIN_INDEX).toBe('196');
  });

  it('returns undefined when the API throws', async () => {
    // Must degrade to "no second opinion", never to a fabricated price.
    getQuote.mockRejectedValue(new Error('rate limited'));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when no route exists', async () => {
    getQuote.mockResolvedValue({ data: [] });

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined on a zero output amount instead of a zero price', async () => {
    // A price of 0 against a live oracle reads as 100% deviation, which would
    // trigger an immediate exit on what is really just missing data.
    getQuote.mockResolvedValue(quoteResponse('0'));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined on a malformed output amount', async () => {
    getQuote.mockResolvedValue(quoteResponse('not-a-number'));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when the input amount is zero', async () => {
    // Guards against a division by zero producing Infinity as a "price".
    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: '0',
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result).toBeUndefined();
  });

  it('surfaces price impact when present', async () => {
    getQuote.mockResolvedValue(quoteResponse((250n * 10n ** 6n).toString(), '1.5'));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result?.priceImpactPercent).toBe(1.5);
  });

  it('omits price impact rather than reporting NaN', async () => {
    getQuote.mockResolvedValue(quoteResponse((250n * 10n ** 6n).toString(), 'n/a'));

    const result = await makeClient().getReferencePrice({
      fromTokenAddress: '0xasset',
      toTokenAddress: '0xusdc',
      amount: oneToken18,
      fromDecimals: 18,
      toDecimals: 6,
    });

    expect(result?.priceImpactPercent).toBeUndefined();
    expect(result?.price).toBeCloseTo(250, 6);
  });
});
