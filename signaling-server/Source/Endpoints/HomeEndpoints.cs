using SignalingServer.Resources;

namespace SignalingServer.Endpoints;

public static class HomeEndpoints
{
    public static void MapHomeEndpoints(this WebApplication app)
    {
        app.MapGet("/", GetHome);
    }

    private static IResult GetHome(HttpContext context)
    {
        var scheme = context.Request.Scheme;
        var host = context.Request.Host.Value;
        var wsUrl = $"{(scheme == "https" ? "wss" : "ws")}://{host}/ws";

        var htmlTemplate = ResourceLoader.ReadEmbeddedHtml("SignalingServer.Resources.Pages.home.html");

        var finalHtml = htmlTemplate.Replace("{{wsUrl}}", wsUrl);

        return Results.Content(finalHtml, "text/html");
    }

}