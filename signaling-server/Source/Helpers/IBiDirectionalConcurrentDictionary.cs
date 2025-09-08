using System.Diagnostics.CodeAnalysis;

namespace SignalingServer.Helpers;

public interface IBiDirectionalConcurrentDictionary<TKey, TValue>
    where TKey : notnull
    where TValue : notnull
{
    bool TryGetByKey(TKey key, [NotNullWhen(true)] out TValue? value);
    bool TryGetByValue(TValue value, [NotNullWhen(true)] out TKey? key);

    bool ContainsKey(TKey key);
    bool ContainsValue(TValue value);

    bool TryAdd(TKey key, TValue value);
    bool TryRemoveByKey(TKey key);
    bool TryRemoveByValue(TValue value);

    KeyValuePair<TKey, TValue>[] ToArray();

    int Count { get; }
}
