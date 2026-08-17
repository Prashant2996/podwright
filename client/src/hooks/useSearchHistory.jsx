import { useCallback } from 'react';

const STORAGE_KEY = 'podwright-search-history';
const MAX_ENTRIES = 50;
const DECAY_DAYS = 14;

function getHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
}

function scoreEntry(entry) {
  const now = Date.now();
  const daysSinceLastUse = (now - entry.lastUsed) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - daysSinceLastUse / DECAY_DAYS);
  return entry.frequency * 2 + recencyScore * 3;
}

export function useSearchHistory() {
  const addSearch = useCallback((query) => {
    if (!query || query.trim().length < 2) return;
    const trimmed = query.trim().toLowerCase();
    const history = getHistory();
    const existing = history.find(h => h.query === trimmed);

    if (existing) {
      existing.frequency += 1;
      existing.lastUsed = Date.now();
    } else {
      history.push({ query: trimmed, frequency: 1, lastUsed: Date.now() });
    }

    // Prune old entries
    const pruned = history
      .filter(h => {
        const daysSince = (Date.now() - h.lastUsed) / (1000 * 60 * 60 * 24);
        return daysSince < DECAY_DAYS * 3;
      })
      .sort((a, b) => scoreEntry(b) - scoreEntry(a))
      .slice(0, MAX_ENTRIES);

    saveHistory(pruned);
  }, []);

  const getTopPredictions = useCallback((partial) => {
    if (!partial || partial.trim().length < 1) return [];
    const query = partial.trim().toLowerCase();
    const history = getHistory();

    return history
      .filter(h => h.query.includes(query) && h.query !== query)
      .sort((a, b) => scoreEntry(b) - scoreEntry(a))
      .slice(0, 5)
      .map(h => h.query);
  }, []);

  return { addSearch, getTopPredictions };
}
