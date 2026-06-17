// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RepTrain — stake USDC on a training streak; finishers reclaim it, quitters fund them.
/// @notice You open a Pact: a goal (N sessions) and a deadline, backed by a USDC stake.
///         Each day you log one session on-chain. Hit the goal in time and you `claim()`
///         your stake back plus a bonus from the comeback pool. Miss it and anyone can
///         `forfeit()` your expired pact — your stake flows into that same pool and funds
///         the people who do finish. Built for ARC: stakes and payouts are native USDC,
///         settled instantly, and forfeits can be swept by any keeper or agent.
contract RepTrain {
    uint8 public constant NONE = 0;
    uint8 public constant ACTIVE = 1;
    uint8 public constant WON = 2;
    uint8 public constant LOST = 3;

    uint32 public constant MAX_DAYS = 366;

    struct Pact {
        uint256 stake;    // USDC staked (native, 18 decimals)
        uint64 startAt;
        uint64 deadline;
        uint32 goal;      // sessions required to win
        uint32 done;      // sessions logged this pact
        uint32 lastDay;   // last check-in day index of this pact (timestamp / 1 day)
        uint8 status;     // NONE / ACTIVE / WON / LOST
    }

    struct Stats {
        uint32 totalSessions; // lifetime sessions across all pacts
        uint32 currentStreak; // consecutive-day streak (global)
        uint32 bestStreak;
        uint32 lastDay;       // last check-in day across all pacts
        uint32 pactsWon;
        uint32 pactsLost;
        uint256 totalStaked;
        uint256 totalReturned; // stake + bonus returned over time
    }

    mapping(address => Pact) public pacts;
    mapping(address => Stats) public stats;
    mapping(address => uint32[]) private _history; // every check-in day index

    address[] private _athletes;
    mapping(address => bool) private _known;

    uint256 public comebackPool;     // forfeited stakes waiting to reward finishers
    uint256 public totalStakedAll;
    uint256 public totalReturnedAll;
    uint256 public totalForfeited;
    uint256 public sessionsLogged;
    uint256 public activePacts;

    event Started(address indexed who, uint256 stake, uint32 goal, uint64 deadline);
    event CheckedIn(address indexed who, uint32 day, uint32 done, uint32 streak);
    event Won(address indexed who, uint256 stake, uint256 bonus);
    event Lost(address indexed who, address indexed settledBy, uint256 stake);

    /// @notice Open a pact: stake USDC, commit to `goal` sessions within `durationDays`.
    function start(uint32 goal, uint32 durationDays) external payable {
        require(pacts[msg.sender].status != ACTIVE, "finish your pact first");
        require(msg.value > 0, "stake something");
        require(goal > 0 && durationDays > 0 && durationDays <= MAX_DAYS, "bad terms");
        require(goal <= durationDays, "goal exceeds days");

        uint64 dl = uint64(block.timestamp + uint256(durationDays) * 1 days);
        pacts[msg.sender] = Pact({
            stake: msg.value,
            startAt: uint64(block.timestamp),
            deadline: dl,
            goal: goal,
            done: 0,
            lastDay: 0,
            status: ACTIVE
        });

        if (!_known[msg.sender]) {
            _known[msg.sender] = true;
            _athletes.push(msg.sender);
        }
        stats[msg.sender].totalStaked += msg.value;
        totalStakedAll += msg.value;
        activePacts += 1;
        emit Started(msg.sender, msg.value, goal, dl);
    }

    /// @notice Log one training session — once per calendar day (UTC), until the deadline.
    function checkIn() external {
        Pact storage p = pacts[msg.sender];
        require(p.status == ACTIVE, "no active pact");
        require(block.timestamp <= p.deadline, "pact expired");

        Stats storage s = stats[msg.sender];
        uint32 today = uint32(block.timestamp / 1 days);
        // one session per calendar day, counted globally — so the same day can't be
        // logged twice by finishing one pact and opening another on the same day.
        require(today != s.lastDay, "already logged today");
        require(today != p.lastDay, "already logged today");
        p.lastDay = today;
        p.done += 1;

        if (s.lastDay != 0 && today == s.lastDay + 1) {
            s.currentStreak += 1;
        } else {
            s.currentStreak = 1;
        }
        s.lastDay = today;
        if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
        s.totalSessions += 1;

        _history[msg.sender].push(today);
        sessionsLogged += 1;
        emit CheckedIn(msg.sender, today, p.done, s.currentStreak);
    }

    /// @notice Claim your stake back (plus a comeback bonus) once you've hit the goal.
    ///         No deadline on claiming — a finisher can always withdraw.
    function claim() external {
        Pact storage p = pacts[msg.sender];
        require(p.status == ACTIVE, "no active pact");
        require(p.done >= p.goal, "goal not reached");

        uint256 stake = p.stake;
        uint256 bonus = stake / 2;
        if (bonus > comebackPool) bonus = comebackPool;
        uint256 payout = stake + bonus;

        // effects (checks-effects-interactions)
        p.status = WON;
        p.stake = 0;
        comebackPool -= bonus;
        stats[msg.sender].pactsWon += 1;
        stats[msg.sender].totalReturned += payout;
        totalReturnedAll += payout;
        if (activePacts > 0) activePacts -= 1;

        // interaction
        (bool ok, ) = payable(msg.sender).call{value: payout}("");
        require(ok, "payout failed");
        emit Won(msg.sender, stake, bonus);
    }

    /// @notice Settle an expired, unfinished pact — anyone (keeper/agent) can call it.
    ///         The forfeited stake funds the comeback pool. Finishers should `claim()`.
    function forfeit(address who) external {
        Pact storage p = pacts[who];
        require(p.status == ACTIVE, "no active pact");
        require(block.timestamp > p.deadline, "not expired");
        require(p.done < p.goal, "goal was reached");

        uint256 stake = p.stake;

        // effects
        p.status = LOST;
        p.stake = 0;
        comebackPool += stake;
        totalForfeited += stake;
        stats[who].pactsLost += 1;
        if (activePacts > 0) activePacts -= 1;

        emit Lost(who, msg.sender, stake);
    }

    // ── views ──────────────────────────────────────────────
    function getPact(address a) external view returns (Pact memory) {
        return pacts[a];
    }

    function getStats(address a) external view returns (Stats memory) {
        return stats[a];
    }

    function historyOf(address a) external view returns (uint32[] memory) {
        return _history[a];
    }

    function athletesCount() external view returns (uint256) {
        return _athletes.length;
    }

    function athleteAt(uint256 i) external view returns (address) {
        return _athletes[i];
    }

    function athletes() external view returns (address[] memory) {
        return _athletes;
    }
}
