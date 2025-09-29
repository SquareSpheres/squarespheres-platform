namespace SignalingServer.Extensions;

/// <summary>
/// Extension methods for string operations.
/// </summary>
public static class StringExtensions
{
    /// <summary>
    /// Truncates a string to the specified maximum length, adding "..." if truncated.
    /// </summary>
    /// <param name="value">The string to truncate.</param>
    /// <param name="maxLength">Maximum length before truncation. Default is 50.</param>
    /// <returns>Truncated string with "..." suffix if needed, or empty string if input is null/empty.</returns>
    public static string TruncateForLogging(this string? value, int maxLength = 50)
    {
        if (string.IsNullOrEmpty(value))
            return "";

        return value.Length > maxLength ? value[..(maxLength - 3)] + "..." : value;
    }
}
