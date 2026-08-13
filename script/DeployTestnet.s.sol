// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {EmergencyVault} from "../src/EmergencyVault.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @title DeployTestnet
/// @notice Deploys the full Aegis stack to X Layer Testnet (chain ID 1952)
///         and wires every cross-contract reference in one transaction batch,
///         so the deployment can never be left half-configured.
///
///         TESTNET ONLY. This script deploys MockERC20 stand-ins because no
///         official USDC or xStocks testnet deployment is confirmed on X
///         Layer (see PROJECT_BRIEF.md §4). MockERC20 must never reach
///         mainnet — mainnet deployment is a separate script that points at
///         the real token addresses instead.
///
///         Run:
///           forge script script/DeployTestnet.s.sol:DeployTestnet \
///             --rpc-url xlayer_testnet --broadcast --verify -vvvv
///
///         Two distinct keys are expected, per PROJECT_BRIEF.md §6:
///           DEPLOYER_PRIVATE_KEY — deploys and owns the contracts
///           AGENT_ADDRESS        — the agent role's address ONLY (its key
///                                  lives with the off-chain agent and is
///                                  never needed here)
contract DeployTestnet is Script {
    /// @dev X Layer Testnet. The old 195 is stale — see PROJECT_BRIEF.md §3.
    uint256 constant XLAYER_TESTNET_CHAIN_ID = 1952;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address deployer = vm.addr(deployerKey);

        // Guard against pointing this testnet script at the wrong network —
        // it would deploy MockERC20 wherever it lands otherwise.
        require(
            block.chainid == XLAYER_TESTNET_CHAIN_ID,
            "DeployTestnet: wrong chain - expected X Layer Testnet (1952). MockERC20 must never reach mainnet."
        );

        // The agent must be a different key from the deployer/owner: the
        // owner can rotate the agent, so one key holding both would collapse
        // that separation.
        require(agent != address(0), "DeployTestnet: AGENT_ADDRESS not set");
        require(agent != deployer, "DeployTestnet: AGENT_ADDRESS must differ from the deployer key");

        // Claim delay for the emergency time lock. 1 day matches the tests;
        // kept short here so the hackathon demo can show a full route ->
        // wait -> claim cycle without a contrived vm.warp.
        uint256 claimDelay = vm.envOr("EMERGENCY_CLAIM_DELAY", uint256(1 days));

        vm.startBroadcast(deployerKey);

        // 1. EmergencyVault — the single, immutable destination AegisVault
        //    can route to. Deployed first because the vault takes its address.
        EmergencyVault emergency = new EmergencyVault(claimDelay, deployer);

        // 2. AegisVault — emergencyVault is immutable once set here.
        AegisVault vault = new AegisVault(address(emergency), agent, deployer);

        // 3. Authorize the vault to notify the emergency vault of deposits.
        emergency.setVaultAuthorized(address(vault), true);

        // 4. PolicyRegistry — takes the vault address so it can verify
        //    position ownership before accepting a policy write.
        PolicyRegistry registry = new PolicyRegistry(address(vault));

        // 5. Point the vault back at the registry. REQUIRED: routeToEmergency
        //    reverts with PolicyRegistryNotSet until this lands, so the agent
        //    has zero authority until the wiring is complete. Fail-closed.
        vault.setPolicyRegistry(address(registry));

        // 6. RiskOracle — deployed unconfigured on purpose. Chainlink feed
        //    addresses for X Layer must be confirmed against Chainlink's
        //    official feed directory and set afterwards via setPriceFeed;
        //    guessing a feed address would be worse than leaving it unset,
        //    since getPrice reverts cleanly with NoFeedForAsset until then.
        RiskOracle oracle = new RiskOracle(deployer);

        // 7. Testnet-only mock assets, standing in for GLDX and SPYX (the
        //    MVP asset picks) plus a USDC stand-in for the exit leg.
        MockERC20 mockUsdc = new MockERC20("Aegis Test USDC", "tUSDC", 6);
        MockERC20 mockGldx = new MockERC20("Aegis Test Gold xStock", "tGLDX", 18);
        MockERC20 mockSpyx = new MockERC20("Aegis Test SP500 xStock", "tSPYX", 18);

        vault.setAssetSupported(address(mockUsdc), true);
        vault.setAssetSupported(address(mockGldx), true);
        vault.setAssetSupported(address(mockSpyx), true);

        vm.stopBroadcast();

        _logDeployment(deployer, agent, claimDelay, address(emergency), address(vault), address(registry),
            address(oracle), address(mockUsdc), address(mockGldx), address(mockSpyx));
    }

    /// @dev Split out to keep run() under the stack-depth limit.
    function _logDeployment(
        address deployer,
        address agent,
        uint256 claimDelay,
        address emergency,
        address vault,
        address registry,
        address oracle,
        address mockUsdc,
        address mockGldx,
        address mockSpyx
    ) internal pure {
        console2.log("=== Aegis deployed to X Layer Testnet (chain 1952) ===");
        console2.log("owner/deployer   ", deployer);
        console2.log("agent role       ", agent);
        console2.log("claim delay (s)  ", claimDelay);
        console2.log("");
        console2.log("EmergencyVault   ", emergency);
        console2.log("AegisVault       ", vault);
        console2.log("PolicyRegistry   ", registry);
        console2.log("RiskOracle       ", oracle);
        console2.log("");
        console2.log("--- testnet mocks (NEVER deploy these to mainnet) ---");
        console2.log("tUSDC            ", mockUsdc);
        console2.log("tGLDX            ", mockGldx);
        console2.log("tSPYX            ", mockSpyx);
        console2.log("");
        console2.log("NEXT: set Chainlink feeds on RiskOracle once the X Layer");
        console2.log("feed addresses are confirmed. Until then getPrice reverts");
        console2.log("with NoFeedForAsset, and the agent cannot route without");
        console2.log("a per-position policy set by that position's owner.");
    }
}
