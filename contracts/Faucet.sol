// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Faucet
/// @notice Dispenses a fixed amount of tRBTC per request with a per-address
///         cooldown. Anyone can fund it; only the owner can reconfigure or
///         withdraw. It redistributes its own balance — it does not mint coins.
contract Faucet {
    address public owner;
    uint256 public dripAmount; // wei sent per successful claim
    uint256 public cooldown;   // seconds an address must wait between claims
    mapping(address => uint256) public lastClaim;

    event Funded(address indexed from, uint256 amount);
    event Dripped(address indexed to, uint256 amount);
    event Configured(uint256 dripAmount, uint256 cooldown);

    error NotOwner();
    error CooldownActive(uint256 retryAt);
    error FaucetEmpty();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _dripAmount, uint256 _cooldown) payable {
        owner = msg.sender;
        dripAmount = _dripAmount;
        cooldown = _cooldown;
        emit Configured(_dripAmount, _cooldown);
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    /// @notice Send tRBTC to top up the faucet.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Claim one drip. Reverts if still in cooldown or faucet is empty.
    function claim() external {
        uint256 next = lastClaim[msg.sender] + cooldown;
        if (block.timestamp < next) revert CooldownActive(next);
        if (address(this).balance < dripAmount) revert FaucetEmpty();

        // Effects before interaction (reentrancy-safe).
        lastClaim[msg.sender] = block.timestamp;

        (bool ok, ) = payable(msg.sender).call{value: dripAmount}("");
        if (!ok) revert TransferFailed();
        emit Dripped(msg.sender, dripAmount);
    }

    /// @notice Owner: adjust drip size and cooldown.
    function setConfig(uint256 _dripAmount, uint256 _cooldown) external onlyOwner {
        dripAmount = _dripAmount;
        cooldown = _cooldown;
        emit Configured(_dripAmount, _cooldown);
    }

    /// @notice Owner: recover the full balance.
    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Current faucet balance in wei.
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Timestamp after which `user` may claim again.
    function nextClaimAt(address user) external view returns (uint256) {
        return lastClaim[user] + cooldown;
    }
}
