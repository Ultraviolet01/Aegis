import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  getApproveSpender,
  getQuote,
  getSwapTransaction,
  okxConfigured,
  OkxApiError,
  OkxConfigError,
} from '@/lib/okx-server';

/**
 * Swap API — the trust boundary.
 *
 * The browser never sees the OKX credentials. It posts what it wants, this
 * route signs the OKX request server-side, and it returns UNSIGNED calldata.
 * Nothing here can move funds: the returned transaction is inert until the
 * user's own wallet signs it.
 *
 * `force-dynamic` because a cached swap route would hand a user stale
 * calldata built for a price that no longer exists.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Reject obvious junk before spending an upstream API call on it. */
function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!okxConfigured()) {
    return NextResponse.json(
      {
        error:
          'OKX credentials are not configured on the server. Set OKX_API_KEY, ' +
          'OKX_SECRET_KEY, OKX_API_PASSPHRASE and OKX_PROJECT_ID in the root .env.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError('Request body must be valid JSON.');
  }

  const {
    action,
    fromTokenAddress,
    toTokenAddress,
    amount,
    userWalletAddress,
    slippagePercent = '0.005',
  } = (body ?? {}) as Record<string, string>;

  if (action !== 'quote' && action !== 'swap' && action !== 'spender') {
    return validationError('action must be one of: quote, swap, spender.');
  }

  try {
    if (action === 'spender') {
      const spender = await getApproveSpender();
      if (!spender) {
        return NextResponse.json(
          { error: 'OKX did not return an approval spender for X Layer.' },
          { status: 502 },
        );
      }
      return NextResponse.json({ spender });
    }

    if (!fromTokenAddress || !isAddress(fromTokenAddress)) {
      return validationError('fromTokenAddress must be a valid address.');
    }
    if (!toTokenAddress || !isAddress(toTokenAddress)) {
      return validationError('toTokenAddress must be a valid address.');
    }
    if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
      return validationError('fromTokenAddress and toTokenAddress must differ.');
    }
    // Amount is a raw integer string in the token's smallest unit. Parsing as
    // BigInt rejects decimals and scientific notation, which would otherwise
    // reach the API as a silently different number.
    let parsedAmount: bigint;
    try {
      parsedAmount = BigInt(amount ?? '');
    } catch {
      return validationError('amount must be an integer string in the token\'s smallest unit.');
    }
    if (parsedAmount <= 0n) {
      return validationError('amount must be greater than zero.');
    }

    if (action === 'quote') {
      const quote = await getQuote({
        fromTokenAddress,
        toTokenAddress,
        amount: parsedAmount.toString(),
      });

      if (!quote) {
        return NextResponse.json(
          { error: 'No route found for this pair. Liquidity may be too thin.' },
          { status: 404 },
        );
      }

      return NextResponse.json({ quote });
    }

    // action === 'swap'
    if (!userWalletAddress || !isAddress(userWalletAddress)) {
      return validationError('userWalletAddress must be a valid address.');
    }

    const result = await getSwapTransaction({
      fromTokenAddress,
      toTokenAddress,
      amount: parsedAmount.toString(),
      userWalletAddress,
      slippagePercent,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'OKX did not return swap calldata for this route.' },
        { status: 502 },
      );
    }

    // Returned as-is for the user's wallet to sign. The recipient was set to
    // the user's own address upstream; Aegis never appears in this path.
    return NextResponse.json({ tx: result.tx, quote: result.quote });
  } catch (err) {
    if (err instanceof OkxConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof OkxApiError) {
      // Surface OKX's own message — "insufficient liquidity" is far more
      // useful to a user than a generic 500.
      return NextResponse.json({ error: err.message, code: err.code }, { status: 502 });
    }

    console.error('Swap route failed:', err);
    return NextResponse.json({ error: 'Unexpected error building the swap.' }, { status: 500 });
  }
}
