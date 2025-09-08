using System.Net.WebSockets;

namespace SignalingServer.Tests.Helpers;

public class TestWebSocket : WebSocket
{
    public List<string> SentMessages = new();

    public override Task SendAsync(
        ArraySegment<byte> buffer,
        WebSocketMessageType messageType,
        bool endOfMessage,
        CancellationToken cancellationToken
    )
    {
        var json = System.Text.Encoding.UTF8.GetString(buffer.Array!, buffer.Offset, buffer.Count);
        SentMessages.Add(json);
        return Task.CompletedTask;
    }

    // Minimal stubs for abstract members
    public override WebSocketCloseStatus? CloseStatus => WebSocketCloseStatus.NormalClosure;
    public override string CloseStatusDescription => "";
    public override WebSocketState State => WebSocketState.Open;
    public override string SubProtocol => "";

    public override void Abort() { }

    public override Task CloseAsync(
        WebSocketCloseStatus closeStatus,
        string? statusDescription,
        CancellationToken cancellationToken
    ) => Task.CompletedTask;

    public override Task CloseOutputAsync(
        WebSocketCloseStatus closeStatus,
        string? statusDescription,
        CancellationToken cancellationToken
    ) => Task.CompletedTask;

    public override void Dispose() { }

    public override Task<WebSocketReceiveResult> ReceiveAsync(
        ArraySegment<byte> buffer,
        CancellationToken cancellationToken
    ) => Task.FromResult(new WebSocketReceiveResult(0, WebSocketMessageType.Text, true));
}
