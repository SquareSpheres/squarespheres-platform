'use client';

import { useCallback, useRef } from 'react';
import { NetworkMetrics, NetworkQuality } from './networkPerformanceMonitor';

// Chunk size configuration
export interface ChunkSizeConfig {
  // Size limits
  minChunkSize: number;     // Minimum chunk size (bytes)
  maxChunkSize: number;     // Maximum chunk size (bytes)  
  defaultChunkSize: number; // Starting chunk size (bytes)
  
  // Adaptation parameters
  adaptationRate: number;      // How aggressively to adapt (0.1 = conservative, 0.5 = aggressive)
  stabilityThreshold: number;  // RTT variance threshold for stable connection
  qualityWindowSize: number;   // Number of measurements to consider for trends
  
  // Performance targets
  targetRTT: number;          // Target RTT for optimal performance (ms)
  targetBufferUtilization: number; // Target buffer usage (0.0 - 1.0)
  bandwidthUtilizationTarget: number; // Target bandwidth usage (0.0 - 1.0)
}

// Chunk size recommendation with reasoning
export interface ChunkSizeRecommendation {
  chunkSize: number;
  reasoning: string;
  confidence: number; // 0.0 - 1.0
  networkQuality: NetworkQuality;
  adaptationFactor: number;
}

// Historical performance data for trend analysis
interface PerformanceHistory {
  timestamp: number;
  chunkSize: number;
  rtt: number;
  bandwidth: number;
  bufferLevel: number;
  transferSuccess: boolean;
}

// Default configuration optimized for WebRTC data channels
const DEFAULT_CONFIG: ChunkSizeConfig = {
  minChunkSize: 8 * 1024,      // 8KB minimum
  maxChunkSize: 1024 * 1024,   // 1MB maximum
  defaultChunkSize: 64 * 1024, // 64KB default
  adaptationRate: 0.2,         // Moderate adaptation
  stabilityThreshold: 10,      // 10ms RTT variance threshold
  qualityWindowSize: 10,       // Last 10 measurements
  targetRTT: 100,              // 100ms target RTT
  targetBufferUtilization: 0.7, // 70% buffer target
  bandwidthUtilizationTarget: 0.85 // 85% bandwidth target
};

export function useAdaptiveChunkManager(
  role: 'host' | 'client',
  debug: boolean = false,
  config: Partial<ChunkSizeConfig> = {}
) {
  // Configuration with defaults
  const chunkConfig: ChunkSizeConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Current chunk size
  const currentChunkSizeRef = useRef<number>(chunkConfig.defaultChunkSize);
  
  // Performance history for trend analysis
  const performanceHistoryRef = useRef<PerformanceHistory[]>([]);
  
  // Adaptation state
  const adaptationStateRef = useRef({
    lastAdaptation: Date.now(),
    adaptationCount: 0,
    stabilityCounter: 0,
    trending: 'stable' as 'increasing' | 'decreasing' | 'stable'
  });

  // Calculate optimal chunk size based on network metrics
  const calculateOptimalChunkSize = useCallback((metrics: NetworkMetrics): ChunkSizeRecommendation => {
    const { averageRTT, estimatedBandwidth, networkQuality, averageBufferLevel, jitter } = metrics;
    
    let recommendedSize = currentChunkSizeRef.current;
    let reasoning = 'Maintaining current chunk size';
    let confidence = 0.5;
    let adaptationFactor = 1.0;

    // Base adaptation on network quality
    switch (networkQuality) {
      case NetworkQuality.EXCELLENT:
        // High bandwidth, low latency - use larger chunks
        adaptationFactor = 1.5;
        reasoning = 'Excellent network - increasing chunk size for better throughput';
        confidence = 0.9;
        break;
        
      case NetworkQuality.GOOD:
        // Good conditions - moderate increase
        adaptationFactor = 1.2;
        reasoning = 'Good network - moderate chunk size increase';
        confidence = 0.8;
        break;
        
      case NetworkQuality.FAIR:
        // Moderate conditions - slight adjustment based on RTT
        if (averageRTT > chunkConfig.targetRTT) {
          adaptationFactor = 0.9;
          reasoning = 'High RTT detected - reducing chunk size';
        } else {
          adaptationFactor = 1.1;
          reasoning = 'Fair network - slight chunk size increase';
        }
        confidence = 0.6;
        break;
        
      case NetworkQuality.POOR:
        // Poor conditions - use smaller chunks
        adaptationFactor = 0.7;
        reasoning = 'Poor network - reducing chunk size for reliability';
        confidence = 0.9;
        break;
    }

    // Adjust based on RTT
    if (averageRTT > 0) {
      const rttFactor = chunkConfig.targetRTT / Math.max(averageRTT, 50); // Avoid division by very small numbers
      adaptationFactor *= Math.pow(rttFactor, 0.3); // Moderate RTT influence
      
      if (averageRTT > chunkConfig.targetRTT * 2) {
        reasoning += ' - High RTT penalty applied';
      }
    }

    // Adjust based on bandwidth utilization
    if (estimatedBandwidth > 0) {
      const currentThroughput = currentChunkSizeRef.current * (1000 / Math.max(averageRTT, 50)); // bytes per second
      const utilizationRatio = currentThroughput / estimatedBandwidth;
      
      if (utilizationRatio < chunkConfig.bandwidthUtilizationTarget) {
        // Not fully utilizing bandwidth - can increase chunk size
        const bandwidthFactor = 1 + (chunkConfig.bandwidthUtilizationTarget - utilizationRatio);
        adaptationFactor *= Math.min(bandwidthFactor, 1.5); // Cap at 50% increase
        reasoning += ' - Underutilized bandwidth detected';
      } else if (utilizationRatio > 0.95) {
        // Saturating bandwidth - reduce chunk size
        adaptationFactor *= 0.9;
        reasoning += ' - Bandwidth saturation detected';
      }
    }

    // Adjust based on buffer levels
    if (averageBufferLevel > 0) {
      const bufferUtilization = averageBufferLevel / (1024 * 1024); // Assume 1MB max buffer
      
      if (bufferUtilization > chunkConfig.targetBufferUtilization) {
        // Buffer getting full - reduce chunk size
        adaptationFactor *= 0.8;
        reasoning += ' - High buffer utilization detected';
        confidence *= 0.9; // Less confident when buffer is stressed
      }
    }

    // Adjust based on connection stability (jitter)
    if (jitter > chunkConfig.stabilityThreshold) {
      // Unstable connection - be more conservative
      adaptationFactor *= 0.9;
      reasoning += ' - Connection instability detected';
      confidence *= 0.8;
    } else {
      // Stable connection - can be more aggressive
      confidence *= 1.1;
    }

    // Apply adaptation rate to prevent oscillation
    const targetSize = currentChunkSizeRef.current * adaptationFactor;
    const adaptationDelta = (targetSize - currentChunkSizeRef.current) * chunkConfig.adaptationRate;
    recommendedSize = Math.round(currentChunkSizeRef.current + adaptationDelta);

    // Enforce limits
    recommendedSize = Math.max(chunkConfig.minChunkSize, 
                              Math.min(chunkConfig.maxChunkSize, recommendedSize));

    // Ensure confidence stays within bounds
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    if (debug) {
      console.log(`[AdaptiveChunk ${role}] Chunk size calculation:`, {
        current: currentChunkSizeRef.current,
        recommended: recommendedSize,
        adaptationFactor: adaptationFactor.toFixed(2),
        reasoning,
        confidence: confidence.toFixed(2),
        networkQuality
      });
    }

    return {
      chunkSize: recommendedSize,
      reasoning,
      confidence,
      networkQuality,
      adaptationFactor
    };
  }, [role, debug, chunkConfig]);

  // Record performance data for trend analysis
  const recordPerformance = useCallback((
    chunkSize: number,
    rtt: number,
    bandwidth: number,
    bufferLevel: number,
    transferSuccess: boolean
  ) => {
    const now = Date.now();
    
    performanceHistoryRef.current.push({
      timestamp: now,
      chunkSize,
      rtt,
      bandwidth,
      bufferLevel,
      transferSuccess
    });

    // Keep only recent history (last 2 minutes)
    const cutoff = now - 120000;
    performanceHistoryRef.current = performanceHistoryRef.current.filter(
      h => h.timestamp >= cutoff
    );

    // Analyze trends
    const history = performanceHistoryRef.current;
    if (history.length >= chunkConfig.qualityWindowSize) {
      const recentHistory = history.slice(-chunkConfig.qualityWindowSize);
      const avgRTT = recentHistory.reduce((sum, h) => sum + h.rtt, 0) / recentHistory.length;
      const avgBandwidth = recentHistory.reduce((sum, h) => sum + h.bandwidth, 0) / recentHistory.length;
      const successRate = recentHistory.filter(h => h.transferSuccess).length / recentHistory.length;

      // Update trending state
      const state = adaptationStateRef.current;
      if (avgRTT < chunkConfig.targetRTT && successRate > 0.95) {
        state.trending = 'increasing';
        state.stabilityCounter++;
      } else if (avgRTT > chunkConfig.targetRTT * 1.5 || successRate < 0.9) {
        state.trending = 'decreasing';
        state.stabilityCounter = 0;
      } else {
        state.trending = 'stable';
        state.stabilityCounter++;
      }

      if (debug) {
        console.log(`[AdaptiveChunk ${role}] Performance trend:`, {
          trending: state.trending,
          avgRTT: avgRTT.toFixed(1),
          avgBandwidth: `${(avgBandwidth / 1024 / 1024).toFixed(2)} MB/s`,
          successRate: `${(successRate * 100).toFixed(1)}%`,
          stability: state.stabilityCounter
        });
      }
    }
  }, [role, debug, chunkConfig.qualityWindowSize, chunkConfig.targetRTT]);

  // Update chunk size based on network metrics
  const updateChunkSize = useCallback((metrics: NetworkMetrics): ChunkSizeRecommendation => {
    const recommendation = calculateOptimalChunkSize(metrics);
    
    // Only update if the change is significant and we're confident
    const sizeDifference = Math.abs(recommendation.chunkSize - currentChunkSizeRef.current);
    const percentageChange = sizeDifference / currentChunkSizeRef.current;
    
    if (percentageChange > 0.05 && recommendation.confidence > 0.6) { // 5% change threshold
      currentChunkSizeRef.current = recommendation.chunkSize;
      adaptationStateRef.current.lastAdaptation = Date.now();
      adaptationStateRef.current.adaptationCount++;
      
      if (debug) {
        console.log(`[AdaptiveChunk ${role}] Chunk size updated:`, {
          newSize: recommendation.chunkSize,
          change: `${(percentageChange * 100).toFixed(1)}%`,
          reasoning: recommendation.reasoning,
          confidence: `${(recommendation.confidence * 100).toFixed(1)}%`
        });
      }
    }
    
    return recommendation;
  }, [role, debug, calculateOptimalChunkSize]);

  // Get current chunk size
  const getCurrentChunkSize = useCallback((): number => {
    return currentChunkSizeRef.current;
  }, []);

  // Manually set chunk size (for testing or override)
  const setChunkSize = useCallback((size: number) => {
    const clampedSize = Math.max(chunkConfig.minChunkSize, 
                                Math.min(chunkConfig.maxChunkSize, size));
    currentChunkSizeRef.current = clampedSize;
    
    if (debug) {
      console.log(`[AdaptiveChunk ${role}] Chunk size manually set:`, clampedSize);
    }
  }, [role, debug, chunkConfig.minChunkSize, chunkConfig.maxChunkSize]);

  // Reset to default configuration
  const reset = useCallback(() => {
    currentChunkSizeRef.current = chunkConfig.defaultChunkSize;
    performanceHistoryRef.current = [];
    adaptationStateRef.current = {
      lastAdaptation: Date.now(),
      adaptationCount: 0,
      stabilityCounter: 0,
      trending: 'stable'
    };
    
    if (debug) {
      console.log(`[AdaptiveChunk ${role}] Reset to default chunk size:`, chunkConfig.defaultChunkSize);
    }
  }, [role, debug, chunkConfig.defaultChunkSize]);

  // Get adaptation statistics
  const getAdaptationStats = useCallback(() => {
    const state = adaptationStateRef.current;
    const history = performanceHistoryRef.current;
    
    return {
      currentChunkSize: currentChunkSizeRef.current,
      adaptationCount: state.adaptationCount,
      lastAdaptation: state.lastAdaptation,
      trending: state.trending,
      stabilityCounter: state.stabilityCounter,
      performanceHistoryLength: history.length,
      config: chunkConfig
    };
  }, [chunkConfig]);

  return {
    // Chunk size management
    getCurrentChunkSize,
    setChunkSize,
    updateChunkSize,
    calculateOptimalChunkSize,
    
    // Performance tracking
    recordPerformance,
    
    // Data access
    getAdaptationStats,
    reset,
    
    // Configuration
    config: chunkConfig
  };
}
