using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using NanoidDotNet;
using SignalingServer.Helpers;

namespace SignalingServer.Services;

public class SignalRegistry : ISignalRegistry
{
    private readonly BiDirectionalConcurrentDictionary<string, WebSocket> _hosts = new();
    private readonly BiDirectionalConcurrentDictionary<string, WebSocket> _clients = new();
    private readonly ConcurrentDictionary<WebSocket, string> _clientHostMap = new();
    private readonly ConcurrentDictionary<WebSocket, byte> _allSockets = new();
    
    public async Task<string> GenerateUniqueHostIdAsync()
    {
        string id;
        do
        {
            id = await Nanoid.GenerateAsync(size: 12);
        } while (_hosts.ContainsKey(id));
        return id;
    }

    public async Task<string> GenerateUniqueClientIdAsync()
    {
        string id;
        do
        {
            id = await Nanoid.GenerateAsync(size: 12);
        } while (_clients.ContainsKey(id));
        return id;
    }

    public bool RegisterHost(string hostId, WebSocket socket)
        => _hosts.TryAdd(hostId, socket);

    public bool TryGetHostSocket(string hostId, [NotNullWhen(true)] out WebSocket? socket)
        => _hosts.TryGetByKey(hostId, out socket);

    public bool TryGetHostId(WebSocket socket, [NotNullWhen(true)] out string? hostId)
        => _hosts.TryGetByValue(socket, out hostId);



    public bool RegisterClient(string clientId, WebSocket socket, string hostId)
    {
        var added = _clients.TryAdd(clientId, socket);
        if (added)
        {
            _clientHostMap.TryAdd(socket, hostId);
        }
        return added;
    }

    public bool TryGetClientSocket(string clientId, [NotNullWhen(true)] out WebSocket? socket)
        => _clients.TryGetByKey(clientId, out socket);

    public bool TryGetClientId(WebSocket socket, [NotNullWhen(true)] out string? clientId)
        => _clients.TryGetByValue(socket, out clientId);

    public bool TryGetClientHost(WebSocket clientSocket, [NotNullWhen(true)] out string? hostId)
        => _clientHostMap.TryGetValue(clientSocket, out hostId);

    public bool RemoveClient(WebSocket clientSocket)
    {
        _clientHostMap.TryRemove(clientSocket, out _);
        _clients.TryRemoveByValue(clientSocket);
        return true;
    }

    public bool RemoveHost(string hostId)
    {
        return _hosts.TryRemoveByKey(hostId);
    }

    public bool RemoveHost(WebSocket socket)
    {
        return _hosts.TryRemoveByValue(socket);
    }
    

    public IEnumerable<WebSocket> GetClientsForHost(string hostId)
    {
        return _clientHostMap
            .ToArray()
            .Where(kvp => kvp.Value == hostId)
            .Select(kvp => kvp.Key);
    }

    public void TrackSocket(WebSocket socket)
        => _allSockets.TryAdd(socket, 0);

    public void UntrackSocket(WebSocket socket)
        => _allSockets.TryRemove(socket, out _);
}
