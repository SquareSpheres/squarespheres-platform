using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Moq;
using SignalingServer.Models;
using SignalingServer.Services;


namespace SignalingServer.Tests;

[TestFixture]
public class ConnectionHandlerTests
{
    private Mock<IMessageHandler> _messageHandlerMock;
    private Mock<ISignalRegistry> _signalRegistryMock;
    private Mock<ILogger<ConnectionHandler>> _loggerMock;
    private ConnectionHandler _handler;

    [SetUp]
    public void SetUp()
    {
        _messageHandlerMock = new Mock<IMessageHandler>();
        _signalRegistryMock = new Mock<ISignalRegistry>();
        _loggerMock = new Mock<ILogger<ConnectionHandler>>();

        _handler = new ConnectionHandler(
            _messageHandlerMock.Object,
            _signalRegistryMock.Object,
            _loggerMock.Object
        );
    }

    [Test]
    public async Task HandleConnection_HostSocket_DisconnectsWithHostType()
    {
        var socketMock = new Mock<WebSocket>();

        socketMock.SetupSequence(s => s.State)
            .Returns(WebSocketState.Open)
            .Returns(WebSocketState.Closed);

        socketMock.Setup(s => s.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

        _signalRegistryMock.Setup(r => r.TryGetHostId(socketMock.Object, out It.Ref<string>.IsAny))
            .Returns((WebSocket s, out string hostId) =>
            {
                hostId = "host-1";
                return true;
            });

        DisconnectionType? actualType = null;
        _handler.SocketDisconnected += (_, type) => actualType = type;

        await _handler.HandleConnection(socketMock.Object, CancellationToken.None);

        _signalRegistryMock.Verify(r => r.RemoveHost("host-1"), Times.Once);
        Assert.That(actualType, Is.EqualTo(DisconnectionType.Host));
    }

    [Test]
    public async Task HandleConnection_ClientSocket_DisconnectsWithClientType()
    {
        var socketMock = new Mock<WebSocket>();

        socketMock.SetupSequence(s => s.State)
            .Returns(WebSocketState.Open)
            .Returns(WebSocketState.Closed);

        socketMock.Setup(s => s.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

        _signalRegistryMock.Setup(r => r.TryGetHostId(socketMock.Object, out It.Ref<string>.IsAny!))
            .Returns(false);

        _signalRegistryMock.Setup(r => r.TryGetClientHost(socketMock.Object, out It.Ref<string>.IsAny!))
            .Returns((WebSocket s, out string hostId) =>
            {
                hostId = "host-2";
                return true;
            });

        DisconnectionType? actualType = null;
        _handler.SocketDisconnected += (_, type) => actualType = type;

        await _handler.HandleConnection(socketMock.Object, CancellationToken.None);

        _signalRegistryMock.Verify(r => r.RemoveClient(socketMock.Object), Times.Once);
        Assert.That(actualType, Is.EqualTo(DisconnectionType.Client));
    }

    [Test]
    public async Task HandleConnection_UnregisteredSocket_DisconnectsWithUnknownType()
    {
        var socketMock = new Mock<WebSocket>();

        socketMock.SetupSequence(s => s.State)
            .Returns(WebSocketState.Open)
            .Returns(WebSocketState.Closed);

        socketMock.Setup(s => s.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

        _signalRegistryMock.Setup(r => r.TryGetHostId(socketMock.Object, out It.Ref<string>.IsAny))
            .Returns(false);
        _signalRegistryMock.Setup(r => r.TryGetClientHost(socketMock.Object, out It.Ref<string>.IsAny))
            .Returns(false);

        DisconnectionType? actualType = null;
        _handler.SocketDisconnected += (_, type) => actualType = type;

        await _handler.HandleConnection(socketMock.Object, CancellationToken.None);

        _signalRegistryMock.Verify(r => r.UntrackSocket(socketMock.Object), Times.Once);
        Assert.That(actualType, Is.EqualTo(DisconnectionType.Unknown));
    }

    [Test]
    public async Task HandleConnection_HostCleanup_RemovesClientsAndClosesSockets()
    {
        // Arrange
        var hostSocketMock = new Mock<WebSocket>();
        hostSocketMock.SetupSequence(s => s.State)
            .Returns(WebSocketState.Open)
            .Returns(WebSocketState.Closed);
        hostSocketMock.Setup(s => s.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));

        // Simulate host ID
        _signalRegistryMock.Setup(r => r.TryGetHostId(hostSocketMock.Object, out It.Ref<string>.IsAny!))
            .Returns((WebSocket s, out string id) =>
            {
                id = "host-xyz";
                return true;
            });

        // Simulate 2 client sockets connected to host
        var client1 = new Mock<WebSocket>();
        var client2 = new Mock<WebSocket>();

        client1.Setup(s => s.State).Returns(WebSocketState.Open);
        client2.Setup(s => s.State).Returns(WebSocketState.Open);

        _signalRegistryMock.Setup(r => r.GetClientsForHost("host-xyz"))
            .Returns(new List<WebSocket> { client1.Object, client2.Object });

        // Act
        await _handler.HandleConnection(hostSocketMock.Object, CancellationToken.None);

        // Assert host was removed
        _signalRegistryMock.Verify(r => r.RemoveHost("host-xyz"), Times.Once);

        // Assert clients were cleaned up
        _signalRegistryMock.Verify(r => r.RemoveClient(client1.Object), Times.Once);
        _signalRegistryMock.Verify(r => r.RemoveClient(client2.Object), Times.Once);
        _signalRegistryMock.Verify(r => r.UntrackSocket(client1.Object), Times.Once);
        _signalRegistryMock.Verify(r => r.UntrackSocket(client2.Object), Times.Once);

        // CloseAsync should have been called for both clients (using It.IsAny since CloseAsync is protected)
        client1.Verify(s => s.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Closing",
            It.IsAny<CancellationToken>()), Times.Once);

        client2.Verify(s => s.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Closing",
            It.IsAny<CancellationToken>()), Times.Once);
    }
}