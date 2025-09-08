using System.Net.WebSockets;
using SignalingServer.Models;

namespace SignalingServer.Services;

public interface IMessageHandler
{
    Task HandleMessage(WebSocket socket, string raw);
    Task HandleDisconnect(WebSocket socket, DisconnectionType type);
}
