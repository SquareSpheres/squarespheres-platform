using System.Text.Json;

namespace SignalingServer.Configuration;

/// <summary>
/// Extension methods for easier JSON serialization and deserialization using centralized configuration.
/// </summary>
public static class JsonExtensions
{
    /// <summary>
    /// Serializes an object to JSON using the default configuration.
    /// </summary>
    /// <typeparam name="T">The type of object to serialize.</typeparam>
    /// <param name="obj">The object to serialize.</param>
    /// <returns>JSON string representation of the object.</returns>
    public static string ToJson<T>(this T obj)
    {
        return JsonSerializer.Serialize(obj, JsonConfiguration.Default);
    }

    /// <summary>
    /// Serializes an object to JSON using the specified configuration.
    /// </summary>
    /// <typeparam name="T">The type of object to serialize.</typeparam>
    /// <param name="obj">The object to serialize.</param>
    /// <param name="options">The JSON serialization options to use.</param>
    /// <returns>JSON string representation of the object.</returns>
    public static string ToJson<T>(this T obj, JsonSerializerOptions options)
    {
        return JsonSerializer.Serialize(obj, options);
    }

    /// <summary>
    /// Deserializes a JSON string to an object using the default configuration.
    /// </summary>
    /// <typeparam name="T">The type of object to deserialize to.</typeparam>
    /// <param name="json">The JSON string to deserialize.</param>
    /// <returns>The deserialized object, or null if deserialization fails.</returns>
    public static T? FromJson<T>(this string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonConfiguration.Default);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    /// <summary>
    /// Deserializes a JSON string to an object using the specified configuration.
    /// </summary>
    /// <typeparam name="T">The type of object to deserialize to.</typeparam>
    /// <param name="json">The JSON string to deserialize.</param>
    /// <param name="options">The JSON deserialization options to use.</param>
    /// <returns>The deserialized object, or null if deserialization fails.</returns>
    public static T? FromJson<T>(this string json, JsonSerializerOptions options)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, options);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    /// <summary>
    /// Safely deserializes a JSON string to an object using the default configuration.
    /// Returns null if deserialization fails instead of throwing an exception.
    /// </summary>
    /// <typeparam name="T">The type of object to deserialize to.</typeparam>
    /// <param name="json">The JSON string to deserialize.</param>
    /// <returns>The deserialized object, or null if deserialization fails.</returns>
    public static T? TryFromJson<T>(this string json) where T : class
    {
        return FromJson<T>(json);
    }
}
