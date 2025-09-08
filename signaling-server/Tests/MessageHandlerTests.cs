using System.Net.WebSockets;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SignalingServer.Models;
using SignalingServer.Services;
using SignalingServer.Tests.Helpers;

namespace SignalingServer.Tests;

[TestFixture]
public class MessageHandlerTests
{
    private Mock<ISignalRegistry> _registry;
    private Mock<ILogger<MessageHandler>> _logger;
    private MessageHandler _handler;
    private Mock<WebSocket> _socket;

    [SetUp]
    public void SetUp()
    {
        _registry = new Mock<ISignalRegistry>();
        _logger = new Mock<ILogger<MessageHandler>>();
        _socket = new Mock<WebSocket>();
        _handler = new MessageHandler(_registry.Object, _logger.Object);
    }

    // ──────────────── LOGIC/ERROR TESTS ────────────────

    [Test]
    public async Task InvalidJson_LogsWarning()
    {
        await _handler.HandleMessage(_socket.Object, "{ invalid }");
        _logger.VerifyLog(LogLevel.Warning, "Invalid message format", Times.Once());
    }

    [Test]
    public async Task NullDeserialization_LogsWarning()
    {
        await _handler.HandleMessage(_socket.Object, "null");
        _logger.VerifyLog(LogLevel.Warning, "Invalid message format", Times.Once());
    }

    [Test]
    public async Task UnknownMessageType_LogsWarning()
    {
        var msg = new SignalMessage { Type = "Unknown" };
        await _handler.HandleMessage(_socket.Object, JsonSerializer.Serialize(msg));
        _logger.VerifyLog(LogLevel.Warning, "Received unknown message type: ", Times.Once());
    }

    [Test]
    public async Task JoinHost_HostNotFound_LogsWarning()
    {
        _registry
            .Setup(r => r.TryGetHostSocket("host404", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = null!;
                    return false;
                }
            );

        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.JoinHost, HostId = "host404" }
        );
        await _handler.HandleMessage(_socket.Object, raw);

        _logger.VerifyLog(LogLevel.Warning, "Host for host404 not found", Times.Once());
    }

    [Test]
    public async Task JoinHost_MissingHostId_LogsWarning()
    {
        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.JoinHost }
        );
        await _handler.HandleMessage(_socket.Object, raw);
        _logger.VerifyLog(LogLevel.Warning, "Validation failed:", Times.Once());
    }

    [Test]
    public async Task MsgToHost_MissingContext_LogsWarning()
    {
        _registry
            .Setup(r => r.TryGetClientHost(_socket.Object, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = null!;
                    return false;
                }
            );

        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.MsgToHost }
        );
        await _handler.HandleMessage(_socket.Object, raw);

        _logger.VerifyLog(LogLevel.Warning, "Validation failed:", Times.Once());
    }

    [Test]
    public async Task MsgToClient_ClientNotFound_LogsWarning()
    {
        _registry
            .Setup(r => r.TryGetHostId(_socket.Object, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = "host9";
                    return true;
                }
            );

        _registry
            .Setup(r => r.TryGetClientSocket("client404", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = null!;
                    return false;
                }
            );

        var raw = JsonSerializer.Serialize(
            new SignalMessage
            {
                Type = SignalMessageTypes.MsgToClient,
                ClientId = "client404",
                Payload = "payload",
            }
        );
        await _handler.HandleMessage(_socket.Object, raw);

        _logger.VerifyLog(LogLevel.Warning, "Client client404 not found", Times.Once());
    }

    [Test]
    public async Task MsgToClient_MissingClientId_LogsWarning()
    {
        _registry
            .Setup(r => r.TryGetHostId(_socket.Object, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = "hostX";
                    return true;
                }
            );

        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.MsgToClient }
        );
        await _handler.HandleMessage(_socket.Object, raw);
        _logger.VerifyLog(LogLevel.Warning, "Validation failed:", Times.Once());
    }

    [Test]
    public async Task MsgToClient_NotHost_LogsWarning()
    {
        _registry
            .Setup(r => r.TryGetHostId(_socket.Object, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = null!;
                    return false;
                }
            );

        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.MsgToClient, ClientId = "clientX" }
        );
        await _handler.HandleMessage(_socket.Object, raw);

        _logger.VerifyLog(LogLevel.Warning, "Validation failed:", Times.Once());
    }

    // ──────────────── FUNCTIONAL TESTS ────────────────

    [Test]
    public async Task HostMessage_RegistersHost_AndSendsHostId()
    {
        var socket = new TestWebSocket();
        _registry.Setup(r => r.GenerateUniqueHostIdAsync()).ReturnsAsync("host-abc");

        var raw = JsonSerializer.Serialize(new SignalMessage { Type = SignalMessageTypes.Host });
        var handler = new MessageHandler(_registry.Object, _logger.Object);
        await handler.HandleMessage(socket, raw);

        _registry.Verify(r => r.RegisterHost("host-abc", socket), Times.Once);
        var response = JsonSerializer.Deserialize<SignalMessage>(socket.SentMessages[0]);
        Assert.Multiple(() =>
        {
            Assert.That(response?.Type, Is.EqualTo(SignalMessageTypes.Host));
            Assert.That(response?.HostId, Is.EqualTo("host-abc"));
        });
    }

    [Test]
    public async Task JoinHost_RegistersClient_AndSendsJoinConfirmation()
    {
        var socket = new TestWebSocket();

        _registry
            .Setup(r => r.TryGetHostSocket("room123", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = new Mock<WebSocket>().Object;
                    return true;
                }
            );

        _registry.Setup(r => r.GenerateUniqueClientIdAsync()).ReturnsAsync("client-77");

        var raw = JsonSerializer.Serialize(
            new SignalMessage { Type = SignalMessageTypes.JoinHost, HostId = "room123" }
        );

        var handler = new MessageHandler(_registry.Object, _logger.Object);
        await handler.HandleMessage(socket, raw);

        _registry.Verify(r => r.RegisterClient("client-77", socket, "room123"), Times.Once);

        var response = JsonSerializer.Deserialize<SignalMessage>(socket.SentMessages[0]);
        Assert.Multiple(() =>
        {
            Assert.That(response?.Type, Is.EqualTo(SignalMessageTypes.JoinHost));
            Assert.That(response?.HostId, Is.EqualTo("room123"));
            Assert.That(response?.ClientId, Is.EqualTo("client-77"));
        });
    }

    [Test]
    public async Task MsgToHost_ForwardsToHostSocket()
    {
        var clientSocket = new TestWebSocket();
        var hostSocket = new TestWebSocket();

        _registry
            .Setup(r => r.TryGetClientHost(clientSocket, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string hostId) =>
                {
                    hostId = "host1";
                    return true;
                }
            );

        _registry
            .Setup(r => r.TryGetHostSocket("host1", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = hostSocket;
                    return true;
                }
            );

        _registry
            .Setup(r => r.TryGetClientId(clientSocket, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string clientId) =>
                {
                    clientId = "clientA";
                    return true;
                }
            );

        var msg = new SignalMessage { Type = SignalMessageTypes.MsgToHost, Payload = "hello" };

        var raw = JsonSerializer.Serialize(msg);
        var handler = new MessageHandler(_registry.Object, _logger.Object);
        await handler.HandleMessage(clientSocket, raw);

        var forwarded = JsonSerializer.Deserialize<SignalMessage>(hostSocket.SentMessages[0]);
        Assert.Multiple(() =>
        {
            Assert.That(forwarded?.Type, Is.EqualTo(SignalMessageTypes.MsgToHost));
            Assert.That(forwarded?.Payload, Is.EqualTo("hello"));
            Assert.That(forwarded?.ClientId, Is.EqualTo("clientA"));
            Assert.That(forwarded?.HostId, Is.EqualTo("host1"));
        });
    }

    [Test]
    public async Task MsgToClient_ForwardsToClientSocket()
    {
        var hostSocket = new TestWebSocket();
        var clientSocket = new TestWebSocket();

        _registry
            .Setup(r => r.TryGetHostId(hostSocket, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = "host42";
                    return true;
                }
            );

        _registry
            .Setup(r => r.TryGetClientSocket("client42", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = clientSocket;
                    return true;
                }
            );

        var msg = new SignalMessage
        {
            Type = SignalMessageTypes.MsgToClient,
            ClientId = "client42",
            Payload = "pong",
        };

        var raw = JsonSerializer.Serialize(msg);
        var handler = new MessageHandler(_registry.Object, _logger.Object);
        await handler.HandleMessage(hostSocket, raw);

        var forwarded = JsonSerializer.Deserialize<SignalMessage>(clientSocket.SentMessages[0]);
        Assert.That(forwarded?.Type, Is.EqualTo(SignalMessageTypes.MsgToClient));
        Assert.That(forwarded?.Payload, Is.EqualTo("pong"));
        Assert.That(forwarded?.ClientId, Is.EqualTo("client42"));
        Assert.That(forwarded?.HostId, Is.EqualTo("host42"));
    }

    [Test]
    public async Task MsgToClient_ForwardsOnlyToTargetClient()
    {
        var hostSocket = new TestWebSocket();
        var clientA = new TestWebSocket();
        var clientB = new TestWebSocket();

        _registry
            .Setup(r => r.TryGetHostId(hostSocket, out It.Ref<string>.IsAny!))
            .Returns(
                (WebSocket _, out string id) =>
                {
                    id = "host123";
                    return true;
                }
            );

        _registry
            .Setup(r => r.TryGetClientSocket("client42", out It.Ref<WebSocket>.IsAny!))
            .Returns(
                (string _, out WebSocket ws) =>
                {
                    ws = clientA;
                    return true;
                }
            );

        var msg = new SignalMessage
        {
            Type = SignalMessageTypes.MsgToClient,
            ClientId = "client42",
            Payload = "secret-payload",
        };

        var raw = JsonSerializer.Serialize(msg);
        var handler = new MessageHandler(_registry.Object, _logger.Object);
        await handler.HandleMessage(hostSocket, raw);

        Assert.That(clientA.SentMessages, Has.Count.EqualTo(1));
        var response = JsonSerializer.Deserialize<SignalMessage>(clientA.SentMessages[0]);
        Assert.Multiple(() =>
        {
            Assert.That(response?.ClientId, Is.EqualTo("client42"));
            Assert.That(response?.Payload, Is.EqualTo("secret-payload"));
            Assert.That(clientB.SentMessages, Is.Empty);
        });
    }
}
