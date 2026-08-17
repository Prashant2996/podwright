import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import StatusBadge from '../components/StatusBadge';

export default function Troubleshoot({ namespace }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [selectedPod, setSelectedPod] = useState(null);
  const [podDiagnosis, setPodDiagnosis] = useState(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const { addToast } = useToast();

  const handleScan = async () => {
    if (!namespace) {
      addToast('Select a namespace first', 'error');
      return;
    }
    setScanning(true);
    setScanResult(null);
    setSelectedPod(null);
    setPodDiagnosis(null);
    try {
      const res = await fetch(`/api/troubleshoot/${namespace}`);
      const data = await res.json();
      setScanResult(data);
      if (data.problems?.length === 0) {
        addToast('No issues found - all pods healthy', 'success');
      }
    } catch (e) {
      addToast('Scan failed: ' + e.message, 'error');
    }
    setScanning(false);
  };

  const handleDiagnose = async (podName) => {
    setSelectedPod(podName);
    setDiagnosing(true);
    setPodDiagnosis(null);
    try {
      const res = await fetch(`/api/troubleshoot/${namespace}/${podName}`);
      const data = await res.json();
      setPodDiagnosis(data);
    } catch (e) {
      addToast('Diagnosis failed: ' + e.message, 'error');
    }
    setDiagnosing(false);
  };

  const severityColors = {
    critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
    medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
    low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-white">AI Troubleshooter</h2>
          <p className="text-xs text-gray-500 mt-0.5">Analyze pod failures, crashes, and performance issues</p>
        </div>
        <button onClick={handleScan} disabled={scanning} className="btn-primary">
          {scanning ? 'Scanning...' : 'Scan for Issues'}
        </button>
      </div>

      {scanning && <LoadingSkeleton rows={5} />}

      {/* No results yet */}
      {!scanning && !scanResult && (
        <div className="card p-8 text-center">
          <svg className="w-14 h-14 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-500 mb-1">Scan your namespace for pod issues</p>
          <p className="text-xs text-gray-600">Detects CrashLoopBackOff, OOMKilled, ImagePull errors, scheduling failures, and more</p>
        </div>
      )}

      {/* Scan Results */}
      {scanResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                scanResult.problems?.length === 0 ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {scanResult.problems?.length === 0 ? (
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {scanResult.problems?.length === 0
                    ? 'All pods healthy'
                    : `${scanResult.problems.length} problem${scanResult.problems.length > 1 ? 's' : ''} found`}
                </p>
                <p className="text-xs text-gray-500">Scanned {scanResult.scannedPods} pods in {namespace}</p>
              </div>
            </div>
          </div>

          {/* Problem List */}
          {scanResult.problems?.length > 0 && (
            <div className="space-y-2">
              {scanResult.problems.map((problem, i) => {
                const colors = severityColors[problem.severity] || severityColors.low;
                return (
                  <div key={i} className={`card p-4 border ${colors.border} cursor-pointer hover:bg-gray-800/30 transition-colors ${
                    selectedPod === problem.name ? 'ring-1 ring-k8s-blue' : ''
                  }`} onClick={() => handleDiagnose(problem.name)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${colors.bg} ${colors.text}`}>
                          {problem.severity}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-white font-mono">{problem.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{problem.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{problem.restarts} restarts</span>
                        <StatusBadge status={problem.issue === 'CrashLoopBackOff' ? 'CrashLoopBackOff' : problem.issue === 'OOMKilled' ? 'Failed' : 'Pending'} />
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pod Diagnosis Detail */}
          {diagnosing && <LoadingSkeleton rows={6} />}

          {podDiagnosis && !diagnosing && (
            <div className="card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white">Diagnosis: {podDiagnosis.pod}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Phase: {podDiagnosis.phase}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-xl font-bold ${
                    podDiagnosis.diagnosis.healthScore >= 80 ? 'text-green-400' :
                    podDiagnosis.diagnosis.healthScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {podDiagnosis.diagnosis.healthScore}/100
                  </div>
                  <Link to={`/pods/${podDiagnosis.pod}`} className="btn-secondary btn-sm text-xs">
                    View Pod
                  </Link>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-sm text-gray-200">{podDiagnosis.diagnosis.summary}</p>
              </div>

              {/* Root Causes */}
              {podDiagnosis.diagnosis.rootCauses.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">Root Causes</h4>
                  <div className="space-y-2">
                    {podDiagnosis.diagnosis.rootCauses.map((cause, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-gray-300">{cause}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues */}
              {podDiagnosis.diagnosis.issues.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">Issues Detected</h4>
                  <div className="space-y-2">
                    {podDiagnosis.diagnosis.issues.map((issue, i) => {
                      const colors = severityColors[issue.severity] || severityColors.low;
                      return (
                        <div key={i} className={`rounded-lg p-3 border ${colors.border} ${colors.bg}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${colors.text}`}>{issue.issue}</span>
                            {issue.container !== '-' && (
                              <span className="text-[10px] text-gray-500">container: {issue.container}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300">{issue.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggestions / Fixes */}
              {podDiagnosis.diagnosis.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">Suggested Fixes</h4>
                  <div className="space-y-3">
                    {podDiagnosis.diagnosis.suggestions.map((suggestion, i) => (
                      <div key={i} className="bg-green-500/5 border border-green-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-sm font-medium text-green-400">{suggestion.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            suggestion.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>{suggestion.priority}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{suggestion.description}</p>
                        <div className="bg-gray-900 rounded p-2">
                          <p className="text-xs font-mono text-green-300">{suggestion.fix}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Events */}
              {podDiagnosis.rawData?.recentEvents?.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">Recent Events</h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {podDiagnosis.rawData.recentEvents.map((event, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          event.type === 'Warning' ? 'bg-red-400' : 'bg-green-400'
                        }`} />
                        <span className="text-gray-400 font-medium min-w-[80px]">{event.reason}</span>
                        <span className="text-gray-500 flex-1">{event.message}</span>
                        {event.count > 1 && (
                          <span className="text-[10px] text-gray-600">x{event.count}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
