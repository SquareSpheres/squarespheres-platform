using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using NanoidDotNet;
using SignalingServer.Helpers;

namespace SignalingServer.Services;

public class SignalRegistry(ILogger<SignalRegistry> logger) : ISignalRegistry
{
    private readonly BiDirectionalConcurrentDictionary<string, WebSocket> _hosts = new();
    private readonly BiDirectionalConcurrentDictionary<string, WebSocket> _clients = new();
    private readonly ConcurrentDictionary<WebSocket, string> _clientHostMap = new();
    private readonly ConcurrentDictionary<WebSocket, byte> _allSockets = new();
    private readonly ConcurrentDictionary<string, int> _hostMaxClients = new();
    private readonly ConcurrentDictionary<string, int> _hostClientCount = new();
    private const string IdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    public async Task<string> GenerateUniqueHostIdAsync()
    {
        string id;
        do
        {
            id = await Nanoid.GenerateAsync(alphabet: IdAlphabet, size: 6);
        } while (_hosts.ContainsKey(id));
        return id;
    }

    public async Task<string> GenerateUniqueClientIdAsync()
    {
        string id;
        do
        {
            id = await Nanoid.GenerateAsync(alphabet: IdAlphabet, size: 6);
        } while (_clients.ContainsKey(id));
        return id;
    }

    public bool RegisterHost(string hostId, WebSocket socket, int maxClients = 10)
    {
        var success = _hosts.TryAdd(hostId, socket);
        if (success)
        {
            _hostMaxClients.TryAdd(hostId, maxClients);
            _hostClientCount.TryAdd(hostId, 0);
        }
        return success;
    }

    public bool TryGetHostSocket(string hostId, [NotNullWhen(true)] out WebSocket? socket) =>
        _hosts.TryGetByKey(hostId, out socket);

    public bool TryGetHostId(WebSocket socket, [NotNullWhen(true)] out string? hostId) =>
        _hosts.TryGetByValue(socket, out hostId);

    public bool RegisterClient(string clientId, WebSocket socket, string hostId)
    {
        // Check if host is at capacity
        if (
            _hostClientCount.TryGetValue(hostId, out var currentCount)
            && _hostMaxClients.TryGetValue(hostId, out var maxClients)
            && currentCount >= maxClients
        )
        {
            logger.LogWarning(
                "Host {HostId} is at capacity ({CurrentCount}/{MaxClients})",
                hostId,
                currentCount,
                maxClients
            );
            return false;
        }

        var added = _clients.TryAdd(clientId, socket);
        if (added)
        {
            _clientHostMap.TryAdd(socket, hostId);
            _hostClientCount.AddOrUpdate(hostId, 1, (key, value) => value + 1);
        }
        return added;
    }

    public bool TryGetClientSocket(string clientId, [NotNullWhen(true)] out WebSocket? socket) =>
        _clients.TryGetByKey(clientId, out socket);

    public bool TryGetClientId(WebSocket socket, [NotNullWhen(true)] out string? clientId) =>
        _clients.TryGetByValue(socket, out clientId);

    public bool TryGetClientHost(WebSocket clientSocket, [NotNullWhen(true)] out string? hostId) =>
        _clientHostMap.TryGetValue(clientSocket, out hostId);

    public bool RemoveClient(WebSocket clientSocket)
    {
        if (_clientHostMap.TryRemove(clientSocket, out var hostId))
        {
            _hostClientCount.AddOrUpdate(hostId, 0, (key, value) => Math.Max(0, value - 1));
        }
        logger.LogDebug("ClientHostMap size = {Count}", _clientHostMap.Count);
        _clients.TryRemoveByValue(clientSocket);
        logger.LogDebug("Clients size = {Count}", _clients.Count);
        return true;
    }

    public bool RemoveHost(string hostId)
    {
        var success = _hosts.TryRemoveByKey(hostId);
        if (success)
        {
            _hostMaxClients.TryRemove(hostId, out _);
            _hostClientCount.TryRemove(hostId, out _);
        }
        logger.LogDebug("Hosts size = {Count}", _hosts.Count);
        return success;
    }

    public bool RemoveHost(WebSocket socket)
    {
        if (_hosts.TryGetByValue(socket, out var hostId))
        {
            _hostMaxClients.TryRemove(hostId, out _);
            _hostClientCount.TryRemove(hostId, out _);
        }
        var success = _hosts.TryRemoveByValue(socket);
        logger.LogDebug("Hosts size = {Count}", _hosts.Count);
        return success;
    }

    public IEnumerable<WebSocket> GetClientsForHost(string hostId)
    {
        return _clientHostMap.ToArray().Where(kvp => kvp.Value == hostId).Select(kvp => kvp.Key);
    }

    public void TrackSocket(WebSocket socket) => _allSockets.TryAdd(socket, 0);

    public void UntrackSocket(WebSocket socket) => _allSockets.TryRemove(socket, out _);
}
