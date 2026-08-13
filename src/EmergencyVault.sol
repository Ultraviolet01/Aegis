// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title EmergencyVault
/// @notice Receives funds routed out of an AegisVault position. Funds sit
///         here under a time lock before the ORIGINAL position owner (never
///         anyone else) can claim them. This is the second half of Aegis's
///         non-custodial guarantee: even when the agent moves funds, they
///         land somewhere only the user can ultimately withdraw from, on a
///         delay the user can see coming.
contract EmergencyVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Claim {
        address owner;
        address asset;
        uint256 amount;
        uint256 claimableAt;
        bool claimed;
    }

    /// @notice The only AegisVault(s) allowed to deposit here. Allowlisted
    ///         by the contract owner so an unrelated/malicious contract
    ///         can't push funds in and mint bogus claims.
    mapping(address => bool) public authorizedVaults;

    /// @notice Delay between a routeToEmergency() call and when the owner
    ///         can claim. Gives the user a visible window to notice and
    ///         intervene (e.g. contact support, or just watch it happen)
    ///         before funds are fully back in their hands.
    uint256 public claimDelay;

    /// @notice positionId => list of claims (a position can be routed to
    ///         multiple times over its life, e.g. repeated partial exits).
    mapping(uint256 => Claim[]) public claimsByPosition;

    event VaultAuthorized(address indexed vault, bool authorized);
    event ClaimDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event DepositNotified(uint256 indexed positionId, address indexed owner, address asset, uint256 amount, uint256 claimableAt);
    event Claimed(uint256 indexed positionId, uint256 indexed claimIndex, address indexed owner, uint256 amount);

    error NotAuthorizedVault(address caller);
    error NotClaimOwner(address caller, address owner);
    error ClaimNotYetAvailable(uint256 claimableAt, uint256 nowTs);
    error AlreadyClaimed(uint256 positionId, uint256 claimIndex);
    error ZeroAddress();

    constructor(uint256 _claimDelay, address _owner) Ownable(_owner) {
        claimDelay = _claimDelay;
    }

    modifier onlyAuthorizedVault() {
        if (!authorizedVaults[msg.sender]) revert NotAuthorizedVault(msg.sender);
        _;
    }

    function setVaultAuthorized(address vault, bool authorized) external onlyOwner {
        if (vault == address(0)) revert ZeroAddress();
        authorizedVaults[vault] = authorized;
        emit VaultAuthorized(vault, authorized);
    }

    function setClaimDelay(uint256 newDelay) external onlyOwner {
        emit ClaimDelayUpdated(claimDelay, newDelay);
        claimDelay = newDelay;
    }

    /// @notice Called by an authorized AegisVault immediately after it has
    ///         transferred `amount` of `asset` to this contract. Records
    ///         who is allowed to claim it and when.
    function notifyDeposit(uint256 positionId, address owner, address asset, uint256 amount) external onlyAuthorizedVault {
        uint256 claimableAt = block.timestamp + claimDelay;
        claimsByPosition[positionId].push(
            Claim({owner: owner, asset: asset, amount: amount, claimableAt: claimableAt, claimed: false})
        );
        emit DepositNotified(positionId, owner, asset, amount, claimableAt);
    }

    /// @notice Claim a specific routed batch once its time lock has passed.
    ///         Only the original position owner can ever call this
    ///         successfully for their own claims.
    function claim(uint256 positionId, uint256 claimIndex) external nonReentrant {
        Claim storage c = claimsByPosition[positionId][claimIndex];
        if (c.owner != msg.sender) revert NotClaimOwner(msg.sender, c.owner);
        if (c.claimed) revert AlreadyClaimed(positionId, claimIndex);
        if (block.timestamp < c.claimableAt) revert ClaimNotYetAvailable(c.claimableAt, block.timestamp);

        c.claimed = true;
        IERC20(c.asset).safeTransfer(c.owner, c.amount);
        emit Claimed(positionId, claimIndex, c.owner, c.amount);
    }

    function claimCount(uint256 positionId) external view returns (uint256) {
        return claimsByPosition[positionId].length;
    }
}
