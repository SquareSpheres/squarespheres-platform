using Serilog;
using SignalingServer.Endpoints;
using SignalingServer.Services;
using SignalingServer.Validation;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog(
    (context, configuration) =>
    {
        configuration.ReadFrom.Configuration(context.Configuration);
    }
);

// Configure WebSocket options
builder.Services.Configure<WebSocketOptions>(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(30); // Send keep-alive every 30 seconds
});

builder.Services.AddSingleton<IConnectionHandler, ConnectionHandler>();
builder.Services.AddSingleton<IMessageHandler, MessageHandler>();
builder.Services.AddSingleton<ISignalRegistry, SignalRegistry>();
builder.Services.AddSingleton<OriginValidator>();

builder.Services.AddCors();

var app = builder.Build();

app.UseCors(policyBuilder =>
{
    var validator = app.Services.GetRequiredService<OriginValidator>();
    policyBuilder
        .SetIsOriginAllowed(validator.IsOriginAllowed)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
});

app.UseWebSockets();

// Map endpoints
app.MapWebSocketEndpoints();
app.MapHomeEndpoints();
app.MapHealthEndpoints();
app.MapApiSpecEndpoints();

app.Run();
