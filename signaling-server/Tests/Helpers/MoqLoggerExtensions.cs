using Microsoft.Extensions.Logging;
using Moq;

namespace SignalingServer.Tests.Helpers
{
    public static class MoqLoggerExtensions
    {
        public static void VerifyLog<T>(
            this Mock<ILogger<T>> logger,
            LogLevel level,
            string messageFragment,
            Times times
        )
            where T : class
        {
            logger.Verify(
                x =>
                    x.Log(
                        level,
                        It.IsAny<EventId>(),
                        It.Is<It.IsAnyType>(
                            (v, t) =>
                                v.ToString() != null && v.ToString()!.Contains(messageFragment)
                        ),
                        It.IsAny<Exception>(),
                        It.IsAny<Func<It.IsAnyType, Exception?, string>>()
                    ),
                times
            );
        }
    }
}
