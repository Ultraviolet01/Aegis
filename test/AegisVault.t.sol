// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {EmergencyVault} from "../src/EmergencyVault.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract AegisVaultTest is Test {
    AegisVault vault;
    EmergencyVault emergency;
    PolicyRegistry registry;
    MockERC20 usdc;

    address owner = makeAddr("owner"); // contract owner / project multisig
    address agent = makeAddr("agent"); // Aegis off-chain agent's signer
    address user = makeAddr("user"); // position owner
    address attacker = makeAddr("attacker");

    uint256 constant DEPOSIT = 1_000e6;

    // Representative non-exit policy fields; only exitPercentBps is enforced
    // on-chain, the other two are consumed by the off-chain risk loop.
    uint16 constant DRAWDOWN_BPS = 800; // 8%
    uint16 constant DEVIATION_BPS = 200; // 2%

    function setUp() public {
        vm.startPrank(owner);
        emergency = new EmergencyVault(1 days, owner);
        vault = new AegisVault(address(emergency), agent, owner);
        emergency.setVaultAuthorized(address(vault), true);

        // PolicyRegistry takes the vault address, so the vault can only be
        // pointed back at it after both exist — mirrors the deploy script.
        registry = new PolicyRegistry(address(vault));
        vault.setPolicyRegistry(address(registry));

        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vault.setAssetSupported(address(usdc), true);
        vm.stopPrank();

        usdc.mint(user, 10_000e6);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
    }

    /// @dev Opens a position and has its OWNER approve an exit ceiling of
    ///      `exitPercentBps`. The policy must be set after the position
    ///      exists, since PolicyRegistry authorizes writes by looking the
    ///      position's owner up in the vault.
    function _openPositionWithPolicy(uint16 exitPercentBps) internal returns (uint256 positionId) {
        vm.startPrank(user);
        positionId = vault.openPosition(address(usdc), DEPOSIT);
        registry.setPolicy(positionId, DRAWDOWN_BPS, DEVIATION_BPS, exitPercentBps, PolicyRegistry.Mode.Balanced);
        vm.stopPrank();
    }

    // =====================================================================
    // Invariant 1 — destination: funds can only ever reach the EmergencyVault
    // =====================================================================

    /// @notice Core invariant: no matter what exitBps the agent tries, and
    ///         no matter what the agent's calldata contains, funds routed
    ///         out of a position can only ever land at `emergencyVault`.
    ///         There is no function on AegisVault that accepts an arbitrary
    ///         recipient for agent-triggered movements — this test fuzzes
    ///         the one parameter the agent does control (exitBps) and
    ///         asserts the destination balance change always matches
    ///         emergencyVault's balance, never the attacker's.
    ///
    ///         The policy ceiling is set to 100% here so every fuzzed value
    ///         is permitted — this test is about WHERE funds can go, not how
    ///         much. The HOW MUCH limit is covered by the two tests below.
    function testFuzz_AgentCannotDrainToArbitraryAddress(uint16 exitBps) public {
        exitBps = uint16(bound(exitBps, 1, 10_000));

        uint256 positionId = _openPositionWithPolicy(10_000);

        uint256 attackerBalanceBefore = usdc.balanceOf(attacker);
        uint256 emergencyBalanceBefore = usdc.balanceOf(address(emergency));

        vm.prank(agent);
        vault.routeToEmergency(positionId, exitBps);

        // Attacker's balance must be untouched under every fuzzed input.
        assertEq(usdc.balanceOf(attacker), attackerBalanceBefore, "attacker must never receive funds");

        // The emergency vault must have received exactly what left the position.
        (, address asset, uint256 remaining,,) = vault.positions(positionId);
        assertEq(asset, address(usdc));
        // Widen exitBps to uint256 explicitly: multiplying the literal directly
        // against the raw uint16 would compute the product in a type too small
        // for it and panic with arithmetic overflow (0x11) before any assert.
        uint256 expectedOut = (DEPOSIT * uint256(exitBps)) / 10_000;
        assertEq(
            usdc.balanceOf(address(emergency)) - emergencyBalanceBefore,
            expectedOut,
            "emergency vault must receive the routed amount"
        );
        assertEq(remaining, DEPOSIT - expectedOut, "position balance must decrease by exactly the routed amount");
    }

    // =====================================================================
    // Invariant 2 — size: the agent can never exceed the owner's approved %
    // =====================================================================

    /// @notice Every request ABOVE the owner-approved ceiling must revert,
    ///         and must move no funds whatsoever. Fuzzes the full band of
    ///         over-limit values that are still structurally valid bps, so a
    ///         failure here can't be confused with the 0/>100% guard.
    function testFuzz_AgentCannotExceedOwnerApprovedExitLimit(uint16 limitBps, uint16 requestedBps) public {
        // Leave headroom so an strictly-greater request always exists.
        limitBps = uint16(bound(limitBps, 1, 9_999));
        requestedBps = uint16(bound(requestedBps, uint256(limitBps) + 1, 10_000));

        uint256 positionId = _openPositionWithPolicy(limitBps);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AegisVault.ExitBpsExceedsPolicy.selector, positionId, requestedBps, limitBps)
        );
        vault.routeToEmergency(positionId, requestedBps);

        // Nothing may move on a rejected call.
        assertEq(usdc.balanceOf(address(emergency)), 0, "no funds may move when over the approved limit");
        (,, uint256 remaining,,) = vault.positions(positionId);
        assertEq(remaining, DEPOSIT, "position must be untouched when over the approved limit");
    }

    /// @notice Every request AT or BELOW the approved ceiling must still
    ///         succeed exactly as before the clamp was introduced — the
    ///         guard must not break the legitimate path.
    function testFuzz_AgentCanExitAtOrBelowApprovedLimit(uint16 limitBps, uint16 requestedBps) public {
        limitBps = uint16(bound(limitBps, 1, 10_000));
        requestedBps = uint16(bound(requestedBps, 1, limitBps));

        uint256 positionId = _openPositionWithPolicy(limitBps);

        vm.prank(agent);
        vault.routeToEmergency(positionId, requestedBps);

        uint256 expectedOut = (DEPOSIT * uint256(requestedBps)) / 10_000;
        assertEq(usdc.balanceOf(address(emergency)), expectedOut, "at-or-below-limit exits must still succeed");
        (,, uint256 remaining,,) = vault.positions(positionId);
        assertEq(remaining, DEPOSIT - expectedOut, "position must decrease by exactly the routed amount");
    }

    /// @notice Boundary: exactly at the limit is allowed, one bp over is not.
    function test_ExitAtExactLimitAllowedOneBpOverRejected() public {
        uint256 positionId = _openPositionWithPolicy(5_000);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AegisVault.ExitBpsExceedsPolicy.selector, positionId, 5_001, 5_000));
        vault.routeToEmergency(positionId, 5_001);

        vm.prank(agent);
        vault.routeToEmergency(positionId, 5_000);
        assertEq(usdc.balanceOf(address(emergency)), DEPOSIT / 2, "exactly-at-limit must be allowed");
    }

    // =====================================================================
    // Fail-closed behaviour: no policy == no authority
    // =====================================================================

    /// @notice A position with no policy grants the agent ZERO authority.
    ///         Documented behaviour: revert, never "unlimited by default".
    function test_RouteRevertsWhenPositionHasNoPolicy() public {
        vm.prank(user);
        uint256 positionId = vault.openPosition(address(usdc), DEPOSIT);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AegisVault.NoActivePolicy.selector, positionId));
        vault.routeToEmergency(positionId, 1);

        assertEq(usdc.balanceOf(address(emergency)), 0, "no policy must mean no movement");
    }

    /// @notice Deactivating a policy revokes the agent's authority immediately.
    function test_RouteRevertsAfterOwnerDeactivatesPolicy() public {
        uint256 positionId = _openPositionWithPolicy(5_000);

        vm.prank(user);
        registry.deactivatePolicy(positionId);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AegisVault.NoActivePolicy.selector, positionId));
        vault.routeToEmergency(positionId, 1);

        assertEq(usdc.balanceOf(address(emergency)), 0, "deactivated policy must revoke agent authority");
    }

    /// @notice Before the registry is wired, the ceiling can't be checked, so
    ///         routing is refused rather than proceeding unchecked.
    function test_RouteRevertsWhenPolicyRegistryNotSet() public {
        vm.startPrank(owner);
        AegisVault freshVault = new AegisVault(address(emergency), agent, owner);
        emergency.setVaultAuthorized(address(freshVault), true);
        freshVault.setAssetSupported(address(usdc), true);
        vm.stopPrank();

        vm.startPrank(user);
        usdc.approve(address(freshVault), type(uint256).max);
        uint256 positionId = freshVault.openPosition(address(usdc), DEPOSIT);
        vm.stopPrank();

        vm.prank(agent);
        vm.expectRevert(AegisVault.PolicyRegistryNotSet.selector);
        freshVault.routeToEmergency(positionId, 1);
    }

    /// @notice The agent must not be able to repoint the vault at a registry
    ///         that would grant it a larger allowance than users approved.
    function test_AgentCannotSetPolicyRegistry() public {
        PolicyRegistry rogue = new PolicyRegistry(address(vault));

        vm.prank(agent);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        vault.setPolicyRegistry(address(rogue));

        assertEq(vault.policyRegistry(), address(registry), "registry must remain owner-controlled");
    }

    // =====================================================================
    // Pre-existing guarantees — must stay green
    // =====================================================================

    function test_NonAgentCannotRouteToEmergency() public {
        uint256 positionId = _openPositionWithPolicy(10_000);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AegisVault.NotAgent.selector, attacker));
        vault.routeToEmergency(positionId, 5000);
    }

    function test_OwnerCanAlwaysWithdrawEvenAfterAgentRoute() public {
        uint256 positionId = _openPositionWithPolicy(10_000);

        vm.prank(agent);
        vault.routeToEmergency(positionId, 5000); // exits 50%

        // Remaining 500e6 is still freely withdrawable by the owner.
        vm.prank(user);
        vault.withdraw(positionId, 500e6);
        assertEq(usdc.balanceOf(user), 10_000e6 - DEPOSIT + 500e6);
    }

    function test_OnlyOriginalOwnerCanClaimFromEmergencyVault() public {
        uint256 positionId = _openPositionWithPolicy(10_000);

        vm.prank(agent);
        vault.routeToEmergency(positionId, 5000);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(attacker);
        vm.expectRevert(); // NotClaimOwner
        emergency.claim(positionId, 0);

        vm.prank(user);
        emergency.claim(positionId, 0);
        assertEq(usdc.balanceOf(user), 10_000e6 - 500e6);
    }

    function test_ClaimRevertsBeforeTimeLockElapses() public {
        uint256 positionId = _openPositionWithPolicy(10_000);

        vm.prank(agent);
        vault.routeToEmergency(positionId, 5000);

        vm.prank(user);
        vm.expectRevert(); // ClaimNotYetAvailable
        emergency.claim(positionId, 0);
    }

    function test_PausedPositionBlocksAgentButNotOwnerWithdraw() public {
        uint256 positionId = _openPositionWithPolicy(10_000);

        vm.prank(agent);
        vault.pausePosition(positionId);

        vm.prank(agent);
        vm.expectRevert(); // PositionDoesNotExist reused as "frozen"
        vault.routeToEmergency(positionId, 5000);

        // Owner can still withdraw freely — pause never locks the owner out.
        vm.prank(user);
        vault.withdraw(positionId, DEPOSIT);
        assertEq(usdc.balanceOf(user), 10_000e6);
    }

    /// @notice Only the position owner may write a policy — the agent has no
    ///         write access to the registry at all, so it cannot raise its
    ///         own ceiling.
    function test_AgentCannotWriteItsOwnPolicy() public {
        vm.prank(user);
        uint256 positionId = vault.openPosition(address(usdc), DEPOSIT);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistry.NotPositionOwner.selector, positionId, agent));
        registry.setPolicy(positionId, DRAWDOWN_BPS, DEVIATION_BPS, 10_000, PolicyRegistry.Mode.Aggressive);
    }
}
