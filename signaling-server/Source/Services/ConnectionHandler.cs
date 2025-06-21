using System.Net.WebSockets;
using SignalingServer.Extensions;
using SignalingServer.Models;

namespace SignalingServer.Services;

public class ConnectionHandler(
    IMessageHandler messageHandler,
    ISignalRegistry signalRegistry,
    ILogger<ConnectionHandler> logger) : IConnectionHandler
{
    public event Action<WebSocket, DisconnectionType>? SocketDisconnected;

    public async Task HandleConnection(WebSocket socket, CancellationToken cancellationToken)
    {
        signalRegistry.TrackSocket(socket);

        try
        {
            while (socket.State == WebSocketState.Open)
            {
                // TODO read size limits from env, currently using defaults
                var raw = await socket.ReceiveFullMessageAsync(cancellationToken: cancellationToken);

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
                await CleanupHost(hostId);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Host);
            }
            else if (signalRegistry.TryGetClientHost(socket, out hostId))
            {
                logger.LogInformation("Client disconnected from host {HostId}", hostId);
                await RemoveSocket(socket);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Client);
            }
            else
            {
                logger.LogInformation("Unregistered socket disconnected before registration");
                await RemoveSocket(socket);
                SocketDisconnected?.Invoke(socket, DisconnectionType.Unknown);
            }
        }
    }

    private async Task CleanupHost(string hostId)
    {
        signalRegistry.RemoveHost(hostId);

        var clientsToRemove = signalRegistry.GetClientsForHost(hostId);

        foreach (var socket in clientsToRemove)
        {
            await RemoveSocket(socket);
        }
    }

    private async Task RemoveSocket(WebSocket socket)
    {
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
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
            }
            catch (WebSocketException ex)
            {
                logger.LogWarning(ex, "Error closing WebSocket");
            }
        }
    }
}