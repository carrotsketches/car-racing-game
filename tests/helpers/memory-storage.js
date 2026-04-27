// Minimal localStorage-shaped object for use in Node tests.
function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; },
        clear: () => { for (const k of Object.keys(data)) delete data[k]; },
        get length() { return Object.keys(data).length; },
        _data: data,
    };
}

function failingStorage() {
    return {
        getItem: () => { throw new Error("storage unavailable"); },
        setItem: () => { throw new Error("storage unavailable"); },
        removeItem: () => { throw new Error("storage unavailable"); },
        clear: () => { throw new Error("storage unavailable"); },
    };
}

module.exports = { memoryStorage, failingStorage };
