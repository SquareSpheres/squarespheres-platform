namespace SignalingServer.Validation;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using System.Linq;

public class CorsOriginValidator(IWebHostEnvironment environment)
{
    /// <summary>
    /// Checks if the given origin string is allowed.
    /// This is used by SetIsOriginAllowed.
    /// </summary>
    public bool IsOriginAllowed(string? origin)
    {
        if (string.IsNullOrEmpty(origin))
            return false;

        if (origin == "https://squarespheres.com")
            return true;

        if (origin.EndsWith(".squarespheres.com"))
            return true;

        if (environment.IsDevelopment() &&
            (origin.StartsWith("http://localhost:") || origin.StartsWith("http://127.0.0.1:")))
            return true;

        return false;
    }

    /// <summary>
    /// Checks if the request origin from HttpContext is allowed.
    /// </summary>
    public bool IsOriginAllowed(HttpContext? context)
    {
        if (context == null)
            return false;

        if (!context.Request.Headers.TryGetValue("Origin", out var originValues))
            return false;

        var origin = originValues.FirstOrDefault();
        return IsOriginAllowed(origin);
    }
}