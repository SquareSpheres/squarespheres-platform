using System.Text.Json.Serialization;

namespace SignalingServer.Models;

public class SignalErrorResponse
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = default!;
    
    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
