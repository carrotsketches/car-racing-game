(() => {
    const KEY = "games-plays-v1";
    const NAME_KEY = "highway-dash-last-name";
    const script = document.currentScript;
    const slug = script && script.dataset && script.dataset.slug;
    if (!slug) return;

    let store;
    try {
        const raw = localStorage.getItem(KEY);
        store = raw ? JSON.parse(raw) : null;
    } catch (_) {
        store = null;
    }
    if (!store || typeof store !== "object") store = {};
    if (!store.games || typeof store.games !== "object") store.games = {};
    if (!store.players || typeof store.players !== "object") store.players = {};

    const name = (localStorage.getItem(NAME_KEY) || "").trim() || "Anonymous";

    const g = store.games[slug] || { plays: 0 };
    g.plays = (g.plays || 0) + 1;
    store.games[slug] = g;

    const p = store.players[name] || { plays: 0, games: {} };
    p.plays = (p.plays || 0) + 1;
    if (!p.games || typeof p.games !== "object") p.games = {};
    p.games[slug] = (p.games[slug] || 0) + 1;
    store.players[name] = p;

    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) {}
})();
