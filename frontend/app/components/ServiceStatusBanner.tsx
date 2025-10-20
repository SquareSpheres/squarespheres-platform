'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X, RefreshCw } from 'lucide-react'

interface ServiceStatus {
  isHealthy: boolean
  errorCount: number
  lastError?: string
  isApiUnreachable?: boolean
  severity?: 'healthy' | 'degraded' | 'critical'
  vercelData?: {
    healthy: boolean
    indicator: string
    description: string
    name: string
    apiReachable: boolean
    incidents?: {
      active: number
      items: Array<{
        id: string
        name: string
        impact: string
        status: string
      }>
    }
    components?: {
      summary: Record<string, number>
      total: number
    }
  }
}

export function ServiceStatusBanner() {
  const [status, setStatus] = useState<ServiceStatus>({ isHealthy: true, errorCount: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [healthCheckFailed, setHealthCheckFailed] = useState(false)

  useEffect(() => {
    let healthCheckInterval: NodeJS.Timeout
    
    // Check service health on mount and periodically
    const checkHealth = async () => {
      try {
        // Add timeout to detect if API is unreachable
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        const response = await fetch('/api/health', { 
          cache: 'no-store',
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        const health = await response.json()
        
        const isHealthy = response.ok && health.status === 'healthy'
        
        setStatus(prevStatus => ({
          isHealthy,
          errorCount: isHealthy ? 0 : prevStatus.errorCount + 1,
          lastError: isHealthy ? undefined : health.message,
          isApiUnreachable: false,
          severity: health.status || 'degraded',
          vercelData: health.vercel
        }))

        console.log(health)
        
        setIsVisible(!isHealthy)
        setHealthCheckFailed(false)
      } catch (error) {
        console.warn('Health check failed:', error)
        
        // Track consecutive failures to prevent infinite retries
        setHealthCheckFailed(true)
        
        // If it's an abort error or network error, the API itself is likely unreachable
        const isApiUnreachable = error instanceof Error && (
          error.name === 'AbortError' || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError')
        )
        
        setStatus(prevStatus => ({
          isHealthy: false,
          errorCount: prevStatus.errorCount + 1,
          lastError: isApiUnreachable 
            ? 'Service connectivity issues - API unreachable'
            : 'Unable to check service status',
          isApiUnreachable,
          severity: isApiUnreachable ? 'critical' : 'degraded'
        }))
        setIsVisible(true)
      }
    }

    // Initial check
    checkHealth()

    // Check every 10 minutes - more reasonable for status monitoring
    const intervalTime = 600000 // 10 minutes
    healthCheckInterval = setInterval(checkHealth, intervalTime)

    return () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval)
      }
    }
  }, [])

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      // Force reload the page to retry loading assets
      window.location.reload()
    } catch (error) {
      console.error('Retry failed:', error)
    } finally {
      setIsRetrying(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
  }

  // Always render the banner, but use transform to show/hide it

  const isCritical = status.severity === 'critical'
  const bgColor = isCritical 
    ? 'bg-red-100 border-red-200 dark:bg-red-900/20 dark:border-red-800'
    : 'bg-orange-100 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
  const textColor = isCritical
    ? 'text-red-800 dark:text-red-200'
    : 'text-orange-800 dark:text-orange-200'
  const subTextColor = isCritical
    ? 'text-red-700 dark:text-red-300'
    : 'text-orange-700 dark:text-orange-300'
  const iconColor = isCritical
    ? 'text-red-600 dark:text-red-400'
    : 'text-orange-600 dark:text-orange-400'
  const buttonColor = isCritical
    ? 'text-red-800 bg-red-200 hover:bg-red-300 dark:text-red-200 dark:bg-red-800 dark:hover:bg-red-700'
    : 'text-orange-800 bg-orange-200 hover:bg-orange-300 dark:text-orange-200 dark:bg-orange-800 dark:hover:bg-orange-700'
  const dismissColor = isCritical
    ? 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200'
    : 'text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-200'

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 border-t ${bgColor} transform transition-transform duration-300 ease-in-out ${isVisible && !status.isHealthy ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${textColor}`}>
                {status.isApiUnreachable 
                  ? 'Critical service connectivity issues' 
                  : status.vercelData?.description || (isCritical 
                    ? 'Critical Vercel infrastructure issues'
                    : 'Vercel services experiencing issues')
                }
              </p>
              <p className={`text-xs mt-1 ${subTextColor}`}>
                {status.isApiUnreachable 
                  ? 'Unable to reach our service health endpoint - likely CDN or hosting issues.'
                  : status.vercelData?.incidents?.active 
                    ? `${status.vercelData.incidents.active} active incident${status.vercelData.incidents.active > 1 ? 's' : ''} affecting services${status.vercelData.incidents.items.length > 0 ? ` - ${status.vercelData.incidents.items[0].name}` : ''}.`
                    : isCritical
                    ? 'Vercel status API unreachable - severe infrastructure issues affecting all services.'
                    : status.vercelData?.description || 'Our hosting provider is experiencing issues. Some features may not work properly.'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${buttonColor}`}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
            <button
              onClick={handleDismiss}
              className={dismissColor}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
