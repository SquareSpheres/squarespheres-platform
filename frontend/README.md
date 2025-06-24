# SquareSpheres Platform Frontend

This is the Next.js frontend for the SquareSpheres Platform, featuring WebAssembly (Rust) and WebRTC signaling capabilities.

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **WASM**: Rust compiled to WebAssembly
- **Signaling**: WebSocket-based WebRTC signaling

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the WASM files (output will be in `frontend/wasm-module/`):
   ```bash
   make build-wasm
   ```
   > Note: The `wasm-module/` directory is created and populated by the build step. No files are copied to `public/wasm`.

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Building for Production

```bash
npm run build
npm start
```

## Vercel Deployment

### Prerequisites

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

### Deployment Steps

1. **Deploy the frontend:**
   ```bash
   vercel --prod
   ```

2. **Configure environment variables** (if needed):
   - Go to your Vercel dashboard
   - Navigate to your project settings
   - Add any required environment variables

3. **Update signaling server URL:**
   - Edit `vercel.json` and update the `destination` URL in the rewrites section to point to your deployed signaling server

### Important Notes

- **WASM Files**: The WASM files are built to `frontend/wasm-module/`. Ensure you have run `make build-wasm` before deploying. No files are required in `public/wasm`.
- **Signaling Server**: The frontend expects a WebSocket signaling server. Update the `vercel.json` configuration to point to your deployed signaling server
- **CORS Headers**: The configuration includes necessary CORS headers for WASM functionality

### Custom Domain (Optional)

1. In your Vercel dashboard, go to your project settings
2. Navigate to "Domains"
3. Add your custom domain and follow the DNS configuration instructions

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles with Tailwind
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page component
├── wasm-module/           # WebAssembly files (output from build)
├── public/                # Static assets
├── next.config.js         # Next.js configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
├── vercel.json            # Vercel deployment configuration
└── package.json           # Dependencies and scripts
```

## Features

- **WebAssembly Integration**: Load and interact with Rust-compiled WASM modules (from `wasm-module/`)
- **WebRTC Signaling**: Real-time WebSocket communication for WebRTC peer connections
- **Modern UI**: Responsive design with Tailwind CSS
- **TypeScript**: Full type safety throughout the application
- **Vercel Optimized**: Configured for optimal deployment on Vercel

## Troubleshooting

### WASM Loading Issues

- Ensure you have run `make build-wasm` to generate the `wasm-module/` directory and files
- Check browser console for CORS errors
- Verify the WASM module is properly compiled for web target

### WebSocket Connection Issues

- Verify the signaling server is running and accessible
- Check the WebSocket URL configuration
- Ensure proper CORS settings on the signaling server

### Build Issues

- Clear `.next` directory: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run lint` 