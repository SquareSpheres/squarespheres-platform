'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  data?: any;
}

interface MobileLogViewerProps {
  isVisible?: boolean;
  maxEntries?: number;
}

export function MobileLogViewer({ isVisible = true, maxEntries = 50 }: MobileLogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    // Override console methods to capture logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        data: args.length > 1 ? args : undefined
      };

      setLogs(prev => {
        const newLogs = [logEntry, ...prev].slice(0, maxEntries);
        return newLogs;
      });

      // Call original console method
      switch (level) {
        case 'log': originalLog(...args); break;
        case 'error': originalError(...args); break;
        case 'warn': originalWarn(...args); break;
        case 'info': originalInfo(...args); break;
      }
    };

    console.log = (...args) => addLog('log', ...args);
    console.error = (...args) => addLog('error', ...args);
    console.warn = (...args) => addLog('warn', ...args);
    console.info = (...args) => addLog('info', ...args);

    // Cleanup function
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, [isVisible, maxEntries]);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current && isExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      case 'info': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 right-0 m-4 z-50 max-w-md">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors mb-2 text-sm"
      >
        📱 Logs ({logs.length})
      </button>

      {/* Log Viewer */}
      {isExpanded && (
        <div className="bg-white border border-gray-300 rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <h3 className="font-semibold text-sm text-gray-700">Mobile Debug Logs</h3>
            <div className="flex gap-2">
              <button
                onClick={clearLogs}
                className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Logs Container */}
          <div
            ref={logContainerRef}
            className="max-h-96 overflow-y-auto p-3 space-y-2 text-xs"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">No logs yet...</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border-l-4 ${getLogColor(log.level)}`}
                  style={{ borderLeftColor: log.level === 'error' ? '#dc2626' : log.level === 'warn' ? '#d97706' : log.level === 'info' ? '#2563eb' : '#6b7280' }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-xs text-gray-500">{log.timestamp}</span>
                    <span className="font-semibold text-xs uppercase">{log.level}</span>
                  </div>
                  <div className="font-mono text-xs whitespace-pre-wrap break-words">
                    {log.message}
                  </div>
                  {log.data && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                        Show Details
                      </summary>
                      <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
