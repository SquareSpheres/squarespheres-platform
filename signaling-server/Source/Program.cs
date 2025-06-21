using FluentValidation;
using SignalingServer.Endpoints;
using SignalingServer.Models;
using SignalingServer.Services;
using SignalingServer.Validation;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IConnectionHandler, ConnectionHandler>();
builder.Services.AddSingleton<IMessageHandler, MessageHandler>();
builder.Services.AddSingleton<ISignalRegistry, SignalRegistry>();


var app = builder.Build();

app.UseWebSockets();

// Map endpoints
app.MapWebSocketEndpoints();
app.MapHomeEndpoints();
app.MapHealthEndpoints();

app.Run();