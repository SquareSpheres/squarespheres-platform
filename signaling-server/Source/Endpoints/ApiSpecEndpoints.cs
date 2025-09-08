using System.Text.Json;

namespace SignalingServer.Endpoints;

public static class ApiSpecEndpoints
{
    public static void MapApiSpecEndpoints(this WebApplication app)
    {
        app.MapGet(
                "/api-spec",
                () =>
                {
                    var spec = new
                    {
                        protocol = "websocket",
                        version = "1.0.0",
                        title = "Signaling Server WebSocket API",
                        description = "WebSocket API for peer-to-peer signaling between hosts and clients",
                        connection = new
                        {
                            url = "ws://localhost:5052/ws",
                            description = "WebSocket connection endpoint",
                        },
                        messageFormat = new
                        {
                            type = "json",
                            schema = new
                            {
                                type = "object",
                                properties = new
                                {
                                    type = new { type = "string", description = "Message type" },
                                    hostId = new
                                    {
                                        type = "string",
                                        description = "Host identifier",
                                    },
                                    clientId = new
                                    {
                                        type = "string",
                                        description = "Client identifier",
                                    },
                                    payload = new
                                    {
                                        type = "string",
                                        description = "Message payload",
                                    },
                                },
                                required = new[] { "type" },
                            },
                        },
                        messageTypes = new
                        {
                            host = new
                            {
                                description = "Register a new host",
                                direction = "client_to_server",
                                request = new { type = "host" },
                                response = new { type = "host", hostId = "generated-host-id" },
                            },
                            joinHost = new
                            {
                                description = "Client joins a host",
                                direction = "client_to_server",
                                request = new { type = "join-host", hostId = "target-host-id" },
                                response = new
                                {
                                    type = "join-host",
                                    hostId = "target-host-id",
                                    clientId = "generated-client-id",
                                },
                            },
                            clientJoined = new
                            {
                                description = "Server notifies host that a client joined",
                                direction = "server_to_client",
                                response = new
                                {
                                    type = "client-joined",
                                    hostId = "abc123",
                                    clientId = "xyz456",
                                },
                            },
                            msgToHost = new
                            {
                                description = "Client sends message to host",
                                direction = "client_to_server",
                                request = new { type = "msg-to-host", payload = "message-content" },
                                response = "No direct response - message forwarded to host",
                            },
                            msgToClient = new
                            {
                                description = "Host sends message to client",
                                direction = "server_to_client",
                                request = new
                                {
                                    type = "msg-to-client",
                                    clientId = "target-client-id",
                                    payload = "message-content",
                                },
                                response = "No direct response - message forwarded to client",
                            },
                            clientDisconnected = new
                            {
                                description = "Server notifies host that a client disconnected",
                                direction = "server_to_client",
                                response = new
                                {
                                    type = "client-disconnected",
                                    hostId = "abc123",
                                    clientId = "xyz456",
                                },
                            },
                            hostDisconnected = new
                            {
                                description = "Server notifies all clients that host disconnected",
                                direction = "server_to_client",
                                response = new { type = "host-disconnected", hostId = "abc123" },
                            },
                        },
                        errorFormat = new { type = "error", message = "Error description" },
                        examples = new
                        {
                            registerHost = new
                            {
                                request = "{\"type\":\"host\"}",
                                response = "{\"type\":\"host\",\"hostId\":\"abc123\"}",
                            },
                            joinHost = new
                            {
                                request = "{\"type\":\"join-host\",\"hostId\":\"abc123\"}",
                                response = "{\"type\":\"join-host\",\"hostId\":\"abc123\",\"clientId\":\"xyz456\"}",
                            },
                            clientJoinedNotification = new
                            {
                                response = "{\"type\":\"client-joined\",\"hostId\":\"abc123\",\"clientId\":\"xyz456\"}",
                            },
                            sendMessageToHost = new
                            {
                                request = "{\"type\":\"msg-to-host\",\"payload\":\"Hello host!\"}",
                                response = "No direct response",
                            },
                            sendMessageToClient = new
                            {
                                request = "{\"type\":\"msg-to-client\",\"clientId\":\"xyz456\",\"payload\":\"Hello client!\"}",
                                response = "No direct response",
                            },
                            clientDisconnectedNotification = new
                            {
                                response = "{\"type\":\"client-disconnected\",\"hostId\":\"abc123\",\"clientId\":\"xyz456\"}",
                            },
                            hostDisconnectedNotification = new
                            {
                                response = "{\"type\":\"host-disconnected\",\"hostId\":\"abc123\"}",
                            },
                        },
                    };

                    return Results.Json(spec, new JsonSerializerOptions { WriteIndented = true });
                }
            )
            .WithName("GetApiSpec")
            .WithDescription("Get machine-readable API specification")
            .WithTags("API Specification");
    }
}
