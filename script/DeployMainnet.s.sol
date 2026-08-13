// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {EmergencyVault} from "../src/EmergencyVault.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {RiskOracle} from "../src/RiskOracle.sol";

/// @title DeployMainnet
/// @notice Deploys the full Aegis stack to X Layer Mainnet (chain ID 196)
///         and wires every cross-contract reference in one transaction batch,
///         so the deployment can never be left half-configured.
///
///         MAINNET ONLY. Uses real token addresses, zero MockERC20 tokens.
///
///         Run:
///           C:\Users\USER\.foundry\bin\forge.exe script script/DeployMainnet.s.sol:DeployMainnet \
///             --rpc-url xlayer_mainnet --broadcast -vvvv
///
///         Two distinct keys are expected:
///           DEPLOYER_PRIVATE_KEY — deploys and owns the contracts
///           AGENT_ADDRESS        — the agent role's address ONLY
contract DeployMainnet is Script {
    /// @dev X Layer Mainnet chain ID.
    uint256 constant XLAYER_MAINNET_CHAIN_ID = 196;

    // Real mainnet token addresses (checksummed)
    address constant MAINNET_GLDX = 0x2380F2673C640fB67E2d6B55B44C62F0E0e69DA9;
    address constant MAINNET_SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;
    address constant MAINNET_USDC = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address deployer = vm.addr(deployerKey);

        // Guard against running this script on any chain other than X Layer Mainnet (196).
        require(
            block.chainid == XLAYER_MAINNET_CHAIN_ID,
            "DeployMainnet: wrong chain - expected X Layer Mainnet (196)."
        );

        // The agent must be a different key from the deployer/owner.
        require(agent != address(0), "DeployMainnet: AGENT_ADDRESS not set");
        require(agent != deployer, "DeployMainnet: AGENT_ADDRESS must differ from the deployer key");

        uint256 claimDelay = vm.envOr("EMERGENCY_CLAIM_DELAY", uint256(1 days));

        vm.startBroadcast(deployerKey);

        // 1. EmergencyVault — immutable destination for AegisVault
        EmergencyVault emergency = new EmergencyVault(claimDelay, deployer);

        // 2. AegisVault — takes emergency vault address, agent, and owner
        AegisVault vault = new AegisVault(address(emergency), agent, deployer);

        // 3. Authorize vault on EmergencyVault
        emergency.setVaultAuthorized(address(vault), true);

        // 4. PolicyRegistry — takes vault address
        PolicyRegistry registry = new PolicyRegistry(address(vault));

        // 5. Point vault at PolicyRegistry
        vault.setPolicyRegistry(address(registry));

        // 6. RiskOracle
        RiskOracle oracle = new RiskOracle(deployer);

        // 7. Wire real mainnet assets (No MockERC20 ever!)
        vault.setAssetSupported(MAINNET_GLDX, true);
        vault.setAssetSupported(MAINNET_SPYX, true);
        vault.setAssetSupported(MAINNET_USDC, true);

        vm.stopBroadcast();

        _logDeployment(deployer, agent, claimDelay, address(emergency), address(vault), address(registry), address(oracle));
    }

    function _logDeployment(
        address deployer,
        address agent,
        uint256 claimDelay,
        address emergency,
        address vault,
        address registry,
        address oracle
    ) internal pure {
        console2.log("=== Aegis deployed to X Layer Mainnet (chain 196) ===");
        console2.log("owner/deployer   ", deployer);
        console2.log("agent role       ", agent);
        console2.log("claim delay (s)  ", claimDelay);
        console2.log("");
        console2.log("EmergencyVault   ", emergency);
        console2.log("AegisVault       ", vault);
        console2.log("PolicyRegistry   ", registry);
        console2.log("RiskOracle       ", oracle);
        console2.log("");
        console2.log("Supported Mainnet Assets:");
        console2.log("GLDX             ", MAINNET_GLDX);
        console2.log("SPYX             ", MAINNET_SPYX);
        console2.log("USDC             ", MAINNET_USDC);
    }
}
