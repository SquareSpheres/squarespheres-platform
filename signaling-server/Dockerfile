# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy project files first for better layer caching
COPY Source/*.csproj ./Source/
COPY .config/dotnet-tools.json ./.config/
RUN dotnet restore Source/SignalingServer.csproj && \
    dotnet tool restore

# Copy source code
COPY Source/ ./Source/

# Build and publish
RUN dotnet publish Source/SignalingServer.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app
COPY --from=build /app/publish .
RUN chown -R appuser:appgroup /app

USER appuser

# Set environment for ASP.NET in container
ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true

# Expose and check health on port 8080
EXPOSE 8080

# Health check (uses wget which is included in alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "SignalingServer.dll"]
