using System.Net.WebSockets;
using SignalingServer.Extensions;
using SignalingServer.Models;

namespace SignalingServer.Services;

public class ConnectionHandler(
    IMessageHandler messageHandler,
    ISignalRegistry signalRegistry,
    ILogger<ConnectionHandler> logger
) : IConnectionHandler
{
    private static readonly int MaxMessageSize = int.Parse(Environment.GetEnvironmentVariable("WEBSOCKET_MAX_MESSAGE_SIZE") ?? "65536"); // 64KB default
    private static readonly int ChunkSize = int.Parse(Environment.GetEnvironmentVariable("WEBSOCKET_CHUNK_SIZE") ?? "4096"); // 4KB default

    public event Action<WebSocket, DisconnectionType>? SocketDisconnected;

    public async Task HandleConnection(WebSocket socket, CancellationToken cancellationToken)
    {
        logger.LogDebug("Trying to establish connection...");

        signalRegistry.TrackSocket(socket);

        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var raw = await socket.ReceiveFullMessageAsync(
                    maxSizeInBytes: MaxMessageSize,
                    chunkSize: ChunkSize,
                    cancellationToken: cancellationToken
                );

                if (raw == null)
                    break; // Closed or canceled

                await messageHandler.HandleMessage(socket, raw);
            }
        }
        catch (WebSocketException ex)
        {
            logger.LogWarning(ex, "WebSocket error");
        }
        finally
        {
            if (signalRegistry.TryGetHostId(socket, out var hostId))
            {
                logger.LogInformation("Host {HostId} disconnected", hostId);

                await messageHandler.HandleDisconnect(socket, DisconnectionType.Host);

                await CleanupHost(hostId);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Host);
            }
            else if (signalRegistry.TryGetClientHost(socket, out hostId))
            {
                logger.LogInformation("Client disconnected from host {HostId}", hostId);

                await messageHandler.HandleDisconnect(socket, DisconnectionType.Client);

                await RemoveSocket(socket);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Client);
            }
            else
            {
                logger.LogInformation("Unregistered socket disconnected before registration");

                await messageHandler.HandleDisconnect(socket, DisconnectionType.Unknown);

                await RemoveSocket(socket);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Unknown);
            }
        }
    }

    private async Task CleanupHost(string hostId)
    {
        if (signalRegistry.TryGetHostSocket(hostId, out var hostSocket))
        {
            await RemoveSocket(hostSocket);
        }

        var clientsToRemove = signalRegistry.GetClientsForHost(hostId);

        foreach (var socket in clientsToRemove)
        {
            await RemoveSocket(socket);
        }
    }

    private async Task RemoveSocket(WebSocket socket)
    {
        logger.LogDebug("Removing socket: {SocketHash}", socket.GetHashCode());

        signalRegistry.RemoveClient(socket);
        signalRegistry.RemoveHost(socket);
        signalRegistry.UntrackSocket(socket);
        await CloseSocket(socket);
    }

    private async Task CloseSocket(WebSocket socket)
    {
        if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            try
            {
                logger.LogDebug("Closing WebSocket with state: {State}", socket.State);
                await socket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Closing",
                    CancellationToken.None
                );
            }
            catch (WebSocketException ex)
            {
                logger.LogWarning(ex, "Error closing WebSocket");
            }
        }
        else
        {
            logger.LogDebug("WebSocket not in a closeable state: {State}", socket.State);
        }
    }
}
