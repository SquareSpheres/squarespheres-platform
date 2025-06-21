using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;

namespace SignalingServer.Helpers;

/// <summary>
/// A thread-safe bidirectional dictionary that allows lookups in both directions:
/// from key to value and from value to key.
/// </summary>
/// <typeparam name="TKey">The type of the key. Must be non-nullable.</typeparam>
/// <typeparam name="TValue">The type of the value. Must be non-nullable.</typeparam>
public class BiDirectionalConcurrentDictionary<TKey, TValue> : IBiDirectionalConcurrentDictionary<TKey, TValue>
    where TKey : notnull
    where TValue : notnull
{
    private readonly ConcurrentDictionary<TKey, TValue> _forward = new();
    private readonly ConcurrentDictionary<TValue, TKey> _reverse = new();

    /// <summary>
    /// Attempts to get the value associated with the specified key.
    /// </summary>
    /// <param name="key">The key to look up.</param>
    /// <param name="value">When this method returns, contains the value associated with the specified key, if the key is found; otherwise, <c>null</c>.</param>
    /// <returns><c>true</c> if the key was found; otherwise, <c>false</c>.</returns>
    public bool TryGetByKey(TKey key, [NotNullWhen(true)] out TValue? value)
        => _forward.TryGetValue(key, out value);

    /// <summary>
    /// Attempts to get the key associated with the specified value.
    /// </summary>
    /// <param name="value">The value to look up.</param>
    /// <param name="key">When this method returns, contains the key associated with the specified value, if the value is found; otherwise, <c>null</c>.</param>
    /// <returns><c>true</c> if the value was found; otherwise, <c>false</c>.</returns>
    public bool TryGetByValue(TValue value, [NotNullWhen(true)] out TKey? key)
        => _reverse.TryGetValue(value, out key);

    /// <summary>
    /// Determines whether the dictionary contains the specified key.
    /// </summary>
    /// <param name="key">The key to locate.</param>
    /// <returns><c>true</c> if the dictionary contains the key; otherwise, <c>false</c>.</returns>
    public bool ContainsKey(TKey key) => _forward.ContainsKey(key);

    /// <summary>
    /// Determines whether the dictionary contains the specified value.
    /// </summary>
    /// <param name="value">The value to locate.</param>
    /// <returns><c>true</c> if the dictionary contains the value; otherwise, <c>false</c>.</returns>
    public bool ContainsValue(TValue value) => _reverse.ContainsKey(value);

    /// <summary>
    /// Attempts to add the specified key and value to the dictionary.
    /// </summary>
    /// <param name="key">The key of the element to add.</param>
    /// <param name="value">The value of the element to add.</param>
    /// <returns><c>true</c> if the key/value pair was added successfully; otherwise, <c>false</c>.</returns>
    public bool TryAdd(TKey key, TValue value)
    {
        if (_forward.TryAdd(key, value) && _reverse.TryAdd(value, key))
        {
            return true;
        }

        _forward.TryRemove(key, out _);
        _reverse.TryRemove(value, out _);
        return false;
    }

    /// <summary>
    /// Attempts to remove the element with the specified key.
    /// </summary>
    /// <param name="key">The key of the element to remove.</param>
    /// <returns><c>true</c> if the element was removed successfully; otherwise, <c>false</c>.</returns>
    public bool TryRemoveByKey(TKey key)
    {
        if (_forward.TryRemove(key, out var value))
        {
            _reverse.TryRemove(value, out _);
            return true;
        }

        return false;
    }

    /// <summary>
    /// Attempts to remove the element with the specified value.
    /// </summary>
    /// <param name="value">The value of the element to remove.</param>
    /// <returns><c>true</c> if the element was removed successfully; otherwise, <c>false</c>.</returns>
    public bool TryRemoveByValue(TValue value)
    {
        if (_reverse.TryRemove(value, out var key))
        {
            _forward.TryRemove(key, out _);
            return true;
        }

        return false;
    }

    /// <summary>
    /// Returns a snapshot of the current contents of the dictionary as an array of key-value pairs.
    /// </summary>
    /// <returns>An array of key-value pairs.</returns>
    public KeyValuePair<TKey, TValue>[] ToArray() => _forward.ToArray();
}