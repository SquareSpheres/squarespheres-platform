using System.Net.WebSockets;
using System.Text.Json;
using SignalingServer.Extensions;
using SignalingServer.Models;
using SignalingServer.Validation;

namespace SignalingServer.Services;

public class MessageHandler(ISignalRegistry signalRegistry, ILogger<MessageHandler> logger) : IMessageHandler
{
     public async Task HandleMessage(WebSocket socket, string raw)
    {
        SignalMessage? msg;

        try
        {
            msg = JsonSerializer.Deserialize<SignalMessage>(raw);
            if (msg == null)
            {
                await socket.SendErrorAsync("Invalid message format", logger);
                return;
            }
            
            var validator = new SignalMessageValidator();
            var validationResult = await validator.ValidateAsync(msg);

            if (!validationResult.IsValid)
            {
                logger.LogWarning("Validation failed: {Errors}", string.Join("; ", validationResult.Errors.Select(e => e.ErrorMessage)));
                await socket.SendErrorAsync("Validation failed: " + string.Join(", ", validationResult.Errors.Select(e => e.ErrorMessage)), logger);
                return;
            }
        }
        catch (JsonException)
        {
            await socket.SendErrorAsync("Malformed JSON or unknown message type", logger);
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
                    await socket.SendErrorAsync("Missing hostId", logger);
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
                    await socket.SendErrorAsync($"Host {msg.HostId} not found", logger);
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
                    await socket.SendErrorAsync("Not connected to a host or unregistered client", logger);
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
                        await socket.SendErrorAsync($"Client {msg.ClientId} not found", logger);
                    }
                }
                else
                {
                    await socket.SendErrorAsync("Not registered as host or missing clientId", logger);
                }

                break;

            default:
                logger.LogWarning("Received unknown message type: {Type}", msg.Type);
                await socket.SendErrorAsync("Unknown message type", logger);
                break;
        }
    }

}