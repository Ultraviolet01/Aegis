/**
 * Narrow ABIs — only the functions the UI actually calls.
 *
 * Kept minimal on purpose: a trimmed ABI cannot accidentally expose a
 * fund-moving function through the interface, and it keeps the client bundle
 * small.
 */

export const erc20Abi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  /**
   * Testnet-only: MockERC20.mint is permissionless so any tester can fund
   * themselves. This entry is safe to include in the shared ABI because the
   * function does not exist on the real mainnet ERC-20 contracts — calling it
   * against a non-mock address will simply revert.
   */
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const aegisVaultAbi = [
  {
    type: 'function',
    name: 'nextPositionId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'pausedByAgent', type: 'bool' },
      { name: 'exists', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'positionId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pausePosition',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },

  /* --- Events -------------------------------------------------------------
     Read-only. These back the decision-history timeline: the agent's
     reasoning is not stored in contract state, it is emitted. Reading the
     logs is therefore the honest way to show what happened — it is the same
     record an auditor would pull, not a UI-side narrative. */
  {
    type: 'event',
    name: 'RiskEvaluated',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'riskScore', type: 'uint256', indexed: false },
      { name: 'triggeredRule', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionPaused',
    inputs: [{ name: 'positionId', type: 'uint256', indexed: true }],
  },
  {
    type: 'event',
    name: 'PositionUnpaused',
    inputs: [{ name: 'positionId', type: 'uint256', indexed: true }],
  },
  {
    type: 'event',
    name: 'RoutedToEmergency',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'remaining', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;


export const policyRegistryAbi = [
  {
    type: 'function',
    name: 'getPolicy',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'drawdownThresholdBps', type: 'uint16' },
          { name: 'oracleDeviationThresholdBps', type: 'uint16' },
          { name: 'exitPercentBps', type: 'uint16' },
          { name: 'mode', type: 'uint8' },
          { name: 'active', type: 'bool' },
          { name: 'updatedAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'drawdownThresholdBps', type: 'uint16' },
      { name: 'oracleDeviationThresholdBps', type: 'uint16' },
      { name: 'exitPercentBps', type: 'uint16' },
      { name: 'mode', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'PolicySet',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'drawdownThresholdBps', type: 'uint16', indexed: false },
      { name: 'oracleDeviationThresholdBps', type: 'uint16', indexed: false },
      { name: 'exitPercentBps', type: 'uint16', indexed: false },
      { name: 'mode', type: 'uint8', indexed: false },
    ],
  },
] as const;

export const emergencyVaultAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'claimIndex', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimCount',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimDelay',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimsByPosition',
    stateMutability: 'view',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimableAt', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'claimIndex', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

