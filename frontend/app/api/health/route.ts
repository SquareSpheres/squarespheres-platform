import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Check Vercel's status API with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const vercelStatusResponse = await fetch('https://www.vercel-status.com/api/v2/status.json', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'SquareSpheres-Health-Check'
      }
    })

    clearTimeout(timeoutId)

    if (!vercelStatusResponse.ok) {
      throw new Error(`Vercel status API returned ${vercelStatusResponse.status}`)
    }

    const vercelStatus = await vercelStatusResponse.json()
    const isHealthy = vercelStatus.status?.indicator === 'none'
    const status = isHealthy ? 'healthy' : 'degraded'

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      vercel: {
        healthy: isHealthy,
        indicator: vercelStatus.status?.indicator,
        description: vercelStatus.status?.description,
        name: vercelStatus.status?.name,
        apiReachable: true
      },
      message: isHealthy 
        ? 'Vercel services are operational' 
        : vercelStatus.status?.description || 'Vercel services are experiencing issues'
    }, {
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
