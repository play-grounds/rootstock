// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DailyFaucet
/// @notice Dispenses tRBTC with a global per-day cap on the number of distinct
///         addresses served, plus one claim per address per day.
///
/// @dev "Per day" uses UTC-day buckets (block.timestamp / 1 days), resetting at
///      00:00 UTC. NOTE: address-based limits are sybil-weak — one actor with N
///      fresh addresses can exhaust the daily quota (abuse *and* griefing). For
///      robust rate-limiting, gate claims on a verified identity (e.g. a nostr
///      pubkey / WebID via a relayer) rather than msg.sender.
contract DailyFaucet {
    address public owner;
    uint256 public dripAmount;  // wei per successful claim
    uint256 public dailyLimit;  // max distinct addresses served per UTC day

    uint256 public currentDay;  // UTC day index of the active window
    uint256 public claimsToday; // claims served in the active window
    mapping(address => uint256) public lastClaimDay; // last UTC day an address claimed

    event Dripped(address indexed to, uint256 amount, uint256 day);
    event Funded(address indexed from, uint256 amount);
    event Configured(uint256 dripAmount, uint256 dailyLimit);

    error NotOwner();
    error AlreadyClaimedToday();
    error DailyLimitReached();
    error FaucetEmpty();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _dripAmount, uint256 _dailyLimit) payable {
        owner = msg.sender;
        dripAmount = _dripAmount;
        dailyLimit = _dailyLimit;
        currentDay = block.timestamp / 1 days;
        emit Configured(_dripAmount, _dailyLimit);
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    /// @notice Top up the faucet.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Claim one drip. One per address per UTC day, and only while the
    ///         global daily address cap has not been reached.
    function claim() external {
        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            claimsToday = 0;
        }
        if (lastClaimDay[msg.sender] == today) revert AlreadyClaimedToday();
        if (claimsToday >= dailyLimit) revert DailyLimitReached();
        if (address(this).balance < dripAmount) revert FaucetEmpty();

        // Effects before interaction.
        lastClaimDay[msg.sender] = today;
        claimsToday += 1;

        (bool ok, ) = payable(msg.sender).call{value: dripAmount}("");
        if (!ok) revert TransferFailed();
        emit Dripped(msg.sender, dripAmount, today);
    }

    /// @notice Owner: adjust drip size and the per-day address cap.
    function setConfig(uint256 _dripAmount, uint256 _dailyLimit) external onlyOwner {
        dripAmount = _dripAmount;
        dailyLimit = _dailyLimit;
        emit Configured(_dripAmount, _dailyLimit);
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

    /// @notice How many address-slots remain for the current UTC day (view-safe
    ///         across a day rollover).
    function remainingToday() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 used = today == currentDay ? claimsToday : 0;
        return used >= dailyLimit ? 0 : dailyLimit - used;
    }

    /// @notice Whether `user` has already claimed in the current UTC day.
    function claimedToday(address user) external view returns (bool) {
        return lastClaimDay[user] == block.timestamp / 1 days;
    }
}
