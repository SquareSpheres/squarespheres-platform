using Microsoft.Extensions.Options;
using SignalingServer.Services;
using SignalingServer.Validation;

namespace SignalingServer.Endpoints;

public static class WebSocketEndpoints
{
    private const string WebSocketPath = "/ws";

    public static IEndpointRouteBuilder MapWebSocketEndpoints(this IEndpointRouteBuilder app)
    {
        app.Map(
            WebSocketPath,
            async context =>
            {
                if (context.WebSockets.IsWebSocketRequest)
                {
                    var corsValidator =
                        context.RequestServices.GetRequiredService<CorsOriginValidator>();

                    if (!corsValidator.IsOriginAllowed(context))
                    {
                        context.Response.StatusCode = 403;
                        await context.Response.WriteAsync("Origin not allowed");
                        return;
                    }

                    var webSocketOptions = context.RequestServices.GetRequiredService<
                        IOptions<WebSocketOptions>
                    >();
                    var acceptContext = new WebSocketAcceptContext
                    {
                        KeepAliveInterval = webSocketOptions.Value.KeepAliveInterval,
                        SubProtocol = context.WebSockets.WebSocketRequestedProtocols.FirstOrDefault()
                    };
                    var webSocket = await context.WebSockets.AcceptWebSocketAsync(acceptContext);

                    var connectionHandler =
                        context.RequestServices.GetRequiredService<IConnectionHandler>();
                    await connectionHandler.HandleConnection(webSocket, context.RequestAborted);
                }
                else
                {
                    context.Response.StatusCode = 400;
                }
            }
        );

        return app;
    }
}
