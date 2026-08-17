import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export default function Search({ namespace }) {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const { addSearch } = useSearchHistory();

  useEffect(() => {
    if (query && namespace) {
      setLoading(true);
      addSearch(query);
      fetch(`/api/search/${namespace}?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
          setResults(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setResults([]);
    }
  }, [query, namespace]);

  const typeColors = {
    deployment: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
    pod: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
    service: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
    configmap: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
    secret: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  };

  const typeLinks = {
    deployment: (name) => `/deployments/${name}`,
    pod: (name) => `/pods/${name}`,
    service: () => '/services',
    configmap: (name) => `/configmaps?edit=${name}`,
    secret: () => '/secrets',
  };

  // Group results by type
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-2">Search Results</h2>
      {query && (
        <p className="text-sm text-gray-400 mb-4">
          Showing results for "<span className="text-white">{query}</span>" in {namespace}
        </p>
      )}

      {!query && (
        <div className="card p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-gray-500">Use the search bar to find resources</p>
        </div>
      )}

      {loading && <LoadingSkeleton rows={5} />}

      {!loading && query && results.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No resources found matching "{query}"</p>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([type, items]) => {
        const colors = typeColors[type] || typeColors.deployment;
        return (
          <div key={type} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                {type}
              </span>
              <span className="text-xs text-gray-500">{items.length} results</span>
            </div>
            <div className="card overflow-hidden divide-y divide-gray-700/30">
              {items.map((item, i) => (
                <Link
                  key={i}
                  to={typeLinks[item.type]?.(item.name) || '/'}
                  className="block px-4 py-3 hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-sm text-white font-medium">{item.name}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
