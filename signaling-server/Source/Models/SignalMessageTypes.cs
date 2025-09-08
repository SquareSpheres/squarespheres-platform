namespace SignalingServer.Models;

public static class SignalMessageTypes
{
    public const string Host = "host";
    public const string JoinHost = "join-host";
    public const string MsgToHost = "msg-to-host";
    public const string MsgToClient = "msg-to-client";

    public const string ClientJoined = "client-joined";
    public const string ClientDisconnected = "client-disconnected";

    public const string HostDisconnected = "host-disconnected";
}
