using System.Net.WebSockets;
using SignalingServer.Models;

namespace SignalingServer.Services;

public interface IConnectionHandler
{
    event Action<WebSocket, DisconnectionType>? SocketDisconnected;
    Task HandleConnection(WebSocket socket, CancellationToken cancellationToken);
}