using System.Text.Json.Serialization;

namespace SignalingServer.Models;

public class SignalMessage
{
    public string? Type { get; set; }
    public string? HostId { get; set; }
    public string? ClientId { get; set; } 
    public string? Payload { get; set; }
}