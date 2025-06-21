using System.Net.WebSockets;

namespace SignalingServer.Services;

public interface IMessageHandler
{
    Task HandleMessage(WebSocket socket, string raw);
}