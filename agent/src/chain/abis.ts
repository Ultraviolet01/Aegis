/**
 * Hand-written ABI fragments for the calls the agent actually makes.
 *
 * Kept minimal on purpose: the agent should only be able to reach the narrow
 * surface it's authorized for. There is deliberately NO withdraw/transfer
 * fragment here — AegisVault exposes no such path to the agent anyway, and
 * omitting it means a bug in this process cannot even encode such a call.
 */

export const aegisVaultAbi = [
  // --- reads ---
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
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
    name: 'nextPositionId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'agent',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'policyRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'emergencyVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },

  // --- the agent's ONLY state-changing calls ---
  {
    type: 'function',
    name: 'logRiskEvaluation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'riskScore', type: 'uint256' },
      { name: 'triggeredRule', type: 'string' },
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
  {
    // No recipient parameter exists — funds can only ever reach the immutable
    // emergencyVault. exitBps is additionally clamped on-chain against the
    // owner-approved ceiling in PolicyRegistry.
    type: 'function',
    name: 'routeToEmergency',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'exitBps', type: 'uint16' },
    ],
    outputs: [],
  },

  // --- events the agent watches ---
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
  {
    type: 'event',
    name: 'RoutedToEmergency',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'remaining', type: 'uint256', indexed: false },
    ],
  },

  // --- errors, so viem can decode reverts into readable names ---
  { type: 'error', name: 'NotAgent', inputs: [{ name: 'caller', type: 'address' }] },
  { type: 'error', name: 'PositionDoesNotExist', inputs: [{ name: 'positionId', type: 'uint256' }] },
  { type: 'error', name: 'InvalidExitBps', inputs: [{ name: 'exitBps', type: 'uint16' }] },
  {
    type: 'error',
    name: 'ExitBpsExceedsPolicy',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'requestedBps', type: 'uint16' },
      { name: 'allowedBps', type: 'uint16' },
    ],
  },
  { type: 'error', name: 'NoActivePolicy', inputs: [{ name: 'positionId', type: 'uint256' }] },
  { type: 'error', name: 'PolicyRegistryNotSet', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
] as const;

export const policyRegistryAbi = [
  {
    type: 'function',
    name: 'getPolicy',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'drawdownThresholdBps', type: 'uint16' },
          { name: 'oracleDeviationThresholdBps', type: 'uint16' },
          { name: 'exitPercentBps', type: 'uint16' },
          { name: 'mode', type: 'uint8' },
          { name: 'active', type: 'bool' },
          { name: 'updatedAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'exitAllowanceBps',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      { name: 'allowanceBps', type: 'uint16' },
      { name: 'active', type: 'bool' },
    ],
  },
] as const;

export const riskOracleAbi = [
  {
    type: 'function',
    name: 'getPrice',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'price', type: 'uint256' },
      { name: 'decimals', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'getDeviationBps',
    stateMutability: 'view',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'referencePrice', type: 'uint256' },
    ],
    outputs: [{ name: 'deviationBps', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'priceFeeds',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  { type: 'error', name: 'NoFeedForAsset', inputs: [{ name: 'asset', type: 'address' }] },
  {
    type: 'error',
    name: 'StalePrice',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'nowTs', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'InvalidPrice', inputs: [{ name: 'answer', type: 'int256' }] },
] as const;

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
] as const;
