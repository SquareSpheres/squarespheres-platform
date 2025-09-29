'use client';

import { useCallback, useRef } from 'react';

// Transfer state for resumption
export interface PersistedTransferState {
  // Transfer identification
  transferId: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  
  // Progress tracking
  receivedChunks: Set<number>;
  totalChunks: number;
  bytesReceived: number;
  
  // Transfer metadata
  startTime: number;
  lastUpdateTime: number;
  role: 'host' | 'client';
  
  // Chunk information
  chunkSize: number; // Last known chunk size
  adaptiveChunking: boolean;
  
  // Network information (for resumption optimization)
  lastNetworkQuality?: string;
  lastRTT?: number;
  lastBandwidth?: number;
  
  // File storage information
  storageMethod: 'memory' | 'filesystem';
  fileHandle?: FileSystemFileHandle; // For FileSystem Access API
  
  // Integrity tracking
  verifiedChunks: Set<number>; // Chunks that passed hash verification
  chunkHashes?: Map<number, string>; // Individual chunk hashes if available
  
  // Resume attempt tracking
  resumeAttempts: number;
  lastResumeTime?: number;
}

// Serializable version for localStorage/IndexedDB
interface SerializedTransferState {
  transferId: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  receivedChunks: number[];
  totalChunks: number;
  bytesReceived: number;
  startTime: number;
  lastUpdateTime: number;
  role: 'host' | 'client';
  chunkSize: number;
  adaptiveChunking: boolean;
  lastNetworkQuality?: string;
  lastRTT?: number;
  lastBandwidth?: number;
  storageMethod: 'memory' | 'filesystem';
  verifiedChunks: number[];
  chunkHashes?: [number, string][]; // Array of [chunkIndex, hash] pairs
  resumeAttempts: number;
  lastResumeTime?: number;
}

// Configuration for persistence behavior
export interface PersistenceConfig {
  // Storage preferences
  preferIndexedDB: boolean;           // Prefer IndexedDB over localStorage
  enableFilesystemPersistence: boolean; // Persist FileSystem Access API handles
  
  // Cleanup settings
  maxStateAge: number;                // Max age in milliseconds before cleanup
  maxResumeAttempts: number;          // Max resume attempts before abandoning
  cleanupInterval: number;            // How often to run cleanup (ms)
  
  // Performance settings
  saveThrottleMs: number;             // Throttle saves to prevent excessive writes
  batchChunkUpdates: boolean;         // Batch multiple chunk updates
  
  // Storage limits
  maxStoredTransfers: number;         // Maximum number of transfers to keep
  maxStateSize: number;               // Maximum size per transfer state (bytes)
}

// Default configuration
const DEFAULT_CONFIG: PersistenceConfig = {
  preferIndexedDB: true,
  enableFilesystemPersistence: true,
  maxStateAge: 24 * 60 * 60 * 1000, // 24 hours
  maxResumeAttempts: 3,
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  saveThrottleMs: 1000, // 1 second
  batchChunkUpdates: true,
  maxStoredTransfers: 10,
  maxStateSize: 1024 * 1024 // 1MB per state
};

export function useTransferPersistenceManager(
  role: 'host' | 'client',
  debug: boolean = false,
  config: Partial<PersistenceConfig> = {}
) {
  // Configuration with defaults
  const persistenceConfig: PersistenceConfig = { ...DEFAULT_CONFIG, ...config };
  
  // In-memory state cache
  const stateCache = useRef<Map<string, PersistedTransferState>>(new Map());
  
  // Throttling for save operations
  const saveThrottles = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Storage availability detection
  const storageAvailable = useRef({
    localStorage: typeof window !== 'undefined' && window.localStorage,
    indexedDB: typeof window !== 'undefined' && window.indexedDB
  });
  
  // Track if we've recently attempted database recreation to avoid loops
  const lastRecreationAttempt = useRef<number>(0);
  const RECREATION_COOLDOWN = 30000; // 30 seconds
  
  // Track failed IndexedDB attempts to temporarily disable it
  const indexedDBFailureCount = useRef<number>(0);
  const MAX_INDEXEDDB_FAILURES = 3;

  // Get storage key for transfer state
  const getStorageKey = useCallback((transferId: string): string => {
    return `file_transfer_state_${role}_${transferId}`;
  }, [role]);

  // Serialize transfer state for storage
  const serializeState = useCallback((state: PersistedTransferState): SerializedTransferState => {
    return {
      transferId: state.transferId,
      fileName: state.fileName,
      fileSize: state.fileSize,
      fileHash: state.fileHash,
      receivedChunks: Array.from(state.receivedChunks),
      totalChunks: state.totalChunks,
      bytesReceived: state.bytesReceived,
      startTime: state.startTime,
      lastUpdateTime: state.lastUpdateTime,
      role: state.role,
      chunkSize: state.chunkSize,
      adaptiveChunking: state.adaptiveChunking,
      lastNetworkQuality: state.lastNetworkQuality,
      lastRTT: state.lastRTT,
      lastBandwidth: state.lastBandwidth,
      storageMethod: state.storageMethod,
      verifiedChunks: Array.from(state.verifiedChunks),
      chunkHashes: state.chunkHashes ? Array.from(state.chunkHashes.entries()) : undefined,
      resumeAttempts: state.resumeAttempts,
      lastResumeTime: state.lastResumeTime
    };
  }, []);

  // Deserialize transfer state from storage
  const deserializeState = useCallback((serialized: SerializedTransferState): PersistedTransferState => {
    return {
      transferId: serialized.transferId,
      fileName: serialized.fileName,
      fileSize: serialized.fileSize,
      fileHash: serialized.fileHash,
      receivedChunks: new Set(serialized.receivedChunks),
      totalChunks: serialized.totalChunks,
      bytesReceived: serialized.bytesReceived,
      startTime: serialized.startTime,
      lastUpdateTime: serialized.lastUpdateTime,
      role: serialized.role,
      chunkSize: serialized.chunkSize,
      adaptiveChunking: serialized.adaptiveChunking,
      lastNetworkQuality: serialized.lastNetworkQuality,
      lastRTT: serialized.lastRTT,
      lastBandwidth: serialized.lastBandwidth,
      storageMethod: serialized.storageMethod,
      verifiedChunks: new Set(serialized.verifiedChunks),
      chunkHashes: serialized.chunkHashes ? new Map(serialized.chunkHashes) : undefined,
      resumeAttempts: serialized.resumeAttempts,
      lastResumeTime: serialized.lastResumeTime
    };
  }, []);

  // Save state to localStorage
  const saveToLocalStorage = useCallback(async (transferId: string, state: PersistedTransferState): Promise<boolean> => {
    if (!storageAvailable.current.localStorage) return false;
    
    try {
      const key = getStorageKey(transferId);
      const serialized = serializeState(state);
      const json = JSON.stringify(serialized);
      
      // Check size limit
      if (json.length > persistenceConfig.maxStateSize) {
        if (debug) {
          console.warn(`[PersistenceManager ${role}] State too large for localStorage:`, json.length);
        }
        return false;
      }
      
      localStorage.setItem(key, json);
      
      if (debug) {
        console.log(`[PersistenceManager ${role}] Saved to localStorage:`, { transferId, size: json.length });
      }
      
      return true;
    } catch (error) {
      if (debug) {
        console.error(`[PersistenceManager ${role}] localStorage save failed:`, error);
      }
      return false;
    }
  }, [role, debug, getStorageKey, serializeState, persistenceConfig.maxStateSize]);

  // Load state from localStorage
  const loadFromLocalStorage = useCallback(async (transferId: string): Promise<PersistedTransferState | null> => {
    if (!storageAvailable.current.localStorage) return null;
    
    try {
      const key = getStorageKey(transferId);
      const json = localStorage.getItem(key);
      
      if (!json) return null;
      
      const serialized: SerializedTransferState = JSON.parse(json);
      const state = deserializeState(serialized);
      
      if (debug) {
        console.log(`[PersistenceManager ${role}] Loaded from localStorage:`, { transferId, chunks: state.receivedChunks.size });
      }
      
      return state;
    } catch (error) {
      if (debug) {
        console.error(`[PersistenceManager ${role}] localStorage load failed:`, error);
      }
      return null;
    }
  }, [role, debug, getStorageKey, deserializeState]);

  // Save state to IndexedDB (more robust for larger data)
  const saveToIndexedDB = useCallback(async (transferId: string, state: PersistedTransferState): Promise<boolean> => {
    if (!storageAvailable.current.indexedDB || indexedDBFailureCount.current >= MAX_INDEXEDDB_FAILURES) {
      if (debug && indexedDBFailureCount.current >= MAX_INDEXEDDB_FAILURES) {
        console.warn(`[PersistenceManager ${role}] IndexedDB temporarily disabled due to repeated failures`);
      }
      return false;
    }
    
    return new Promise<boolean>((resolve) => {
      try {
        const request = indexedDB.open('FileTransferStates', 2);
        
        request.onerror = () => {
          indexedDBFailureCount.current++;
          if (debug) {
            console.error(`[PersistenceManager ${role}] IndexedDB open failed (${indexedDBFailureCount.current}/${MAX_INDEXEDDB_FAILURES})`);
          }
          resolve(false);
        };
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Clear any existing object stores to ensure clean state
          for (const storeName of Array.from(db.objectStoreNames)) {
            db.deleteObjectStore(storeName);
          }
          
          // Create the transfers object store
          db.createObjectStore('transfers', { keyPath: 'transferId' });
          
          if (debug) {
            console.log(`[PersistenceManager ${role}] Created IndexedDB object store: transfers`);
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Check if the object store exists
          if (!db.objectStoreNames.contains('transfers')) {
            if (debug) {
              console.error(`[PersistenceManager ${role}] 'transfers' object store not found in IndexedDB. Database needs to be recreated.`);
            }
            
            // Check if we've recently attempted recreation to avoid loops
            const now = Date.now();
            if (now - lastRecreationAttempt.current < RECREATION_COOLDOWN) {
              if (debug) {
                console.warn(`[PersistenceManager ${role}] Database recreation attempted too recently, falling back to localStorage`);
              }
              db.close();
              resolve(false);
              return;
            }
            
            lastRecreationAttempt.current = now;
            
            // Close the current database and delete it to force recreation
            db.close();
            
            const deleteRequest = indexedDB.deleteDatabase('FileTransferStates');
            deleteRequest.onsuccess = () => {
              if (debug) {
                console.log(`[PersistenceManager ${role}] Database deleted, attempting immediate recreation`);
              }
              
              // Immediately try to recreate the database
              const recreateRequest = indexedDB.open('FileTransferStates', 2);
              
              recreateRequest.onupgradeneeded = (event) => {
                const newDb = (event.target as IDBOpenDBRequest).result;
                newDb.createObjectStore('transfers', { keyPath: 'transferId' });
                if (debug) {
                  console.log(`[PersistenceManager ${role}] Database recreated with transfers object store`);
                }
              };
              
              recreateRequest.onsuccess = (event) => {
                const newDb = (event.target as IDBOpenDBRequest).result;
                newDb.close();
                if (debug) {
                  console.log(`[PersistenceManager ${role}] Database recreation successful, falling back to localStorage for this operation`);
                }
                resolve(false); // Still fall back to localStorage for this operation
              };
              
              recreateRequest.onerror = () => {
                indexedDBFailureCount.current++;
                if (debug) {
                  console.error(`[PersistenceManager ${role}] Failed to recreate database (${indexedDBFailureCount.current}/${MAX_INDEXEDDB_FAILURES})`);
                }
                resolve(false);
              };
            };
            deleteRequest.onerror = () => {
              if (debug) {
                console.error(`[PersistenceManager ${role}] Failed to delete corrupted database`);
              }
              resolve(false);
            };
            return;
          }
          
          const transaction = db.transaction(['transfers'], 'readwrite');
          const store = transaction.objectStore('transfers');
          
          const serialized = serializeState(state);
          const putRequest = store.put(serialized);
          
          putRequest.onsuccess = () => {
            // Reset failure count on successful operation
            indexedDBFailureCount.current = 0;
            if (debug) {
              console.log(`[PersistenceManager ${role}] Saved to IndexedDB:`, { transferId });
            }
            resolve(true);
          };
          
          putRequest.onerror = () => {
            if (debug) {
              console.error(`[PersistenceManager ${role}] IndexedDB put failed`);
            }
            resolve(false);
          };
        };
      } catch (error) {
        if (debug) {
          console.error(`[PersistenceManager ${role}] IndexedDB save error:`, error);
        }
        resolve(false);
      }
    });
  }, [role, debug, serializeState]);

  // Load state from IndexedDB
  const loadFromIndexedDB = useCallback(async (transferId: string): Promise<PersistedTransferState | null> => {
    if (!storageAvailable.current.indexedDB) return null;
    
    return new Promise<PersistedTransferState | null>((resolve) => {
      try {
        const request = indexedDB.open('FileTransferStates', 2);
        
        request.onerror = () => {
          if (debug) {
            console.error(`[PersistenceManager ${role}] IndexedDB open failed`);
          }
          resolve(null);
        };
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Clear any existing object stores to ensure clean state
          for (const storeName of Array.from(db.objectStoreNames)) {
            db.deleteObjectStore(storeName);
          }
          
          // Create the transfers object store
          db.createObjectStore('transfers', { keyPath: 'transferId' });
          
          if (debug) {
            console.log(`[PersistenceManager ${role}] Created IndexedDB object store: transfers (during load)`);
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          if (!db.objectStoreNames.contains('transfers')) {
            resolve(null);
            return;
          }
          
          const transaction = db.transaction(['transfers'], 'readonly');
          const store = transaction.objectStore('transfers');
          const getRequest = store.get(transferId);
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result) {
              const state = deserializeState(result);
              if (debug) {
                console.log(`[PersistenceManager ${role}] Loaded from IndexedDB:`, { transferId, chunks: state.receivedChunks.size });
              }
              resolve(state);
            } else {
              resolve(null);
            }
          };
          
          getRequest.onerror = () => {
            if (debug) {
              console.error(`[PersistenceManager ${role}] IndexedDB get failed`);
            }
            resolve(null);
          };
        };
      } catch (error) {
        if (debug) {
          console.error(`[PersistenceManager ${role}] IndexedDB load error:`, error);
        }
        resolve(null);
      }
    });
  }, [role, debug, deserializeState]);

  // Perform the actual save operation
  const performSave = useCallback(async (transferId: string, state: PersistedTransferState): Promise<boolean> => {
    state.lastUpdateTime = Date.now();
    
    // Try IndexedDB first if preferred and available
    if (persistenceConfig.preferIndexedDB) {
      const indexedDBSuccess = await saveToIndexedDB(transferId, state);
      if (indexedDBSuccess) return true;
    }
    
    // Fallback to localStorage
    return await saveToLocalStorage(transferId, state);
  }, [persistenceConfig.preferIndexedDB, saveToIndexedDB, saveToLocalStorage]);

  // Save transfer state (with throttling)
  const saveTransferState = useCallback(async (state: PersistedTransferState): Promise<boolean> => {
    const transferId = state.transferId;
    
    // Update cache immediately
    stateCache.current.set(transferId, { ...state });
    
    // Throttle persistent saves
    if (persistenceConfig.saveThrottleMs > 0) {
      const existingThrottle = saveThrottles.current.get(transferId);
      if (existingThrottle) {
        clearTimeout(existingThrottle);
      }
      
      const throttle = setTimeout(async () => {
        await performSave(transferId, state);
        saveThrottles.current.delete(transferId);
      }, persistenceConfig.saveThrottleMs);
      
      saveThrottles.current.set(transferId, throttle);
      return true;
    } else {
      return await performSave(transferId, state);
    }
  }, [persistenceConfig.saveThrottleMs, performSave]);

  // Load transfer state
  const loadTransferState = useCallback(async (transferId: string): Promise<PersistedTransferState | null> => {
    // Check cache first
    const cached = stateCache.current.get(transferId);
    if (cached) {
      return cached;
    }
    
    // Try IndexedDB first if preferred
    let state: PersistedTransferState | null = null;
    
    if (persistenceConfig.preferIndexedDB) {
      state = await loadFromIndexedDB(transferId);
    }
    
    // Fallback to localStorage
    if (!state) {
      state = await loadFromLocalStorage(transferId);
    }
    
    // Cache if found
    if (state) {
      stateCache.current.set(transferId, state);
    }
    
    return state;
  }, [persistenceConfig.preferIndexedDB, loadFromIndexedDB, loadFromLocalStorage]);

  // Create initial transfer state
  const createTransferState = useCallback((
    transferId: string,
    fileName: string,
    fileSize: number,
    totalChunks: number,
    options: {
      fileHash?: string;
      chunkSize?: number;
      adaptiveChunking?: boolean;
      storageMethod?: 'memory' | 'filesystem';
      fileHandle?: FileSystemFileHandle;
    } = {}
  ): PersistedTransferState => {
    const state: PersistedTransferState = {
      transferId,
      fileName,
      fileSize,
      fileHash: options.fileHash,
      receivedChunks: new Set(),
      totalChunks,
      bytesReceived: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      role,
      chunkSize: options.chunkSize || 64 * 1024,
      adaptiveChunking: options.adaptiveChunking || false,
      storageMethod: options.storageMethod || 'memory',
      fileHandle: options.fileHandle,
      verifiedChunks: new Set(),
      chunkHashes: options.fileHash ? new Map() : undefined,
      resumeAttempts: 0
    };
    
    return state;
  }, [role]);

  // Update chunk received
  const markChunkReceived = useCallback(async (
    transferId: string,
    chunkIndex: number,
    chunkSize: number,
    verified: boolean = true,
    chunkHash?: string
  ): Promise<boolean> => {
    const state = await loadTransferState(transferId);
    if (!state) return false;
    
    // Add to received chunks
    state.receivedChunks.add(chunkIndex);
    state.bytesReceived += chunkSize;
    
    // Mark as verified if integrity check passed
    if (verified) {
      state.verifiedChunks.add(chunkIndex);
      
      // Store chunk hash if provided
      if (chunkHash && state.chunkHashes) {
        state.chunkHashes.set(chunkIndex, chunkHash);
      }
    }
    
    return await saveTransferState(state);
  }, [loadTransferState, saveTransferState]);

  // Check if transfer can be resumed
  const canResumeTransfer = useCallback(async (transferId: string): Promise<boolean> => {
    const state = await loadTransferState(transferId);
    if (!state) return false;
    
    // Check age
    const age = Date.now() - state.startTime;
    if (age > persistenceConfig.maxStateAge) return false;
    
    // Check resume attempts
    if (state.resumeAttempts >= persistenceConfig.maxResumeAttempts) return false;
    
    // Must have some progress but not be complete
    const progress = state.receivedChunks.size / state.totalChunks;
    return progress > 0 && progress < 1;
  }, [loadTransferState, persistenceConfig.maxStateAge, persistenceConfig.maxResumeAttempts]);

  // Get missing chunks for resumption
  const getMissingChunks = useCallback(async (transferId: string): Promise<number[]> => {
    const state = await loadTransferState(transferId);
    if (!state) return [];
    
    const missing: number[] = [];
    for (let i = 0; i < state.totalChunks; i++) {
      if (!state.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }, [loadTransferState]);

  // Clean up old transfer states
  const cleanupOldStates = useCallback(async (): Promise<number> => {
    const cutoff = Date.now() - persistenceConfig.maxStateAge;
    let cleaned = 0;
    
    // Clean localStorage
    if (storageAvailable.current.localStorage) {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`file_transfer_state_${role}_`)) {
          try {
            const json = localStorage.getItem(key);
            if (json) {
              const state: SerializedTransferState = JSON.parse(json);
              if (state.lastUpdateTime < cutoff || state.resumeAttempts >= persistenceConfig.maxResumeAttempts) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // Invalid state, remove it
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        cleaned++;
      });
    }
    
    // Clean cache
    const cacheEntries = Array.from(stateCache.current.entries());
    for (const [transferId, state] of cacheEntries) {
      if (state.lastUpdateTime < cutoff || state.resumeAttempts >= persistenceConfig.maxResumeAttempts) {
        stateCache.current.delete(transferId);
      }
    }
    
    if (debug && cleaned > 0) {
      console.log(`[PersistenceManager ${role}] Cleaned up ${cleaned} old transfer states`);
    }
    
    return cleaned;
  }, [role, debug, persistenceConfig.maxStateAge, persistenceConfig.maxResumeAttempts]);

  // Remove specific transfer state
  const removeTransferState = useCallback(async (transferId: string): Promise<void> => {
    // Remove from cache
    stateCache.current.delete(transferId);
    
    // Remove throttled save if any
    const throttle = saveThrottles.current.get(transferId);
    if (throttle) {
      clearTimeout(throttle);
      saveThrottles.current.delete(transferId);
    }
    
    // Remove from localStorage
    if (storageAvailable.current.localStorage) {
      const key = getStorageKey(transferId);
      localStorage.removeItem(key);
    }
    
    // Remove from IndexedDB
    if (storageAvailable.current.indexedDB) {
      try {
        const request = indexedDB.open('FileTransferStates', 2);
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (db.objectStoreNames.contains('transfers')) {
            const transaction = db.transaction(['transfers'], 'readwrite');
            const store = transaction.objectStore('transfers');
            store.delete(transferId);
          }
        };
      } catch {
        // Ignore IndexedDB errors during cleanup
      }
    }
    
    if (debug) {
      console.log(`[PersistenceManager ${role}] Removed transfer state:`, transferId);
    }
  }, [role, debug, getStorageKey]);

  return {
    // Transfer state management
    createTransferState,
    saveTransferState,
    loadTransferState,
    removeTransferState,
    
    // Progress tracking
    markChunkReceived,
    
    // Resumption support
    canResumeTransfer,
    getMissingChunks,
    
    // Cleanup
    cleanupOldStates,
    
    // Configuration
    config: persistenceConfig
  };
}
