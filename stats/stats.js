(() => {
    const KEY = "games-plays-v1";
    const GAMES = [
        { slug: "highway-dash", name: "Highway Dash", emoji: "🚗" },
        { slug: "whack-a-mole", name: "Whack-a-Mole", emoji: "🐹" },
        { slug: "add-it-up", name: "Add It Up!", emoji: "➕" },
        { slug: "piano", name: "Piano Memory", emoji: "🎹" },
        { slug: "bus-route-rush", name: "Bus Route Rush", emoji: "🚌" },
        { slug: "clock-it", name: "Clock It!", emoji: "⏰" },
        { slug: "maze-game", name: "Bunny Maze", emoji: "🐰" },
        { slug: "color-mixing", name: "Color Mixing", emoji: "🎨" },
        { slug: "critter-cruise", name: "Critter Cruise", emoji: "🚙" },
        { slug: "airport-luggage-game", name: "Airport Luggage", emoji: "✈️" },
        { slug: "tow-truck", name: "Tow Truck", emoji: "🚛" },
        { slug: "cuckoo-clock", name: "Cuckoo Clock", emoji: "🕰️" },
        { slug: "crane-truck", name: "Crane Truck", emoji: "🏗️" },
        { slug: "butterfly-garden", name: "Butterfly Garden", emoji: "🦋" },
        { slug: "earth-day", name: "Earth Day", emoji: "🌎" },
        { slug: "pattern-party", name: "Pattern Party", emoji: "🧩" },
        { slug: "unicorn-storyteller", name: "Unicorn Storyteller", emoji: "🦄" },
        { slug: "flappy-bird", name: "Flying Bird", emoji: "🐤" },
    ];
    const BY_SLUG = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

    let store = {};
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object") store = parsed;
    } catch (_) {}
    const games = (store.games && typeof store.games === "object") ? store.games : {};
    const players = (store.players && typeof store.players === "object") ? store.players : {};

    const gameRows = GAMES
        .map((g) => ({ ...g, plays: (games[g.slug] && games[g.slug].plays) || 0 }))
        .filter((g) => g.plays > 0)
        .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));

    const playerRows = Object.entries(players).map(([name, rec]) => {
        const playedMap = (rec && rec.games && typeof rec.games === "object") ? rec.games : {};
        const slugs = Object.keys(playedMap).filter((s) => (playedMap[s] || 0) > 0);
        return {
            name: name || "Anonymous",
            games: slugs.length,
            plays: (rec && rec.plays) || 0,
        };
    }).filter((p) => p.plays > 0)
      .sort((a, b) =>
          b.games - a.games || b.plays - a.plays || a.name.localeCompare(b.name)
      );

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    const gamesTable = document.getElementById("games-table");
    const gamesBody = gamesTable.querySelector("tbody");
    const gamesEmpty = document.getElementById("games-empty");
    if (gameRows.length === 0) {
        gamesTable.hidden = true;
        gamesEmpty.hidden = false;
    } else {
        gameRows.forEach((g, i) => {
            const tr = document.createElement("tr");
            tr.innerHTML =
                `<td class="rank">${i + 1}</td>` +
                `<td class="game-cell"><span class="game-emoji">${g.emoji}</span>${escapeHtml(g.name)}</td>` +
                `<td class="num">${g.plays}</td>`;
            gamesBody.appendChild(tr);
        });
    }

    const playersTable = document.getElementById("players-table");
    const playersBody = playersTable.querySelector("tbody");
    const playersEmpty = document.getElementById("players-empty");
    if (playerRows.length === 0) {
        playersTable.hidden = true;
        playersEmpty.hidden = false;
    } else {
        playerRows.forEach((p, i) => {
            const tr = document.createElement("tr");
            tr.innerHTML =
                `<td class="rank">${i + 1}</td>` +
                `<td>${escapeHtml(p.name)}</td>` +
                `<td class="num">${p.games}</td>` +
                `<td class="num">${p.plays}</td>`;
            playersBody.appendChild(tr);
        });
    }
})();
