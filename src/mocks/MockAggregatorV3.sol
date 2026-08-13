// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockAggregatorV3
/// @notice TESTNET-ONLY stand-in for a Chainlink Data Feed, implementing the
///         same `AggregatorV3Interface` shape `RiskOracle` already consumes
///         (`decimals()` + `latestRoundData()`).
///
///         WHY THIS EXISTS: no confirmed Chainlink feed address is available
///         for the mock assets on X Layer Testnet, and guessing one would be
///         worse than not having it. Driving price manually is also the only
///         way to script a drawdown on demand — a real feed cannot be made to
///         fall 12% because a demo needs it to.
///
///         MUST NEVER BE DEPLOYED TO MAINNET. On mainnet, `RiskOracle` points
///         at real Chainlink feeds. Anyone who can call `setPrice` here can
///         dictate what the risk engine believes, which is precisely the
///         authority a real oracle exists to remove.
///
///         See CONTRACTS_STATUS.md: X Layer may expose Chainlink via a
///         FeedRegistry (base/quote pair lookup) rather than per-asset proxy
///         addresses. That must be confirmed before mainnet, and may require
///         an adapter in RiskOracle. This mock deliberately models the
///         per-asset shape RiskOracle currently expects, so it proves the
///         risk pipeline — not the mainnet feed topology.
contract MockAggregatorV3 {
    uint8 private immutable _decimals;

    int256 private _answer;
    uint80 private _roundId;
    uint256 private _updatedAt;

    /// @notice A human label so a deployed mock is identifiable on the
    ///         explorer and never mistaken for a real feed.
    string public description;

    event AnswerUpdated(int256 previousAnswer, int256 newAnswer, uint80 roundId, uint256 updatedAt);
    event UpdatedAtForced(uint256 previousUpdatedAt, uint256 newUpdatedAt);

    error InvalidInitialAnswer(int256 answer);

    constructor(uint8 decimals_, int256 initialAnswer, string memory description_) {
        // RiskOracle rejects answer <= 0, so a mock that starts at zero would
        // be dead on arrival and look like a wiring bug instead of bad input.
        if (initialAnswer <= 0) revert InvalidInitialAnswer(initialAnswer);

        _decimals = decimals_;
        _answer = initialAnswer;
        _roundId = 1;
        _updatedAt = block.timestamp;
        description = description_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /// @dev Matches Chainlink's return shape exactly. `startedAt` and
    ///      `answeredInRound` track `updatedAt`/`roundId` because RiskOracle
    ///      reads neither — inventing unrelated values would be noise.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    /// @notice Drive the price. Advances the round and refreshes `updatedAt`
    ///         to now, so the new answer reads as fresh to RiskOracle's
    ///         staleness check.
    /// @dev Intentionally unpermissioned: this is a testnet fixture, and
    ///      adding access control would imply a trust property it does not
    ///      have. That is exactly why it must not reach mainnet.
    function setPrice(int256 newAnswer) external {
        int256 previous = _answer;
        _answer = newAnswer;
        _roundId += 1;
        _updatedAt = block.timestamp;
        emit AnswerUpdated(previous, newAnswer, _roundId, _updatedAt);
    }

    /// @notice Force `updatedAt` backwards to prove RiskOracle's staleness
    ///         guard fires (`StalePrice`) rather than serving an old price.
    function setUpdatedAt(uint256 newUpdatedAt) external {
        emit UpdatedAtForced(_updatedAt, newUpdatedAt);
        _updatedAt = newUpdatedAt;
    }

    /// @notice Convenience for the negative-path demo: make the current
    ///         answer appear `secondsAgo` old.
    function makeStale(uint256 secondsAgo) external {
        uint256 target = block.timestamp > secondsAgo ? block.timestamp - secondsAgo : 0;
        emit UpdatedAtForced(_updatedAt, target);
        _updatedAt = target;
    }
}
