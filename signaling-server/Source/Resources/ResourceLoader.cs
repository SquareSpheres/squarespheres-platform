namespace SignalingServer.Resources;

public static class ResourceLoader
{
    public static string ReadEmbeddedHtml(string resourceName)
    {
        var assembly = typeof(ResourceLoader).Assembly;
        using var stream = assembly.GetManifestResourceStream(resourceName)
                           ?? throw new FileNotFoundException($"Embedded resource '{resourceName}' not found.");

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}