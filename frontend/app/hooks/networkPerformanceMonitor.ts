'use client';

import { useCallback, useRef } from 'react';

// Network quality classification
export enum NetworkQuality {
  EXCELLENT = 'excellent', // < 50ms RTT, > 10 Mbps
  GOOD = 'good',          // < 100ms RTT, > 5 Mbps  
  FAIR = 'fair',          // < 200ms RTT, > 1 Mbps
  POOR = 'poor'           // > 200ms RTT, < 1 Mbps
}

// Network metrics for performance monitoring
export interface NetworkMetrics {
  // RTT measurements
  currentRTT: number;
  averageRTT: number;
  minRTT: number;
  maxRTT: number;
  rttSamples: number;
  
  // Bandwidth estimation
  estimatedBandwidth: number; // bytes per second
  averageBandwidth: number;
  peakBandwidth: number;
  
  // Connection quality
  networkQuality: NetworkQuality;
  packetLoss: number; // percentage
  jitter: number; // RTT variance
  
  // Buffer monitoring
  bufferFullCount: number;
  averageBufferLevel: number;
  
  // Timestamps
  lastUpdate: number;
  measurementWindow: number; // seconds
}

// Chunk timing data for bandwidth calculation
interface ChunkTiming {
  timestamp: number;
  size: number;
  rtt?: number;
}

// Performance thresholds for network quality classification
const NETWORK_THRESHOLDS = {
  RTT: {
    EXCELLENT: 50,
    GOOD: 100,
    FAIR: 200
  },
  BANDWIDTH: {
    EXCELLENT: 10 * 1024 * 1024, // 10 Mbps
    GOOD: 5 * 1024 * 1024,       // 5 Mbps
    FAIR: 1 * 1024 * 1024        // 1 Mbps
  }
};

// Configuration for adaptive behavior
export interface AdaptiveConfig {
  // RTT measurement
  rttMeasurementInterval: number; // ms between ping measurements
  rttSampleSize: number; // number of samples to keep
  
  // Bandwidth estimation
  bandwidthWindowSize: number; // seconds of data to consider
  minBandwidthSamples: number; // minimum samples before estimation
  
  // Quality classification
  qualityUpdateInterval: number; // ms between quality updates
  
  // Buffer monitoring
  bufferMonitoringEnabled: boolean;
  bufferThreshold: number; // bytes before considering "full"
}

export function useNetworkPerformanceMonitor(
  role: 'host' | 'client',
  debug: boolean = false,
  config: Partial<AdaptiveConfig> = {}
) {
  // Configuration with defaults
  const adaptiveConfig: AdaptiveConfig = {
    rttMeasurementInterval: 2000, // 2 seconds
    rttSampleSize: 20,
    bandwidthWindowSize: 10, // 10 seconds
    minBandwidthSamples: 5,
    qualityUpdateInterval: 5000, // 5 seconds
    bufferMonitoringEnabled: true,
    bufferThreshold: 1024 * 1024, // 1MB
    ...config
  };

  // Network metrics storage
  const metricsRef = useRef<NetworkMetrics>({
    currentRTT: 0,
    averageRTT: 0,
    minRTT: Infinity,
    maxRTT: 0,
    rttSamples: 0,
    estimatedBandwidth: 0,
    averageBandwidth: 0,
    peakBandwidth: 0,
    networkQuality: NetworkQuality.FAIR,
    packetLoss: 0,
    jitter: 0,
    bufferFullCount: 0,
    averageBufferLevel: 0,
    lastUpdate: Date.now(),
    measurementWindow: adaptiveConfig.bandwidthWindowSize
  });

  // RTT measurement storage
  const rttSamplesRef = useRef<number[]>([]);
  
  // Bandwidth measurement storage  
  const chunkTimingsRef = useRef<ChunkTiming[]>([]);
  
  // Buffer level measurements
  const bufferLevelsRef = useRef<{ timestamp: number; level: number }[]>([]);

  // Ping measurement for RTT (using data channel if available)
  const measureRTT = useCallback(async (dataChannel?: RTCDataChannel): Promise<number> => {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return 0;
    }

    return new Promise<number>((resolve) => {
      const pingId = Math.random().toString(36).substr(2, 9);
      const startTime = performance.now();
      
      // Create ping message
      const pingMessage = JSON.stringify({
        type: 'ping',
        id: pingId,
        timestamp: startTime
      });

      let responseReceived = false;
      
      // Set up response handler
      const handleMessage = (event: MessageEvent) => {
        if (responseReceived) return;
        
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
          if (data?.type === 'pong' && data?.id === pingId) {
            responseReceived = true;
            const rtt = performance.now() - startTime;
            dataChannel.removeEventListener('message', handleMessage);
            resolve(rtt);
          }
        } catch (error) {
          // Ignore parsing errors - not our ping response
        }
      };

      // Timeout handler
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          responseReceived = true;
          dataChannel.removeEventListener('message', handleMessage);
          resolve(0); // Failed measurement
        }
      }, 5000); // 5 second timeout

      dataChannel.addEventListener('message', handleMessage);
      
      try {
        dataChannel.send(pingMessage);
      } catch (error) {
        clearTimeout(timeout);
        dataChannel.removeEventListener('message', handleMessage);
        resolve(0);
      }
    });
  }, []);

  // Handle ping responses (for client/host role)
  const handlePingMessage = useCallback((data: any, dataChannel?: RTCDataChannel) => {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    
    try {
      if (data?.type === 'ping' && data?.id) {
        // Send pong response
        const pongMessage = JSON.stringify({
          type: 'pong',
          id: data.id,
          timestamp: Date.now()
        });
        dataChannel.send(pongMessage);
      }
    } catch (error) {
      if (debug) {
        console.warn('Failed to send pong response:', error);
      }
    }
  }, [debug]);

  // Update RTT measurements
  const updateRTT = useCallback((rtt: number) => {
    if (rtt <= 0) return;

    const metrics = metricsRef.current;
    
    // Add to samples
    rttSamplesRef.current.push(rtt);
    if (rttSamplesRef.current.length > adaptiveConfig.rttSampleSize) {
      rttSamplesRef.current.shift();
    }

    // Update metrics
    metrics.currentRTT = rtt;
    metrics.rttSamples = rttSamplesRef.current.length;
    metrics.minRTT = Math.min(metrics.minRTT, rtt);
    metrics.maxRTT = Math.max(metrics.maxRTT, rtt);
    
    // Calculate average RTT
    const samples = rttSamplesRef.current;
    metrics.averageRTT = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    
    // Calculate jitter (RTT variance)
    if (samples.length > 1) {
      const variance = samples.reduce((sum, sample) => {
        return sum + Math.pow(sample - metrics.averageRTT, 2);
      }, 0) / samples.length;
      metrics.jitter = Math.sqrt(variance);
    }

    if (debug) {
      console.log(`[NetworkMonitor ${role}] RTT updated:`, {
        current: rtt.toFixed(1),
        average: metrics.averageRTT.toFixed(1),
        jitter: metrics.jitter.toFixed(1),
        samples: metrics.rttSamples
      });
    }
  }, [role, debug, adaptiveConfig.rttSampleSize]);

  // Record chunk transfer for bandwidth estimation
  const recordChunkTransfer = useCallback((chunkSize: number, transferTime?: number) => {
    const now = Date.now();
    const timing: ChunkTiming = {
      timestamp: now,
      size: chunkSize
    };

    chunkTimingsRef.current.push(timing);

    // Remove old samples outside the window
    const windowStart = now - (adaptiveConfig.bandwidthWindowSize * 1000);
    chunkTimingsRef.current = chunkTimingsRef.current.filter(
      t => t.timestamp >= windowStart
    );

    // Calculate bandwidth if we have enough samples
    if (chunkTimingsRef.current.length >= adaptiveConfig.minBandwidthSamples) {
      const timings = chunkTimingsRef.current;
      const totalBytes = timings.reduce((sum, t) => sum + t.size, 0);
      const timeSpan = (now - timings[0].timestamp) / 1000; // seconds

      if (timeSpan > 0) {
        const currentBandwidth = totalBytes / timeSpan;
        const metrics = metricsRef.current;
        
        metrics.estimatedBandwidth = currentBandwidth;
        metrics.peakBandwidth = Math.max(metrics.peakBandwidth, currentBandwidth);
        
        // Update average bandwidth (exponential moving average)
        if (metrics.averageBandwidth === 0) {
          metrics.averageBandwidth = currentBandwidth;
        } else {
          const alpha = 0.1; // smoothing factor
          metrics.averageBandwidth = (alpha * currentBandwidth) + ((1 - alpha) * metrics.averageBandwidth);
        }

        if (debug) {
          console.log(`[NetworkMonitor ${role}] Bandwidth updated:`, {
            current: `${(currentBandwidth / 1024 / 1024).toFixed(2)} MB/s`,
            average: `${(metrics.averageBandwidth / 1024 / 1024).toFixed(2)} MB/s`,
            peak: `${(metrics.peakBandwidth / 1024 / 1024).toFixed(2)} MB/s`,
            samples: timings.length
          });
        }
      }
    }
  }, [role, debug, adaptiveConfig.bandwidthWindowSize, adaptiveConfig.minBandwidthSamples]);

  // Record buffer level for monitoring
  const recordBufferLevel = useCallback((bufferLevel: number) => {
    if (!adaptiveConfig.bufferMonitoringEnabled) return;

    const now = Date.now();
    bufferLevelsRef.current.push({ timestamp: now, level: bufferLevel });

    // Keep only recent buffer levels (last 30 seconds)
    const windowStart = now - 30000;
    bufferLevelsRef.current = bufferLevelsRef.current.filter(
      b => b.timestamp >= windowStart
    );

    const metrics = metricsRef.current;
    
    // Count buffer full events
    if (bufferLevel >= adaptiveConfig.bufferThreshold) {
      metrics.bufferFullCount++;
    }

    // Calculate average buffer level
    if (bufferLevelsRef.current.length > 0) {
      const totalLevel = bufferLevelsRef.current.reduce((sum, b) => sum + b.level, 0);
      metrics.averageBufferLevel = totalLevel / bufferLevelsRef.current.length;
    }
  }, [adaptiveConfig.bufferMonitoringEnabled, adaptiveConfig.bufferThreshold]);

  // Classify network quality based on current metrics
  const updateNetworkQuality = useCallback(() => {
    const metrics = metricsRef.current;
    const { averageRTT, averageBandwidth } = metrics;

    let quality = NetworkQuality.POOR;

    if (averageRTT <= NETWORK_THRESHOLDS.RTT.EXCELLENT && 
        averageBandwidth >= NETWORK_THRESHOLDS.BANDWIDTH.EXCELLENT) {
      quality = NetworkQuality.EXCELLENT;
    } else if (averageRTT <= NETWORK_THRESHOLDS.RTT.GOOD && 
               averageBandwidth >= NETWORK_THRESHOLDS.BANDWIDTH.GOOD) {
      quality = NetworkQuality.GOOD;
    } else if (averageRTT <= NETWORK_THRESHOLDS.RTT.FAIR && 
               averageBandwidth >= NETWORK_THRESHOLDS.BANDWIDTH.FAIR) {
      quality = NetworkQuality.FAIR;
    }

    if (metrics.networkQuality !== quality) {
      metrics.networkQuality = quality;
      
      if (debug) {
        console.log(`[NetworkMonitor ${role}] Network quality updated:`, {
          quality,
          rtt: averageRTT.toFixed(1),
          bandwidth: `${(averageBandwidth / 1024 / 1024).toFixed(2)} MB/s`
        });
      }
    }

    metrics.lastUpdate = Date.now();
  }, [role, debug]);

  // Get current network metrics
  const getMetrics = useCallback((): NetworkMetrics => {
    return { ...metricsRef.current };
  }, []);

  // Reset all measurements
  const reset = useCallback(() => {
    metricsRef.current = {
      currentRTT: 0,
      averageRTT: 0,
      minRTT: Infinity,
      maxRTT: 0,
      rttSamples: 0,
      estimatedBandwidth: 0,
      averageBandwidth: 0,
      peakBandwidth: 0,
      networkQuality: NetworkQuality.FAIR,
      packetLoss: 0,
      jitter: 0,
      bufferFullCount: 0,
      averageBufferLevel: 0,
      lastUpdate: Date.now(),
      measurementWindow: adaptiveConfig.bandwidthWindowSize
    };
    
    rttSamplesRef.current = [];
    chunkTimingsRef.current = [];
    bufferLevelsRef.current = [];
  }, [adaptiveConfig.bandwidthWindowSize]);

  return {
    // Measurement functions
    measureRTT,
    handlePingMessage,
    updateRTT,
    recordChunkTransfer,
    recordBufferLevel,
    updateNetworkQuality,
    
    // Data access
    getMetrics,
    reset,
    
    // Configuration
    config: adaptiveConfig
  };
}
