// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title AegisVault
/// @notice Non-custodial position holder for Aegis. A user deposits a single
///         supported asset (stablecoin or an xStocks RWA token) into a
///         position. The Aegis agent role can EVALUATE risk and, if a policy
///         condition trips, PAUSE the position or ROUTE a portion of it to a
///         fixed, immutable EmergencyVault — a time-locked contract the
///         position owner (and only the position owner) can later claim
///         from. The agent can never withdraw funds to itself or to any
///         address other than the EmergencyVault. The position owner can
///         always withdraw their own remaining balance directly, at any
///         time, regardless of what the agent has done.
///
///         Core invariant under test: no code path in this contract can move
///         a position's funds anywhere except (a) back to the position
///         owner, or (b) to the immutable EmergencyVault address set at
///         construction. See test/AegisVault.t.sol for the fuzz test that
///         asserts this.
contract AegisVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Position {
        address owner;
        address asset;
        uint256 amount;
        bool pausedByAgent;
        bool exists;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The only address funds can ever be routed to besides the
    ///         position owner. Set once at deploy time, never changeable.
    address public immutable emergencyVault;

    /// @notice The Aegis off-chain agent's on-chain signing address. Can
    ///         evaluate and act on positions, but is deliberately narrow in
    ///         what "act" is allowed to mean — see routeToEmergency below.
    ///         Settable by the contract owner (e.g. a project multisig),
    ///         never by the agent itself.
    address public agent;

    /// @notice PolicyRegistry holding each position's owner-approved risk
    ///         policy. Wired in AFTER construction because PolicyRegistry
    ///         itself takes this vault's address in its constructor — the
    ///         two are mutually referential, so one side must be set by a
    ///         follow-up owner call. Only the contract owner can set it;
    ///         the agent cannot point the vault at a registry of its own.
    address public policyRegistry;

    uint256 public nextPositionId = 1;

    mapping(uint256 => Position) public positions;

    /// @notice Assets this vault accepts deposits of. Owner-managed allowlist
    ///         so a user can't accidentally deposit an unsupported/untrusted
    ///         token that a rogue policy trigger might mishandle.
    mapping(address => bool) public supportedAssets;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AssetSupportUpdated(address indexed asset, bool supported);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event PositionOpened(uint256 indexed positionId, address indexed owner, address indexed asset, uint256 amount);
    event Deposited(uint256 indexed positionId, uint256 amount);
    event Withdrawn(uint256 indexed positionId, address indexed to, uint256 amount);
    event PositionPaused(uint256 indexed positionId);
    event PositionUnpaused(uint256 indexed positionId);
    event PolicyRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    /// @notice Emitted on every agent risk evaluation, whether or not it
    ///         resulted in an action. This is the transparency log judges
    ///         and users can recompute independently — riskScore and
    ///         triggeredRule are informational only and are not trusted for
    ///         any on-chain logic in this contract.
    event RiskEvaluated(
        uint256 indexed positionId, uint256 riskScore, string triggeredRule, uint256 timestamp
    );

    event RoutedToEmergency(uint256 indexed positionId, uint256 amount, uint256 remaining);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error AssetNotSupported(address asset);
    error PositionDoesNotExist(uint256 positionId);
    error NotPositionOwner(uint256 positionId, address caller);
    error NotAgent(address caller);
    error ZeroAmount();
    error InsufficientBalance(uint256 positionId, uint256 requested, uint256 available);
    error InvalidExitBps(uint16 exitBps);
    error ZeroAddress();

    /// @notice The agent asked to route more than the position owner's policy
    ///         authorizes. Kept distinct from InvalidExitBps (which means the
    ///         value is structurally invalid, i.e. 0 or >100%) so the frontend
    ///         and the agent's own logs can tell "malformed request" apart from
    ///         "exceeded what the user approved".
    error ExitBpsExceedsPolicy(uint256 positionId, uint16 requestedBps, uint16 allowedBps);

    /// @notice No active policy exists for this position, so the agent has no
    ///         authority over it at all. Fail-closed by design: the absence of
    ///         a policy means zero permission, never unlimited permission.
    error NoActivePolicy(uint256 positionId);

    /// @notice The PolicyRegistry has not been wired in yet. Until it is, the
    ///         agent's exit ceiling cannot be checked, so routing is refused
    ///         outright rather than proceeding unchecked.
    error PolicyRegistryNotSet();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address _emergencyVault, address _agent, address _owner) Ownable(_owner) {
        if (_emergencyVault == address(0)) revert ZeroAddress();
        if (_agent == address(0)) revert ZeroAddress();
        emergencyVault = _emergencyVault;
        agent = _agent;
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent(msg.sender);
        _;
    }

    modifier onlyPositionOwner(uint256 positionId) {
        Position storage p = positions[positionId];
        if (!p.exists) revert PositionDoesNotExist(positionId);
        if (p.owner != msg.sender) revert NotPositionOwner(positionId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Admin (contract owner — e.g. project multisig, NOT the agent)
    // ---------------------------------------------------------------------

    function setAssetSupported(address asset, bool supported) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        supportedAssets[asset] = supported;
        emit AssetSupportUpdated(asset, supported);
    }

    /// @notice Rotate the agent's signing key. Deliberately does NOT let the
    ///         agent call this itself — only the contract owner can, e.g.
    ///         after a key compromise or routine rotation.
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    /// @notice Point this vault at the PolicyRegistry holding its positions'
    ///         owner-approved policies. Owner-only: the agent must never be
    ///         able to swap in a registry that grants itself a larger exit
    ///         allowance than users actually approved.
    function setPolicyRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddress();
        emit PolicyRegistryUpdated(policyRegistry, newRegistry);
        policyRegistry = newRegistry;
    }

    // ---------------------------------------------------------------------
    // Position owner actions
    // ---------------------------------------------------------------------

    /// @notice Open a new position by depositing `amount` of `asset`.
    function openPosition(address asset, uint256 amount) external nonReentrant returns (uint256 positionId) {
        if (!supportedAssets[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();

        positionId = nextPositionId++;
        positions[positionId] =
            Position({owner: msg.sender, asset: asset, amount: amount, pausedByAgent: false, exists: true});

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        emit PositionOpened(positionId, msg.sender, asset, amount);
    }

    /// @notice Add more of the same asset to an existing position.
    function deposit(uint256 positionId, uint256 amount) external nonReentrant onlyPositionOwner(positionId) {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positions[positionId];
        p.amount += amount;
        IERC20(p.asset).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(positionId, amount);
    }

    /// @notice Manual override / emergency exit — the position owner can
    ///         always withdraw their own remaining balance to their own
    ///         address, at any time, whether or not the agent has paused
    ///         the position. This is the non-custodial guarantee: nothing
    ///         the agent does can lock a user's own funds away from them.
    function withdraw(uint256 positionId, uint256 amount) external nonReentrant onlyPositionOwner(positionId) {
        Position storage p = positions[positionId];
        if (amount == 0) revert ZeroAmount();
        if (amount > p.amount) revert InsufficientBalance(positionId, amount, p.amount);

        p.amount -= amount;
        IERC20(p.asset).safeTransfer(msg.sender, amount);
        emit Withdrawn(positionId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Agent actions — deliberately narrow surface
    // ---------------------------------------------------------------------

    /// @notice Log a risk evaluation. Callable by the agent on any interval;
    ///         purely informational, changes no balances. This is the event
    ///         the frontend's decision-history view reads from.
    function logRiskEvaluation(uint256 positionId, uint256 riskScore, string calldata triggeredRule)
        external
        onlyAgent
    {
        if (!positions[positionId].exists) revert PositionDoesNotExist(positionId);
        emit RiskEvaluated(positionId, riskScore, triggeredRule, block.timestamp);
    }

    /// @notice Pause a position — blocks the agent from taking further
    ///         action on it, but never blocks the owner's own withdraw().
    ///         Either the agent (as a defensive circuit-breaker) or the
    ///         owner (manual override) can call this.
    function pausePosition(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (!p.exists) revert PositionDoesNotExist(positionId);
        if (msg.sender != agent && msg.sender != p.owner) revert NotAgent(msg.sender);
        p.pausedByAgent = true;
        emit PositionPaused(positionId);
    }

    /// @notice Only the position owner can unpause — the agent cannot
    ///         un-pause a position it paused, which keeps pause strictly a
    ///         safety brake, never a lockout mechanism either direction.
    function unpausePosition(uint256 positionId) external onlyPositionOwner(positionId) {
        positions[positionId].pausedByAgent = false;
        emit PositionUnpaused(positionId);
    }

    /// @notice The ONLY state-changing action the agent can take on a
    ///         position's funds besides pausing: move up to `exitBps` basis
    ///         points of the position's current balance to the immutable
    ///         EmergencyVault, tagged with this position's id and owner so
    ///         only that owner can claim it back after the time lock. This
    ///         function has no path to any address other than
    ///         `emergencyVault` — there is no recipient parameter.
    ///
    ///         `exitBps` is additionally clamped on-chain against the exit
    ///         ceiling the position owner approved in PolicyRegistry, so the
    ///         agent cannot exceed the user's stated policy even if its
    ///         signing key is compromised. The check is fail-closed: if no
    ///         registry is wired, or the position has no active policy, the
    ///         agent has no authority at all and the call reverts.
    function routeToEmergency(uint256 positionId, uint16 exitBps) external nonReentrant onlyAgent {
        Position storage p = positions[positionId];
        if (!p.exists) revert PositionDoesNotExist(positionId);
        if (p.pausedByAgent) revert PositionDoesNotExist(positionId); // paused positions are frozen to the agent
        if (exitBps == 0 || exitBps > 10_000) revert InvalidExitBps(exitBps);

        // Enforce the owner-approved ceiling. Read from the registry rather
        // than trusting the agent's own claim about what the policy allows.
        if (policyRegistry == address(0)) revert PolicyRegistryNotSet();
        (uint16 allowedBps, bool policyActive) = IPolicyAllowance(policyRegistry).exitAllowanceBps(positionId);
        if (!policyActive || allowedBps == 0) revert NoActivePolicy(positionId);
        if (exitBps > allowedBps) revert ExitBpsExceedsPolicy(positionId, exitBps, allowedBps);

        uint256 amountOut = (p.amount * exitBps) / 10_000;
        if (amountOut == 0) revert ZeroAmount();

        p.amount -= amountOut;
        IERC20(p.asset).safeTransfer(emergencyVault, amountOut);

        // Notify the EmergencyVault so it can start the claim time lock for
        // the correct owner. Interface kept minimal on purpose.
        IEmergencyVault(emergencyVault).notifyDeposit(positionId, p.owner, p.asset, amountOut);

        emit RoutedToEmergency(positionId, amountOut, p.amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function positionOwner(uint256 positionId) external view returns (address) {
        return positions[positionId].owner;
    }
}

interface IEmergencyVault {
    function notifyDeposit(uint256 positionId, address owner, address asset, uint256 amount) external;
}

/// @notice The single question AegisVault asks PolicyRegistry: how much of
///         this position has its owner authorized the agent to route out,
///         and is that authorization currently switched on.
interface IPolicyAllowance {
    function exitAllowanceBps(uint256 positionId) external view returns (uint16 allowanceBps, bool active);
}
