import { useState, useMemo } from 'react';

export default function ResourceTable({ columns, data, onRowClick, filter = true, actions }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filterText, setFilterText] = useState('');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    if (!filterText) return data;
    const query = filterText.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = col.accessor ? row[col.accessor] : '';
        return String(val).toLowerCase().includes(query);
      })
    );
  }, [data, filterText, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div>
      {filter && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter resources..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="input w-64"
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700/50">
              {columns.map(col => (
                <th
                  key={col.accessor || col.header}
                  className="text-left px-4 py-3 text-gray-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => col.accessor && handleSort(col.accessor)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortKey === col.accessor && (
                      <span className="text-k8s-blue">
                        {sortDir === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {actions && <th className="text-left px-4 py-3 text-gray-400 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                  No resources found
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={row.name || i}
                  className={`border-b border-gray-700/30 ${onRowClick ? 'cursor-pointer hover:bg-gray-800/50' : ''}`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map(col => (
                    <td key={col.accessor || col.header} className="px-4 py-3">
                      {col.render ? col.render(row) : row[col.accessor]}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {actions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
