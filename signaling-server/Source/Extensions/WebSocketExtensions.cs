using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using SignalingServer.Models;
using SignalingServer.Configuration;

namespace SignalingServer.Extensions;

/// <summary>
/// Extension methods for working with WebSocket in a simplified and consistent way.
/// </summary>
public static class WebSocketExtensions
{
    /// <summary>
    /// Sends a raw JSON string over the WebSocket.
    /// </summary>
    /// <param name="socket">The target WebSocket.</param>
    /// <param name="json">The raw JSON string to send.</param>
    public static async Task SendRawAsync(this WebSocket socket, string json)
    {
        if (socket.State != WebSocketState.Open) return;

        var bytes = Encoding.UTF8.GetBytes(json);
        await socket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            cancellationToken: CancellationToken.None
        );
    }

    /// <summary>
    /// Serializes an object to JSON and sends it over the WebSocket using centralized configuration.
    /// </summary>
    /// <typeparam name="T">Type of the object to serialize.</typeparam>
    /// <param name="socket">The target WebSocket.</param>
    /// <param name="message">The object to serialize and send.</param>
    public static async Task SendJsonAsync<T>(this WebSocket socket, T message)
    {
        if (socket.State != WebSocketState.Open) return;

        // Use centralized JSON configuration for consistent serialization
        var json = message.ToJson();
        var bytes = Encoding.UTF8.GetBytes(json);

        await socket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            cancellationToken: CancellationToken.None
        );
    }

    /// <summary>
    /// Sends a standardized error response over the WebSocket and logs it if a logger is provided.
    /// </summary>
    /// <param name="socket">The target WebSocket.</param>
    /// <param name="errorMessage">The error message to send.</param>
    public static async Task SendErrorAsync(this WebSocket socket, string errorMessage)
    {
        var error = new SignalErrorResponse
        {
            Type = "error",
            Message = errorMessage
        };

        await socket.SendJsonAsync(error);
    }

    /// <summary>
    /// Receives a complete WebSocket message, handling fragmentation and size limits.
    /// </summary>
    /// <param name="socket">The source WebSocket.</param>
    /// <param name="maxSizeInBytes">Maximum allowed message size in bytes. Default is 64 KB.</param>
    /// <param name="chunkSize">Buffer size for each read operation. Default is 4096 bytes.</param>
    /// <param name="cancellationToken">Token for cancellation.</param>
    /// <returns>The full UTF-8 message string, or null if the socket is closed.</returns>
    /// <exception cref="WebSocketException">Thrown if the message exceeds the maximum size.</exception>
    public static async Task<string?> ReceiveFullMessageAsync(
        this WebSocket socket,
        int maxSizeInBytes = 64 * 1024,
        int chunkSize = 4 * 1024,
        CancellationToken cancellationToken = default)
    {
        var buffer = new byte[chunkSize];
        using var ms = new MemoryStream();

        while (true)
        {
            var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

            if (result.MessageType == WebSocketMessageType.Close)
                return null;

            ms.Write(buffer, 0, result.Count);

            if (ms.Length > maxSizeInBytes)
                throw new WebSocketException("Message too large");

            if (result.EndOfMessage)
                break;
        }

        return Encoding.UTF8.GetString(ms.ToArray());
    }
}