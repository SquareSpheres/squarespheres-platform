using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Moq;
using SignalingServer.Services;
using SignalingServer.Tests.Helpers;

namespace SignalingServer.Tests;

[TestFixture]
public class SignalRegistryTests
{
    private SignalRegistry _registry;
    private Mock<ILogger<SignalRegistry>> _loggerMock;

    [SetUp]
    public void SetUp()
    {
        _loggerMock = new Mock<ILogger<SignalRegistry>>();
        _registry = new SignalRegistry(_loggerMock.Object);
    }

    private static WebSocket CreateSocket() => new TestWebSocket();

    [Test]
    public async Task GenerateUniqueHostIdAsync_ReturnsUnique6CharUppercaseAlphanumericId()
    {
        var ids = new HashSet<string>();
        for (var i = 0; i < 20; i++)
        {
            var id = await _registry.GenerateUniqueHostIdAsync();
            Assert.Multiple(() =>
            {
                Assert.That(id, Has.Length.EqualTo(6));
                Assert.That(ids.Contains(id), Is.False);
                Assert.That(
                    id,
                    Does.Match(@"^[A-Z0-9]{6}$"),
                    "ID should only contain uppercase letters and numbers"
                );
            });
            ids.Add(id);
        }
    }

    [Test]
    public async Task GenerateUniqueClientIdAsync_ReturnsUnique6CharUppercaseAlphanumericId()
    {
        var ids = new HashSet<string>();
        for (var i = 0; i < 20; i++)
        {
            var id = await _registry.GenerateUniqueClientIdAsync();
            Assert.Multiple(() =>
            {
                Assert.That(id, Has.Length.EqualTo(6));
                Assert.That(ids.Contains(id), Is.False);
                Assert.That(
                    id,
                    Does.Match(@"^[A-Z0-9]{6}$"),
                    "ID should only contain uppercase letters and numbers"
                );
            });
            ids.Add(id);
        }
    }

    [Test]
    public void RegisterHost_And_TryGetHostSocket_Works()
    {
        var socket = CreateSocket();
        var result = _registry.RegisterHost("host1", socket, 10);
        Assert.That(result, Is.True);

        var found = _registry.TryGetHostSocket("host1", out var retrieved);
        Assert.Multiple(() =>
        {
            Assert.That(found, Is.True);
            Assert.That(retrieved, Is.EqualTo(socket));
        });
    }

    [Test]
    public void TryGetHostId_ReturnsCorrectId()
    {
        var socket = CreateSocket();
        _registry.RegisterHost("hostX", socket, 10);

        var found = _registry.TryGetHostId(socket, out var hostId);
        Assert.Multiple(() =>
        {
            Assert.That(found, Is.True);
            Assert.That(hostId, Is.EqualTo("hostX"));
        });
    }

    [Test]
    public void RegisterClient_And_Lookups_Work()
    {
        var socket = CreateSocket();
        var result = _registry.RegisterClient("client1", socket, "host1");
        Assert.Multiple(() =>
        {
            Assert.That(result, Is.True);

            Assert.That(_registry.TryGetClientSocket("client1", out var foundSock), Is.True);
            Assert.That(foundSock, Is.EqualTo(socket));

            Assert.That(_registry.TryGetClientId(socket, out var clientId), Is.True);
            Assert.That(clientId, Is.EqualTo("client1"));

            Assert.That(_registry.TryGetClientHost(socket, out var hostId), Is.True);
            Assert.That(hostId, Is.EqualTo("host1"));
        });
    }

    [Test]
    public void GetClientsForHost_ReturnsOnlyClientsOfThatHost()
    {
        const string hostA = "hostA";
        const string hostB = "hostB";

        var socket1 = CreateSocket();
        var socket2 = CreateSocket();
        var socket3 = CreateSocket();

        _registry.RegisterClient("c1", socket1, hostA);
        _registry.RegisterClient("c2", socket2, hostA);
        _registry.RegisterClient("c3", socket3, hostB);

        var clientsForA = _registry.GetClientsForHost(hostA).ToList();

        Assert.That(clientsForA, Contains.Item(socket1));
        Assert.That(clientsForA, Contains.Item(socket2));
        Assert.That(clientsForA, Does.Not.Contain(socket3));
    }

    [Test]
    public void RemoveClient_RemovesAllMappings()
    {
        var socket = CreateSocket();
        _registry.RegisterClient("client99", socket, "hostY");

        var removed = _registry.RemoveClient(socket);
        Assert.Multiple(() =>
        {
            Assert.That(removed, Is.True);

            Assert.That(_registry.TryGetClientId(socket, out _), Is.False);
            Assert.That(_registry.TryGetClientHost(socket, out _), Is.False);
        });
    }

    [Test]
    public void RemoveHost_ById_RemovesHost()
    {
        var socket = CreateSocket();
        _registry.RegisterHost("host88", socket, 10);

        var removed = _registry.RemoveHost("host88");
        Assert.Multiple(() =>
        {
            Assert.That(removed, Is.True);
            Assert.That(_registry.TryGetHostSocket("host88", out _), Is.False);
        });
    }

    [Test]
    public void RemoveHost_BySocket_RemovesHost()
    {
        var socket = CreateSocket();
        _registry.RegisterHost("hostZ", socket, 10);

        var removed = _registry.RemoveHost(socket);
        Assert.Multiple(() =>
        {
            Assert.That(removed, Is.True);
            Assert.That(_registry.TryGetHostId(socket, out _), Is.False);
        });
    }

    [Test]
    public void Track_Untrack_Socket_BehavesCorrectly()
    {
        var socket = CreateSocket();
        _registry.TrackSocket(socket);
        _registry.UntrackSocket(socket);
    }
}
