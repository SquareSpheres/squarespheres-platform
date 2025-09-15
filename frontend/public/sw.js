/* global self ReadableStream Response */

// Version 1.0.3 - Fix Firefox fetch handler
console.log('Service worker script loaded');

self.addEventListener('install', () => {
    console.log('Service worker installing...');
    self.skipWaiting()
  })
  
  self.addEventListener('activate', event => {
    console.log('Service worker activating...');
    event.waitUntil(self.clients.claim())
  })
  
  const map = new Map()
  
  // Test message handler
  self.addEventListener('message', (event) => {
    console.log('Service worker received message via addEventListener:', event.data);
  });
  
  // This should be called once per download
  // Each event has a dataChannel that the data will be piped through
  self.onmessage = event => {
    console.log('Service worker received message via onmessage:', event.data);
    // We send a heartbeat every x second to keep the
    // service worker alive if a transferable stream is not sent
    if (event.data === 'ping') {
      return
    }
  
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
  
    map.set(downloadUrl, metadata)
    port.postMessage({ download: downloadUrl })
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
  
    if (!hijacke) return
  
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
  
  