namespace SignalingServer.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/health", GetHealth)
            .RequireCors(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
    }

    private static string GetHealth()
    {
        return "OK";
    }
}
