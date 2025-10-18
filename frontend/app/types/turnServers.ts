export interface IceServer {
  urls: string
  username?: string
  credential?: string
}

export interface TurnServersResponse {
  iceServers: IceServer[]
  expiryInSeconds: number
  credentialSource?: 'existing' | 'new'
  credentialLabel?: string
  userId?: string
}

export interface TurnCredentialResponse {
  username: string
  password: string
  expiryInSeconds: number
  label: string
  apiKey: string
}

export interface RTCIceServer {
  urls: string | string[]
  username?: string
  credential?: string
}
