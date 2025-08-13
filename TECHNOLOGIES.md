# Technologies Used

## Frontend
- **Next.js 14** - React framework
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Framer Motion** - Animation library
- **QRCode** - QR code generation

## Backend
- **ASP.NET Core 9.0** - Web framework
- **C# 12** - Programming language
- **WebSocket** - Real-time communication protocol
- **FluentValidation** - Input validation library
- **Nanoid** - ID generation

## WebAssembly
- **Rust** - Programming language
- **wasm-bindgen** - Rust to WebAssembly binding
- **wasm-pack** - Build tool for Rust WASM
- **serde** - Serialization framework
- **sha2** - Hashing library
- **hex** - Hexadecimal encoding

## Infrastructure & DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Make** - Build automation
- **Nginx** - Web server (local development)

## Development Tools
- **Node.js 18+** - JavaScript runtime
- **npm** - Package manager
- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixing

## Testing
- **NUnit** - .NET testing framework
- **Moq** - .NET mocking library

## External Services
- **STUN Server** - NAT traversal (Google's public STUN)
- **TURN Server** - Relay server for NAT traversal (planned)
- **Cloudflare** - DNS and reverse proxy
  - **DNS Management** - Primary DNS provider for custom domain
  - **Reverse Proxy** - Built-in security features including DDoS protection
  - **Rate Limiting** - Traffic control and abuse prevention
  - **SSL/TLS Termination** - Automatic certificate management
  - **CDN** - Global content delivery network

## Build & Deployment
- **Vercel** - Frontend hosting
- **Fly.io** - Cloud deployment platform (signaling server)
- **GitHub Actions** - CI/CD pipeline
  - **Testing & Formatting** - Automated testing and code formatting
  - **Docker Image Creation** - Multi-stage builds for frontend and signaling server
  - **Container Registry** - GitHub Container Registry (ghcr.io) integration
  - **Fly.io Deployment** - Direct deployment to Fly.io via flyctl CLI
  - **Multi-language Support** - Node.js, Rust (WASM), and .NET Core builds
