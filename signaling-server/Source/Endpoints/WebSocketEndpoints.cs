using SignalingServer.Services;
using SignalingServer.Validation;

namespace SignalingServer.Endpoints;

public static class WebSocketEndpoints
{
    public static IEndpointRouteBuilder MapWebSocketEndpoints(this IEndpointRouteBuilder app)
    {
        app.Map(
            "/ws",
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

                    var webSocket = await context.WebSockets.AcceptWebSocketAsync();

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
