import { NextResponse } from 'next/server'

interface VercelStatusAPI {
  status?: {
    indicator: string
    description: string
    name?: string
  }
  page?: {
    name: string
    url: string
    time_zone: string
    updated_at: string
  }
  components?: Array<{
    id: string
    name: string
    status: string
    description?: string
  }>
  incidents?: Array<{
    id: string
    name: string
    status: string
    impact: string
    shortlink: string
    created_at: string
    updated_at: string
    monitoring_at?: string
    resolved_at?: string
  }>
}

async function fetchVercelAPI(endpoint: string, controller: AbortController): Promise<any> {
  const response = await fetch(`https://www.vercel-status.com/api/v2/${endpoint}.json`, {
    method: 'GET',
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      'User-Agent': 'SquareSpheres-Health-Check'
    }
  })

  if (!response.ok) {
    throw new Error(`Vercel ${endpoint} API returned ${response.status}`)
  }

  return response.json()
}

export async function GET() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    // Fetch multiple endpoints in parallel for richer data
    const [statusData, summaryData, componentsData, incidentsData] = await Promise.allSettled([
      fetchVercelAPI('status', controller),
      fetchVercelAPI('summary', controller),
      fetchVercelAPI('components', controller),
      fetchVercelAPI('incidents/unresolved', controller)
    ])

    clearTimeout(timeoutId)

    // Extract data from successful responses
    const status = statusData.status === 'fulfilled' ? statusData.value as VercelStatusAPI : null
    const summary = summaryData.status === 'fulfilled' ? summaryData.value as VercelStatusAPI : null
    const components = componentsData.status === 'fulfilled' ? componentsData.value as VercelStatusAPI : null
    const incidents = incidentsData.status === 'fulfilled' ? incidentsData.value as VercelStatusAPI : null

    // Log the raw responses for debugging
    console.log('Vercel API Responses:', {
      status: statusData.status,
      summary: summaryData.status,
      components: componentsData.status,
      incidents: incidentsData.status,
      statusData: statusData.status === 'fulfilled' ? statusData.value : statusData.reason,
      incidentsData: incidentsData.status === 'fulfilled' ? incidentsData.value : incidentsData.reason
    })

    // Determine overall health based on status indicator and unresolved incidents
    const statusIndicator = status?.status?.indicator || 'unknown'
    const hasUnresolvedIncidents = incidents?.incidents && incidents.incidents.length > 0
    const isHealthy = statusIndicator === 'none' && !hasUnresolvedIncidents

    // Determine severity based on status and incidents
    let severity: 'healthy' | 'degraded' | 'critical' = 'healthy'
    let message = 'Vercel services are operational'

    if (!isHealthy) {
      if (statusIndicator === 'critical' || (incidents?.incidents?.some(inc => inc.impact === 'critical'))) {
        severity = 'critical'
        message = status?.status?.description || 'Critical infrastructure issues affecting all services'
      } else {
        severity = 'degraded'
        message = status?.status?.description || 'Vercel services are experiencing issues'
      }
    }

    // Get component status summary
    const componentStatus = components?.components?.reduce((acc, comp) => {
      acc[comp.status] = (acc[comp.status] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    // Get active incidents summary
    const activeIncidents = incidents?.incidents?.map(inc => ({
      id: inc.id,
      name: inc.name,
      impact: inc.impact,
      status: inc.status,
      shortlink: inc.shortlink,
      created_at: inc.created_at
    })) || []

    const responseData = {
      status: severity,
      timestamp: new Date().toISOString(),
      vercel: {
        healthy: isHealthy,
        indicator: statusIndicator,
        description: status?.status?.description || message,
        name: status?.status?.name || summary?.page?.name || 'Vercel',
        apiReachable: true,
        pageInfo: summary?.page ? {
          name: summary.page.name,
          url: summary.page.url,
          timeZone: summary.page.time_zone,
          lastUpdated: summary.page.updated_at
        } : undefined,
        components: {
          summary: componentStatus,
          total: components?.components?.length || 0
        },
        incidents: {
          active: activeIncidents.length,
          items: activeIncidents
        }
      },
      message
    }

    // Log the final response being sent to client
    console.log('Health API Response:', JSON.stringify(responseData, null, 2))

    return NextResponse.json(responseData, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    })

  } catch (error) {
    // If we can't reach Vercel's status API, this indicates serious infrastructure issues
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    const isNetworkError = error instanceof Error && (
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')
    )

    const severity = isTimeout || isNetworkError ? 'critical' : 'degraded'
    const description = isTimeout 
      ? 'Vercel status API timeout - infrastructure issues likely'
      : isNetworkError
      ? 'Vercel status API unreachable - severe infrastructure issues'
      : 'Unable to check Vercel status'

    return NextResponse.json({
      status: severity,
      timestamp: new Date().toISOString(),
      vercel: {
        healthy: false,
        indicator: 'critical',
        description,
        apiReachable: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      message: description
    }, {
      status: severity === 'critical' ? 503 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    })
  }
}
