namespace SignalingServer.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/health", GetHealth);
    }

    private static string GetHealth()
    {
        return "OK";
    }
}
