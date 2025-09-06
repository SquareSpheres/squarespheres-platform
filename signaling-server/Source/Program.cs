using SignalingServer.Endpoints;
using SignalingServer.Services;
using SignalingServer.Validation;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IConnectionHandler, ConnectionHandler>();
builder.Services.AddSingleton<IMessageHandler, MessageHandler>();
builder.Services.AddSingleton<ISignalRegistry, SignalRegistry>();
builder.Services.AddSingleton<CorsOriginValidator>();

builder.Services.AddCors();

var app = builder.Build();

app.UseCors(policyBuilder =>
{
    var validator = app.Services.GetRequiredService<CorsOriginValidator>();
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