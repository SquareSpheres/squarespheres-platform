using System.Text.Json.Serialization;

namespace SignalingServer.Models;

public class SignalMessage
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("hostId")]
    public string? HostId { get; set; }

    [JsonPropertyName("clientId")]
    public string? ClientId { get; set; }

    [JsonPropertyName("payload")]
    public string? Payload { get; set; }

    [JsonPropertyName("requestId")]
    public string? RequestId { get; set; }
}
