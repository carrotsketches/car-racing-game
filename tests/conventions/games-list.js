// Single source of truth for which folders are "games" (have game.js + index.html
// and follow the conventions in CLAUDE.md). Update this list when you add a game.
//
// `hasLeaderboard: false` opts out of leaderboard checks. `hidden: true` opts out
// of "must be linked from index.html" checks.

const games = [
    { slug: "highway-dash",          lbKey: "highway-dash-leaderboard",       hasLeaderboard: true  },
    { slug: "whack-a-mole",          lbKey: "whack-a-mole-leaderboard",       hasLeaderboard: true  },
    { slug: "add-it-up",             lbKey: "add-it-up-leaderboard",          hasLeaderboard: true  },
    { slug: "piano",                 lbKey: "piano-memory-leaderboard",       hasLeaderboard: true  },
    { slug: "bus-route-rush",        lbKey: "bus-route-rush-leaderboard",     hasLeaderboard: true  },
    { slug: "clock-it",                                                        hasLeaderboard: false },
    { slug: "color-mixing",          lbKey: "color-mixing-leaderboard",       hasLeaderboard: true  },
    { slug: "critter-cruise",        lbKey: "critter-cruise-leaderboard",     hasLeaderboard: true  },
    { slug: "airport-luggage-game",  lbKey: "airport-luggage-leaderboard",    hasLeaderboard: true  },
    { slug: "maze-game",             lbKey: "maze-game-leaderboard",          hasLeaderboard: true  },
    { slug: "crane-truck",           lbKey: "crane-truck-leaderboard",        hasLeaderboard: true  },
    { slug: "tow-truck",             lbKey: "tow-truck-leaderboard",          hasLeaderboard: true  },
    { slug: "butterfly-garden",      lbKey: "butterfly-garden-leaderboard",   hasLeaderboard: true  },
    { slug: "earth-day",             lbKey: "earth-day-leaderboard",          hasLeaderboard: true  },
    { slug: "cuckoo-clock",          lbKey: "cuckoo-clock-leaderboard",       hasLeaderboard: true  },
    { slug: "unicorn-storyteller",                                             hasLeaderboard: false },
    { slug: "hotair-balloon",        lbKey: "hotair-balloon-leaderboard",     hasLeaderboard: true,  hidden: true },
    { slug: "pattern-party",         lbKey: "pattern-party-leaderboard",      hasLeaderboard: true  },
    { slug: "seahorse-game",         lbKey: "seahorse-game-leaderboard",      hasLeaderboard: true  },
    { slug: "excavator-game",        lbKey: "excavator-game-leaderboard",     hasLeaderboard: true  },
    { slug: "flappy-bird",           lbKey: "flappy-bird-leaderboard",        hasLeaderboard: true,  hardOnly: true },
];

module.exports = { games };
