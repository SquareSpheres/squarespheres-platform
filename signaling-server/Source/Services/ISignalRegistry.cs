using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;

namespace SignalingServer.Services;

public interface ISignalRegistry
{
    Task<string> GenerateUniqueHostIdAsync();
    Task<string> GenerateUniqueClientIdAsync();

    bool RegisterHost(string hostId, WebSocket socket);

    bool TryGetHostSocket(string hostId, [NotNullWhen(true)] out WebSocket? socket);
    bool TryGetHostId(WebSocket socket, [NotNullWhen(true)] out string? hostId);
    bool RemoveHost(string hostId);
    bool RemoveHost(WebSocket socket);

    bool RegisterClient(string clientId, WebSocket socket, string hostId);

    bool TryGetClientSocket(string clientId, [NotNullWhen(true)] out WebSocket? socket);
    bool TryGetClientId(WebSocket socket, [NotNullWhen(true)] out string? clientId);
    bool TryGetClientHost(WebSocket clientSocket, [NotNullWhen(true)] out string? hostId);
    bool RemoveClient(WebSocket clientSocket);

    IEnumerable<WebSocket> GetClientsForHost(string hostId);

    void TrackSocket(WebSocket socket);
    void UntrackSocket(WebSocket socket);
}