(() => {
    const GAMES = [
        { name: "Highway Dash", emoji: "🚗", lb: "highway-dash-leaderboard" },
        { name: "Whack-a-Mole", emoji: "🐹", lb: "whack-a-mole-leaderboard" },
        { name: "Add It Up!", emoji: "➕", lb: "add-it-up-leaderboard" },
        { name: "Piano Memory", emoji: "🎹", lb: "piano-memory-leaderboard" },
        { name: "Bus Route Rush", emoji: "🚌", lb: "bus-route-rush-leaderboard" },
        { name: "Bunny Maze", emoji: "🐰", lb: "maze-game-leaderboard" },
        { name: "Color Mixing", emoji: "🎨", lb: "color-mixing-leaderboard" },
        { name: "Critter Cruise", emoji: "🚙", lb: "critter-cruise-leaderboard" },
        { name: "Airport Luggage", emoji: "✈️", lb: "airport-luggage-leaderboard" },
        { name: "Tow Truck", emoji: "🚛", lb: "tow-truck-leaderboard" },
        { name: "Cuckoo Clock", emoji: "🕰️", lb: "cuckoo-clock-leaderboard" },
        { name: "Crane Truck", emoji: "🏗️", lb: "crane-truck-leaderboard" },
        { name: "Butterfly Garden", emoji: "🦋", lb: "butterfly-garden-leaderboard" },
        { name: "Earth Day", emoji: "🌎", lb: "earth-day-leaderboard" },
        { name: "Pattern Party", emoji: "🧩", lb: "pattern-party-leaderboard" },
        { name: "Flying Bird", emoji: "🐤", lb: "flappy-bird-leaderboard" },
    ];

    function readLeaderboard(key) {
        try {
            const raw = localStorage.getItem(key);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }

    const gameStats = [];
    const playerStats = new Map(); // name -> { plays, games:Set }

    for (const g of GAMES) {
        const entries = readLeaderboard(g.lb);
        gameStats.push({ name: g.name, emoji: g.emoji, plays: entries.length });
        for (const e of entries) {
            const name = (e && typeof e.name === "string" && e.name.trim()) || "Player";
            let rec = playerStats.get(name);
            if (!rec) { rec = { plays: 0, games: new Set() }; playerStats.set(name, rec); }
            rec.plays += 1;
            rec.games.add(g.name);
        }
    }

    gameStats.sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));

    const players = Array.from(playerStats.entries()).map(([name, rec]) => ({
        name, games: rec.games.size, plays: rec.plays,
    }));
    players.sort((a, b) =>
        b.games - a.games || b.plays - a.plays || a.name.localeCompare(b.name)
    );

    const gamesBody = document.querySelector("#games-table tbody");
    const gamesEmpty = document.getElementById("games-empty");
    const playedGames = gameStats.filter((g) => g.plays > 0);
    if (playedGames.length === 0) {
        document.getElementById("games-table").hidden = true;
        gamesEmpty.hidden = false;
    } else {
        playedGames.forEach((g, i) => {
            const tr = document.createElement("tr");
            tr.innerHTML =
                `<td class="rank">${i + 1}</td>` +
                `<td class="game-cell"><span class="game-emoji">${g.emoji}</span>${g.name}</td>` +
                `<td class="num">${g.plays}</td>`;
            gamesBody.appendChild(tr);
        });
    }

    const playersBody = document.querySelector("#players-table tbody");
    const playersEmpty = document.getElementById("players-empty");
    if (players.length === 0) {
        document.getElementById("players-table").hidden = true;
        playersEmpty.hidden = false;
    } else {
        players.forEach((p, i) => {
            const tr = document.createElement("tr");
            const safe = p.name.replace(/[<>&]/g, (c) =>
                c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
            );
            tr.innerHTML =
                `<td class="rank">${i + 1}</td>` +
                `<td>${safe}</td>` +
                `<td class="num">${p.games}</td>` +
                `<td class="num">${p.plays}</td>`;
            playersBody.appendChild(tr);
        });
    }
})();
