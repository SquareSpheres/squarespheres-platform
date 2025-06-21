namespace SignalingServer.Models;

public class SignalErrorResponse
{
    public string Type { get; set; } = default!;
    public string? Message { get; set; }
}
