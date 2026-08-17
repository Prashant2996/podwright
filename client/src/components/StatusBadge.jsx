const statusStyles = {
  Running: 'bg-green-500/20 text-green-400 border-green-500/50 status-running',
  Active: 'bg-green-500/20 text-green-400 border-green-500/50 status-running',
  Available: 'bg-green-500/20 text-green-400 border-green-500/50 status-running',
  Ready: 'bg-green-500/20 text-green-400 border-green-500/50 status-running',
  Pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 status-pending',
  Terminating: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 status-pending',
  Suspended: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 status-pending',
  Partial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 status-pending',
  Failed: 'bg-red-500/20 text-red-400 border-red-500/50 status-failed',
  CrashLoopBackOff: 'bg-red-500/20 text-red-400 border-red-500/50 status-failed',
  Error: 'bg-red-500/20 text-red-400 border-red-500/50 status-failed',
  Succeeded: 'bg-blue-500/20 text-blue-400 border-blue-500/50 status-succeeded',
  Complete: 'bg-blue-500/20 text-blue-400 border-blue-500/50 status-succeeded',
  Bound: 'bg-blue-500/20 text-blue-400 border-blue-500/50 status-succeeded',
  'Scaled Down': 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  Unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
};

export default function StatusBadge({ status }) {
  const style = statusStyles[status] || statusStyles.Unknown;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {status}
    </span>
  );
}
