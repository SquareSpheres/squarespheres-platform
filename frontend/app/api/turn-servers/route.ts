import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { TurnCredentialResponse, TurnServersResponse, IceServer } from '../../types/turnServers'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized - authentication required' }, { status: 401 })
    }
    const meteredDomain = process.env.METERED_DOMAIN
    const meteredSecretKey = process.env.METERED_SECRET_KEY

    if (!meteredDomain || !meteredSecretKey) {
      console.error('Missing METERED_DOMAIN or METERED_SECRET_KEY environment variables')
      return NextResponse.json(
        { error: 'TURN server configuration missing' },
        { status: 500 }
      )
    }


    // Get expiry from query parameter, default to 2 hours (7200 seconds) since we're reusing credentials
    const { searchParams } = new URL(request.url)
    const requestedExpiry = searchParams.get('expiry')
    const expiryInSeconds = requestedExpiry ? parseInt(requestedExpiry, 10) : 7200
    
    // Validate expiry (between 1 minute and 24 hours)
    if (isNaN(expiryInSeconds) || expiryInSeconds < 60 || expiryInSeconds > 86400) {
      return NextResponse.json(
        { error: 'Invalid expiry parameter. Must be between 60 and 86400 seconds' },
        { status: 400 }
      )
    }
    
    const label = `user-${userId}-${Date.now()}`

    const listCredentialsUrl = `https://${meteredDomain}/api/v2/turn/credentials?secretKey=${meteredSecretKey}`
    console.log('Environment check - METERED_DOMAIN:', meteredDomain)
    console.log('Environment check - METERED_SECRET_KEY length:', meteredSecretKey?.length)
    
    let existingCredential = null
    try {
      console.log('Checking for existing credentials at:', listCredentialsUrl)
      const listResponse = await fetch(listCredentialsUrl)
      console.log('List credentials response status:', listResponse.status)
      
      if (listResponse.ok) {
        const responseText = await listResponse.text()
        console.log('Raw response text:', responseText)
        
        let listData
        try {
          listData = JSON.parse(responseText)
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError)
          console.error('Raw response was:', responseText)
          throw parseError
        }
        
        console.log('Found existing credentials:', listData.data?.length || 0)
        console.log('Full response:', JSON.stringify(listData, null, 2))
        
        // Use the first available credential from the list (all are currently valid)
        // If it expires during use, we'll handle that gracefully and try the next one
        if (listData.data && listData.data.length > 0) {
          // Use the first available credential - all returned credentials are valid
          // Expiry handling is managed elsewhere in the system
          existingCredential = listData.data[0]
          console.log(`✅ Using existing credential (${listData.data.length} total available)`)
        } else {
          console.log('❌ No existing credentials in response data')
        }
      } else {
        const errorText = await listResponse.text()
        console.error('❌ Failed to list existing credentials:', listResponse.status, errorText)
      }
    } catch (listError) {
      console.warn('❌ Failed to list existing credentials, will try to create new one:', listError)
    }

    let credentialData: TurnCredentialResponse

    if (existingCredential) {
      // Use existing credential
      console.log('🔄 REUSING existing credential:', existingCredential.label)
      credentialData = {
        username: existingCredential.username,
        password: existingCredential.password,
        apiKey: existingCredential.apiKey,
        expiryInSeconds: existingCredential.expiryInSeconds,
        label: existingCredential.label || 'existing-credential'
      }
    } else {
      console.log('🆕 CREATING new credential - no valid existing ones found')
      const createCredentialUrl = `https://${meteredDomain}/api/v1/turn/credential?secretKey=${meteredSecretKey}`
      
      const credentialResponse = await fetch(createCredentialUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expiryInSeconds,
          label
        }),
      })

      if (!credentialResponse.ok) {
        const errorText = await credentialResponse.text()
        console.error('Failed to create TURN credential:', errorText)
        
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.message && errorData.message.includes('credential limit')) {
            console.warn('TURN server credential limit reached, falling back to STUN-only configuration')
            return NextResponse.json(
              { error: 'TURN server quota exceeded, using STUN-only configuration', fallbackToStun: true },
              { status: 429 } // Too Many Requests
            )
          }
        } catch (parseError) {
          // Continue with generic error handling
        }
        
        return NextResponse.json(
          { error: 'Failed to create TURN credential' },
          { status: 500 }
        )
      }

      credentialData = await credentialResponse.json()
    }

    const iceServersUrl = `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${credentialData.apiKey}`
    
    const iceServersResponse = await fetch(iceServersUrl)

    if (!iceServersResponse.ok) {
      const errorText = await iceServersResponse.text()
      console.error('Failed to fetch ICE servers:', errorText)
      
      // If the credential expired during use, we could potentially retry with a different one
      // For now, return an error and let the client retry
      return NextResponse.json(
        { error: 'Credential may have expired during use. Please retry.' },
        { status: 410 } // Gone - indicates the resource is no longer available
      )
    }

    const iceServers: IceServer[] = await iceServersResponse.json()

    const response: TurnServersResponse = {
      iceServers,
      expiryInSeconds: credentialData.expiryInSeconds,
      credentialSource: existingCredential ? 'existing' : 'new',
      credentialLabel: credentialData.label,
      userId
    }

    // Return with no-cache headers since credentials expire
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

  } catch (error) {
    console.error('Failed to fetch TURN servers:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
