// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PolicyRegistry
/// @notice Stores the structured, on-chain parameters that the off-chain
///         agent's plain-English parser produces. The frontend shows the
///         user this exact struct as a confirmation preview before they
///         sign the transaction that sets it — so what the LLM parsed is
///         always human-checked before it becomes enforceable.
///
///         This contract only stores and authorizes policy changes; it does
///         not itself move funds. The off-chain agent reads a position's
///         policy to decide WHETHER to act — but `exitPercentBps` is not
///         merely advisory: AegisVault.routeToEmergency reads it back from
///         this registry via `exitAllowanceBps` and reverts if the agent
///         requests more than the owner approved. So the exit ceiling is
///         enforced on-chain, and a compromised agent key cannot exceed it.
///         Only the position owner can write here; the agent has no write
///         access at all and therefore cannot raise its own ceiling.
interface IPositionOwnerLookup {
    function positionOwner(uint256 positionId) external view returns (address);
}

contract PolicyRegistry {
    enum Mode {
        Conservative,
        Balanced,
        Aggressive
    }

    struct Policy {
        uint16 drawdownThresholdBps; // e.g. 800 = 8% drawdown over the agent's lookback window
        uint16 oracleDeviationThresholdBps; // e.g. 200 = 2% deviation from reference price
        uint16 exitPercentBps; // e.g. 5000 = exit 50% of the position when triggered
        Mode mode;
        bool active;
        uint256 updatedAt;
    }

    /// @notice The AegisVault this registry's positions belong to. Used only
    ///         to verify that whoever is setting a policy actually owns the
    ///         position in that vault — never to move funds.
    address public immutable vault;

    mapping(uint256 => Policy) public policies;

    event PolicySet(
        uint256 indexed positionId,
        uint16 drawdownThresholdBps,
        uint16 oracleDeviationThresholdBps,
        uint16 exitPercentBps,
        Mode mode
    );
    event PolicyDeactivated(uint256 indexed positionId);

    error NotPositionOwner(uint256 positionId, address caller);
    error InvalidBps(uint16 value);
    error ZeroAddress();

    constructor(address _vault) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
    }

    modifier onlyPositionOwner(uint256 positionId) {
        if (IPositionOwnerLookup(vault).positionOwner(positionId) != msg.sender) {
            revert NotPositionOwner(positionId, msg.sender);
        }
        _;
    }

    /// @notice Set or update the policy for a position. Only the position's
    ///         owner (as recorded in AegisVault) can call this — the agent
    ///         has no write access to this contract at all.
    function setPolicy(
        uint256 positionId,
        uint16 drawdownThresholdBps,
        uint16 oracleDeviationThresholdBps,
        uint16 exitPercentBps,
        Mode mode
    ) external onlyPositionOwner(positionId) {
        if (drawdownThresholdBps == 0 || drawdownThresholdBps > 10_000) revert InvalidBps(drawdownThresholdBps);
        if (oracleDeviationThresholdBps == 0 || oracleDeviationThresholdBps > 10_000) {
            revert InvalidBps(oracleDeviationThresholdBps);
        }
        if (exitPercentBps == 0 || exitPercentBps > 10_000) revert InvalidBps(exitPercentBps);

        policies[positionId] = Policy({
            drawdownThresholdBps: drawdownThresholdBps,
            oracleDeviationThresholdBps: oracleDeviationThresholdBps,
            exitPercentBps: exitPercentBps,
            mode: mode,
            active: true,
            updatedAt: block.timestamp
        });

        emit PolicySet(positionId, drawdownThresholdBps, oracleDeviationThresholdBps, exitPercentBps, mode);
    }

    function deactivatePolicy(uint256 positionId) external onlyPositionOwner(positionId) {
        policies[positionId].active = false;
        emit PolicyDeactivated(positionId);
    }

    function getPolicy(uint256 positionId) external view returns (Policy memory) {
        return policies[positionId];
    }

    /// @notice Minimal accessor AegisVault uses to enforce the owner-approved
    ///         exit ceiling on-chain. Deliberately narrow — returning just the
    ///         allowance and the active flag means AegisVault never has to
    ///         mirror this contract's full Policy struct, so adding fields
    ///         here can't silently break the vault's ABI assumptions.
    /// @return allowanceBps the maximum share of a position, in basis points,
    ///         the owner has authorized the agent to route out in one call
    /// @return active whether the owner currently has this policy switched on
    function exitAllowanceBps(uint256 positionId) external view returns (uint16 allowanceBps, bool active) {
        Policy storage pol = policies[positionId];
        return (pol.exitPercentBps, pol.active);
    }

}
