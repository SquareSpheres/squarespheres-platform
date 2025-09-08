using System.Text.Json;
using System.Text.Json.Serialization;

namespace SignalingServer.Configuration;

/// <summary>
/// Centralized configuration for JSON serialization options used throughout the application.
/// This follows the singleton pattern for configuration to ensure consistency across the application.
/// </summary>
public static class JsonConfiguration
{
    /// <summary>
    /// Base JSON configuration with shared settings.
    /// This serves as the foundation for all other configurations.
    /// </summary>
    private static readonly JsonSerializerOptions Base = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase, // Use camelCase for TypeScript/JavaScript compatibility
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, // Don't send null properties
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // Allow special characters
        Converters = { new JsonStringEnumConverter() }, // Output enums as strings instead of numbers
    };

    /// <summary>
    /// Default JSON serialization options.
    /// - Case-insensitive property matching
    /// - camelCase output for TypeScript/JavaScript compatibility
    /// - Compact JSON for network transmission
    /// - Null properties ignored
    /// </summary>
    public static readonly JsonSerializerOptions Default = new(Base) { WriteIndented = false };

    /// <summary>
    /// JSON serialization options specifically for logging/debugging with indented output.
    /// Useful for development and troubleshooting.
    /// </summary>
    public static readonly JsonSerializerOptions ForLogging = new(Base) { WriteIndented = true };

    /// <summary>
    /// JSON serialization options for API responses that need to be human-readable.
    /// Useful for development endpoints or admin interfaces.
    /// </summary>
    public static readonly JsonSerializerOptions ForApi = new(Base) { WriteIndented = true };

    /// <summary>
    /// JSON serialization options optimized for performance in high-throughput scenarios.
    /// Minimal features for maximum speed.
    /// </summary>
    public static readonly JsonSerializerOptions ForPerformance = new(Base)
    {
        WriteIndented = false,
    };
}
