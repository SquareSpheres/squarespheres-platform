/* global self ReadableStream Response */

// Version 1.0.7 - Firefox debugging
console.log('Service worker script loaded - Firefox debugging enabled');
console.log('User agent:', navigator.userAgent);

self.addEventListener('install', (event) => {
    console.log('Service worker installing...');
    // Always skip waiting to ensure immediate activation
    self.skipWaiting()
  })
  
  self.addEventListener('activate', event => {
    console.log('Service worker activating...');
    event.waitUntil(
      self.clients.claim().then(() => {
        console.log('Service worker now controlling all clients');
      }).catch(error => {
        console.error('Failed to claim clients during activation:', error);
      })
    )
  })
  
  const map = new Map()
  
  // Debug message events
  console.log('Setting up message handlers...');
  
  // Test message handler
  self.addEventListener('message', (event) => {
    console.log('🔥 FIREFOX: Service worker received message via addEventListener:', event.data);
    console.log('🔥 FIREFOX: Event source:', event.source);
    console.log('🔥 FIREFOX: Event ports:', event.ports);
    
    // Handle CLAIM_CLIENTS message to force control of all clients
    if (event.data && event.data.type === 'CLAIM_CLIENTS') {
      console.log('Claiming all clients...');
      event.waitUntil(self.clients.claim().then(() => {
        console.log('Successfully claimed all clients');
      }).catch(error => {
        console.error('Failed to claim clients:', error);
      }));
      return;
    }
    
    // Handle test messages
    if (event.data && event.data.type === 'TEST_MESSAGE') {
      console.log('🔥 FIREFOX: Received test message via addEventListener:', event.data.message);
      return;
    }
    
    // Firefox sometimes uses addEventListener for StreamSaver messages
    // Handle download messages here too for Firefox compatibility
    if (event.data && event.ports && event.ports.length > 0) {
      console.log('🔥 FIREFOX: Processing download via addEventListener (Firefox compatibility)');
      processDownloadRequest(event);
    }
  });
  
  console.log('addEventListener message handler set up');
  
  // Firefox fallback - sometimes the message event doesn't work in dev mode
  // Set up a polling mechanism as a backup
  if (navigator.userAgent.toLowerCase().includes('firefox')) {
    console.log('🔥 FIREFOX: Setting up Firefox-specific message polling fallback');
    
    // Check for messages via BroadcastChannel as fallback
    try {
      const channel = new BroadcastChannel('streamsaver-firefox-fallback');
      channel.onmessage = (event) => {
        console.log('🔥 FIREFOX: Received message via BroadcastChannel:', event.data);
        if (event.data.type === 'TEST_MESSAGE') {
          console.log('🔥 FIREFOX: Test message received via BroadcastChannel');
        }
      };
      console.log('🔥 FIREFOX: BroadcastChannel fallback set up');
    } catch (error) {
      console.log('🔥 FIREFOX: BroadcastChannel not available:', error);
    }
  }
  
  // Extract download processing logic for reuse
  function processDownloadRequest(event) {
    const data = event.data
    const downloadUrl = data.url || self.registration.scope + Math.random() + '/' + (typeof data === 'string' ? data : data.filename)
    const port = event.ports[0]
    const metadata = new Array(3) // [stream, data, port]

    console.log('Processing download request for URL:', downloadUrl);
    console.log('Data:', data);
    console.log('Port:', port);

    metadata[1] = data
    metadata[2] = port
  
    // Note to self:
    // old streamsaver v1.2.0 might still use `readableStream`...
    // but v2.0.0 will always transfer the stream through MessageChannel #94
    if (event.data.readableStream) {
      console.log('Using direct readableStream');
      metadata[0] = event.data.readableStream
    } else if (event.data.transferringReadable) {
      console.log('Waiting for transferringReadable stream');
      port.onmessage = evt => {
        console.log('Received readableStream from port:', evt.data);
        port.onmessage = null
        metadata[0] = evt.data.readableStream
      }
    } else {
      console.log('Creating stream via port');
      metadata[0] = createStream(port)
    }
  
    console.log('Storing in map - URL:', downloadUrl, 'Metadata:', metadata);
    map.set(downloadUrl, metadata)
    console.log('Map after storing:', Array.from(map.keys()));
    port.postMessage({ download: downloadUrl })
  }

  // This should be called once per download
  // Each event has a dataChannel that the data will be piped through
  self.onmessage = event => {
    console.log('Service worker received message via onmessage:', event.data);
    // We send a heartbeat every x second to keep the
    // service worker alive if a transferable stream is not sent
    if (event.data === 'ping') {
      return
    }
    
    // Handle test messages and other non-download messages
    if (event.data && typeof event.data === 'object') {
      if (event.data.type === 'TEST_MESSAGE') {
        console.log('Received test message:', event.data.message);
        return
      }
      if (event.data.type === 'CLAIM_CLIENTS') {
        // Already handled in addEventListener above
        return
      }
    }
    
    // Only process actual download messages (must have ports for MessageChannel)
    if (!event.ports || event.ports.length === 0) {
      console.log('Ignoring message without ports:', event.data);
      return
    }

    processDownloadRequest(event)
  }
  
  function createStream (port) {
    // ReadableStream is only supported by chrome 52
    return new ReadableStream({
      start (controller) {
        // When we receive data on the messageChannel, we write
        port.onmessage = ({ data }) => {
          if (data === 'end') {
            return controller.close()
          }
  
          if (data === 'abort') {
            controller.error('Aborted the download')
            return
          }
  
          controller.enqueue(data)
        }
      },
      cancel (reason) {
        console.log('user aborted', reason)
        port.postMessage({ abort: true })
      }
    })
  }
  
  self.addEventListener('fetch', event => {
    const url = event.request.url
    console.log('Service worker fetch intercepted:', url);
  
    // this only works for Firefox
    if (url.endsWith('/ping')) {
      return event.respondWith(new Response('pong'))
    }
  
    const hijacke = map.get(url)
    console.log('Looking for hijack for URL:', url, 'Found:', !!hijacke);
    console.log('Current map keys:', Array.from(map.keys()));
    console.log('Map size:', map.size);

    if (!hijacke) {
      console.log('No hijack found, returning 404');
      return
    }
  
    const [ stream, data, port ] = hijacke
  
    map.delete(url)
  
    // Not comfortable letting any user control all headers
    // so we only copy over the length & disposition
    const responseHeaders = new Headers({
      'Content-Type': 'application/octet-stream; charset=utf-8',
  
      // To be on the safe side, The link can be opened in a iframe.
      // but octet-stream should stop it.
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Security-Policy': "default-src 'none'",
      'X-WebKit-CSP': "default-src 'none'",
      'X-XSS-Protection': '1; mode=block'
    })
  
    let headers = new Headers(data.headers || {})
  
    if (headers.has('Content-Length')) {
      responseHeaders.set('Content-Length', headers.get('Content-Length'))
    }
  
    if (headers.has('Content-Disposition')) {
      responseHeaders.set('Content-Disposition', headers.get('Content-Disposition'))
    }
  
    // data, data.filename and size should not be used anymore
    if (data.size) {
      console.warn('Depricated')
      responseHeaders.set('Content-Length', data.size)
    }
  
    let fileName = typeof data === 'string' ? data : data.filename
    if (fileName) {
      console.warn('Depricated')
      // Make filename RFC5987 compatible
      fileName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A')
      responseHeaders.set('Content-Disposition', "attachment; filename*=UTF-8''" + fileName)
    }
  
    event.respondWith(new Response(stream, { headers: responseHeaders }))
  
    port.postMessage({ debug: 'Download started' })
  })
  
  