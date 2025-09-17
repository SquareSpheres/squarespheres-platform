'use client'

import { useEffect, useRef, useState } from 'react'
import streamSaver from 'streamsaver'

export interface StreamSaverWriter {
  write: (chunk: Uint8Array) => Promise<void>
  close: () => Promise<void>
  abort: (reason?: any) => Promise<void>
  bytesWritten: number
}

export function useStreamSaver() {
  const [isInitialized, setIsInitialized] = useState(false)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const bytesWrittenRef = useRef(0)

  // Initialize StreamSaver and handle service worker control issues
  useEffect(() => {
    if (typeof window !== 'undefined') {
      streamSaver.mitm = '/mitm.html'
      
      // Check if service worker is properly controlling the page
      const checkAndFixServiceWorker = async () => {
        if (!navigator.serviceWorker) {
          setIsInitialized(true)
          return
        }

        try {
          const registration = await navigator.serviceWorker.getRegistration('/')
          
          // If we have an active service worker but it's not controlling this page
          if (registration && registration.active && !navigator.serviceWorker.controller) {
            console.log('Service worker exists but not controlling page, attempting to fix...')
            
            // Try to claim control
            registration.active.postMessage({ type: 'CLAIM_CLIENTS' })
            
            // Wait briefly for controller change
            await new Promise(resolve => {
              const timeout = setTimeout(resolve, 1000)
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                clearTimeout(timeout)
                resolve(undefined)
              }, { once: true })
            })
            
            // If still not controlling, this page load is problematic but we continue
            if (!navigator.serviceWorker.controller) {
              console.warn('Service worker could not claim control, downloads may fail until page refresh')
            }
          }
        } catch (error) {
          console.warn('Error checking service worker:', error)
        }
        
        setIsInitialized(true)
      }
      
      checkAndFixServiceWorker()
    }
  }, [])

  const createStream = async (filename: string, size?: number): Promise<StreamSaverWriter> => {
    if (!isInitialized) {
      throw new Error('StreamSaver not initialized')
    }

    if (writerRef.current) {
      throw new Error('Stream already active. Close current stream before creating a new one.')
    }

    bytesWrittenRef.current = 0

    // Try to create stream with automatic retry for service worker issues
    const attemptCreateStream = async (attempt: number = 1): Promise<WritableStreamDefaultWriter<Uint8Array>> => {
      try {
        const fileStream = streamSaver.createWriteStream(filename, { size })
        const writer = fileStream.getWriter()
        return writer
      } catch (error) {
        // If first attempt fails and we have service worker, try to fix control issue
        if (attempt === 1 && navigator.serviceWorker) {
          console.log('Stream creation failed, checking service worker control...')
          
          try {
            const registration = await navigator.serviceWorker.getRegistration('/')
            if (registration && registration.active && !navigator.serviceWorker.controller) {
              console.log('Service worker not controlling, attempting to claim...')
              registration.active.postMessage({ type: 'CLAIM_CLIENTS' })
              
              // Wait briefly for control
              await new Promise(resolve => {
                const timeout = setTimeout(resolve, 1500)
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  clearTimeout(timeout)
                  resolve(undefined)
                }, { once: true })
              })
              
              // Retry stream creation
              if (navigator.serviceWorker.controller) {
                console.log('Service worker now controlling, retrying stream creation...')
                return attemptCreateStream(2)
              }
            }
          } catch (swError) {
            console.warn('Error during service worker fix attempt:', swError)
          }
        }
        
        throw error
      }
    }

    const writer = await attemptCreateStream()
    writerRef.current = writer

    return {
      write: async (chunk: Uint8Array) => {
        if (!writerRef.current) {
          throw new Error('Stream closed')
        }
        await writerRef.current.write(chunk)
        bytesWrittenRef.current += chunk.byteLength
      },

      close: async () => {
        if (writerRef.current) {
          await writerRef.current.close()
          writerRef.current = null
        }
      },

      abort: async (reason?: any) => {
        if (writerRef.current) {
          await writerRef.current.abort(reason)
          writerRef.current = null
        }
      },

      get bytesWritten() {
        return bytesWrittenRef.current
      }
    }
  }

  const isStreamActive = () => {
    return writerRef.current !== null
  }

  const getBytesWritten = () => {
    return bytesWrittenRef.current
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (writerRef.current) {
        writerRef.current.abort('Component unmounted')
        writerRef.current = null
      }
    }
  }, [])

  return {
    createStream,
    isInitialized,
    isStreamActive,
    getBytesWritten
  }
}
