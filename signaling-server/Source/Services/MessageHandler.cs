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
        WebSocket? hostSocket;

        switch (msg.Type!.ToLower())
        {
            case SignalMessageTypes.Host:
                hostId = await signalRegistry.GenerateUniqueHostIdAsync();

                signalRegistry.RegisterHost(hostId, socket);
                logger.LogInformation("Host registered: {HostId}", hostId);

                await socket.SendJsonAsync(new SignalMessage
                {
                    Type = SignalMessageTypes.Host,
                    HostId = hostId,
                    RequestId = msg.RequestId,
                });

                break;

            case SignalMessageTypes.JoinHost:
                if (string.IsNullOrWhiteSpace(msg.HostId))
                {
                    logger.LogWarning("Tried to join a host without a valid id");
                    await socket.SendErrorAsync("Missing hostId");
                    return;
                }

                if (signalRegistry.TryGetHostSocket(msg.HostId, out hostSocket))
                {
                    clientId = await signalRegistry.GenerateUniqueClientIdAsync();
                    signalRegistry.RegisterClient(clientId, socket, msg.HostId);
                    logger.LogInformation("Client {ClientId} joined host {HostId}", clientId, msg.HostId);

                    // Acknowledge client
                    await socket.SendJsonAsync(new SignalMessage
                    {
                        Type = SignalMessageTypes.JoinHost,
                        HostId = msg.HostId,
                        ClientId = clientId,
                        RequestId = msg.RequestId,
                    });

                    // Notify host with a distinct, host-facing type
                    try
                    {
                        await hostSocket.SendJsonAsync(new SignalMessage
                        {
                            Type = SignalMessageTypes.ClientJoined,
                            HostId = msg.HostId,
                            ClientId = clientId,
                            RequestId = msg.RequestId,
                        });
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to notify host {HostId} about client {ClientId}", msg.HostId,
                            clientId);
                    }
                }
                else
                {
                    logger.LogWarning("Host for {hostId} not found", msg.HostId);
                    await socket.SendErrorAsync($"Host {msg.HostId} not found");
                }

                break;

            case SignalMessageTypes.MsgToHost:
                if (signalRegistry.TryGetClientHost(socket, out hostId) &&
                    signalRegistry.TryGetHostSocket(hostId, out hostSocket) &&
                    signalRegistry.TryGetClientId(socket, out clientId))
                {
                    logger.LogInformation("Client {ClientId} → Host [{HostId}]", clientId, hostId);

                    var forward = new SignalMessage
                    {
                        Type = SignalMessageTypes.MsgToHost,
                        ClientId = clientId,
                        HostId = hostId,
                        Payload = msg.Payload,
                        RequestId = msg.RequestId
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
                            Payload = msg.Payload,
                            RequestId = msg.RequestId
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

    /// <summary>
    /// Sends peer notifications when a socket disconnects.
    /// IMPORTANT: Call this BEFORE registry cleanup/closure so peers can still be notified.
    /// This method does NOT remove/untrack/close any sockets.
    /// </summary>
    public async Task HandleDisconnect(WebSocket socket, DisconnectionType type)
    {
        switch (type)
        {
            case DisconnectionType.Client:
            {
                if (signalRegistry.TryGetClientId(socket, out var clientId) &&
                    signalRegistry.TryGetClientHost(socket, out var hostId) &&
                    signalRegistry.TryGetHostSocket(hostId, out var hostSocket))
                {
                    logger.LogInformation("Notifying host {HostId} that client {ClientId} disconnected", hostId,
                        clientId);

                    try
                    {
                        await hostSocket.SendJsonAsync(new SignalMessage
                        {
                            Type = SignalMessageTypes.ClientDisconnected,
                            HostId = hostId,
                            ClientId = clientId,
                            RequestId = null
                        });
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to notify host {HostId} of client {ClientId} disconnection",
                            hostId, clientId);
                    }
                }

                break;
            }

            case DisconnectionType.Host:
            {
                if (signalRegistry.TryGetHostId(socket, out var hostId))
                {
                    var clients = signalRegistry.GetClientsForHost(hostId).ToList();
                    logger.LogInformation("Notifying {Count} clients that host {HostId} disconnected", clients.Count,
                        hostId);

                    var tasks = clients.Select(async clientSocket =>
                    {
                        try
                        {
                            await clientSocket.SendJsonAsync(new SignalMessage
                            {
                                Type = SignalMessageTypes.HostDisconnected,
                                HostId = hostId
                            });
                        }
                        catch (Exception ex)
                        {
                            logger.LogWarning(ex, "Failed to notify a client of host {HostId} disconnection", hostId);
                        }
                    });

                    await Task.WhenAll(tasks);
                }


                break;
            }

            case DisconnectionType.Unknown:
            default:
                // No-op: unknown/unregistered sockets have no peers to notify.
                logger.LogDebug("Disconnect notification ignored for unknown socket");
                break;
        }
    }
}