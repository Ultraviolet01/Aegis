// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Minimal Chainlink AggregatorV3Interface — matches the standard
///         interface X Layer's Chainlink Data Feeds implement. Declared
///         locally to avoid pulling in the full Chainlink package for a
///         hackathon build; swap for the official import if preferred.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title RiskOracle
/// @notice Wraps one Chainlink Data Feed per supported asset. Verify the
///         real feed address for each asset on X Layer's Chainlink feed
///         directory before setting it here — do not hardcode a guessed
///         address. This contract deliberately holds no funds and has no
///         write access to AegisVault; it only answers price questions.
contract RiskOracle is Ownable {
    mapping(address => address) public priceFeeds; // asset => Chainlink AggregatorV3Interface

    /// @notice Reject a price if the feed hasn't updated within this many
    ///         seconds — guards against acting on stale data during an
    ///         oracle outage rather than silently using an old price.
    uint256 public staleAfter = 3600;

    event PriceFeedSet(address indexed asset, address indexed feed);
    event StaleAfterUpdated(uint256 oldValue, uint256 newValue);

    error NoFeedForAsset(address asset);
    error StalePrice(address asset, uint256 updatedAt, uint256 nowTs);
    error InvalidPrice(int256 answer);
    error ZeroAddress();

    constructor(address _owner) Ownable(_owner) {}

    function setPriceFeed(address asset, address feed) external onlyOwner {
        if (asset == address(0) || feed == address(0)) revert ZeroAddress();
        priceFeeds[asset] = feed;
        emit PriceFeedSet(asset, feed);
    }

    function setStaleAfter(uint256 newValue) external onlyOwner {
        emit StaleAfterUpdated(staleAfter, newValue);
        staleAfter = newValue;
    }

    /// @return price the latest price, scaled to the feed's own decimals
    /// @return decimals the feed's decimals, so callers can normalize
    function getPrice(address asset) public view returns (uint256 price, uint8 decimals) {
        address feed = priceFeeds[asset];
        if (feed == address(0)) revert NoFeedForAsset(asset);

        AggregatorV3Interface agg = AggregatorV3Interface(feed);
        (, int256 answer,, uint256 updatedAt,) = agg.latestRoundData();

        if (answer <= 0) revert InvalidPrice(answer);
        if (block.timestamp - updatedAt > staleAfter) revert StalePrice(asset, updatedAt, block.timestamp);

        return (uint256(answer), agg.decimals());
    }

    /// @notice Deviation of the current oracle price from a caller-supplied
    ///         reference price, in basis points. The reference price is
    ///         typically the position's price-at-open or a moving average
    ///         tracked off-chain by the agent — this function just does the
    ///         comparison math on-chain so it's independently checkable.
    function getDeviationBps(address asset, uint256 referencePrice) external view returns (uint256 deviationBps) {
        (uint256 currentPrice,) = getPrice(asset);
        if (referencePrice == 0) return 0;

        uint256 diff = currentPrice > referencePrice ? currentPrice - referencePrice : referencePrice - currentPrice;
        deviationBps = (diff * 10_000) / referencePrice;
    }
}
