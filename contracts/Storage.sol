// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Storage
/// @notice Minimal contract to verify the Rootstock testnet deploy/call loop.
contract Storage {
    uint256 private value;

    event ValueChanged(address indexed by, uint256 newValue);

    /// @notice Store a number on-chain.
    function set(uint256 newValue) external {
        value = newValue;
        emit ValueChanged(msg.sender, newValue);
    }

    /// @notice Read the stored number.
    function get() external view returns (uint256) {
        return value;
    }
}
