using System.Net.WebSockets;
using System.Text.Json;
using SignalingServer.Extensions;
using SignalingServer.Models;
using SignalingServer.Validation;
using SignalingServer.Configuration;

namespace SignalingServer.Services;

public class MessageHandler(ISignalRegistry signalRegistry, ILogger<MessageHandler> logger) : IMessageHandler
{
    public async Task HandleMessage(WebSocket socket, string raw)
    {
        SignalMessage? msg;

        try
        {
            // Use centralized JSON configuration for case-insensitive deserialization
            msg = raw.FromJson<SignalMessage>();
            if (msg == null)
            {
                logger.LogWarning("Invalid message format");
                await socket.SendErrorAsync("Invalid message format");
                return;
            }

            var validator = new SignalMessageValidator();
            var validationResult = await validator.ValidateAsync(msg);

            if (!validationResult.IsValid)
            {
                logger.LogWarning("Validation failed: {Errors}",
                    string.Join("; ", validationResult.Errors.Select(e => e.ErrorMessage)));
                await socket.SendErrorAsync("Validation failed: " +
                                            string.Join(", ", validationResult.Errors.Select(e => e.ErrorMessage)));
                return;
            }
        }
        catch (JsonException je)
        {
            logger.LogWarning(je, "Malformed JSON or unknown message type");
            await socket.SendErrorAsync("Malformed JSON or unknown message type");
            return;
        }


        string? hostId;
        string? clientId;

        switch (msg.Type!.ToLower())
        {
            case SignalMessageTypes.Host:
                hostId = await signalRegistry.GenerateUniqueHostIdAsync();

                signalRegistry.RegisterHost(hostId, socket);
                logger.LogInformation("Host registered: {HostId}", hostId);

                await socket.SendJsonAsync(new SignalMessage
                {
                    Type = SignalMessageTypes.Host,
                    HostId = hostId
                });

                break;


            case SignalMessageTypes.JoinHost:
                if (string.IsNullOrWhiteSpace(msg.HostId))
                {
                    logger.LogWarning("Tried to join a host without a valid id");
                    await socket.SendErrorAsync("Missing hostId");
                    return;
                }

                if (signalRegistry.TryGetHostSocket(msg.HostId, out _))
                {
                    clientId = await signalRegistry.GenerateUniqueClientIdAsync();
                    signalRegistry.RegisterClient(clientId, socket, msg.HostId);
                    logger.LogInformation("Client {ClientId} joined host {HostId}", clientId, msg.HostId);

                    await socket.SendJsonAsync(new SignalMessage
                    {
                        Type = SignalMessageTypes.JoinHost,
                        HostId = msg.HostId,
                        ClientId = clientId
                    });
                }
                else
                {
                    logger.LogWarning("Host for {hostId} not found", msg.HostId);
                    await socket.SendErrorAsync($"Host {msg.HostId} not found");
                }

                break;


            case SignalMessageTypes.MsgToHost:
                if (signalRegistry.TryGetClientHost(socket, out hostId) &&
                    signalRegistry.TryGetHostSocket(hostId, out var hostSocket) &&
                    signalRegistry.TryGetClientId(socket, out clientId))
                {
                    logger.LogInformation("Client {ClientId} → Host [{HostId}]", clientId, hostId);

                    var forward = new SignalMessage
                    {
                        Type = SignalMessageTypes.MsgToHost,
                        ClientId = clientId,
                        HostId = hostId,
                        Payload = msg.Payload
                    };

                    await hostSocket.SendJsonAsync(forward);
                }
                else
                {
                    await socket.SendErrorAsync("Not connected to a host or unregistered client");
                }

                break;

            case SignalMessageTypes.MsgToClient:
                if (signalRegistry.TryGetHostId(socket, out hostId) && !string.IsNullOrWhiteSpace(msg.ClientId))
                {
                    if (signalRegistry.TryGetClientSocket(msg.ClientId, out var clientSocket))
                    {
                        logger.LogInformation("Host {HostId} → Client {ClientId}", hostId, msg.ClientId);

                        var forward = new SignalMessage
                        {
                            Type = SignalMessageTypes.MsgToClient,
                            ClientId = msg.ClientId,
                            HostId = hostId,
                            Payload = msg.Payload
                        };

                        await clientSocket.SendJsonAsync(forward);
                    }
                    else
                    {
                        logger.LogWarning("Client {ClientId} not found", msg.ClientId);
                        await socket.SendErrorAsync($"Client {msg.ClientId} not found");
                    }
                }
                else
                {
                    logger.LogWarning("Not registered as host or missing clientId");
                    await socket.SendErrorAsync("Not registered as host or missing clientId");
                }

                break;

            default:
                logger.LogWarning("Received unknown message type: {Type}", msg.Type);
                await socket.SendErrorAsync("Unknown message type");
                break;
        }
    }
}