using FluentValidation;
using SignalingServer.Models;

namespace SignalingServer.Validation;

public class SignalMessageValidator : AbstractValidator<SignalMessage>
{
    public SignalMessageValidator()
    {
        RuleFor(m => m.Type)
            .NotEmpty().WithMessage("Type is required.");

        When(m => m.Type == SignalMessageTypes.JoinHost, () =>
        {
            RuleFor(m => m.HostId)
                .NotEmpty().WithMessage("HostId is required when Type is 'join-host'.");
        });

        When(m => m.Type == SignalMessageTypes.MsgToHost, () =>
        {
            RuleFor(m => m.Payload)
                .NotEmpty().WithMessage("Payload is required when Type is 'msg-to-host'.");
        });

        When(m => m.Type == SignalMessageTypes.MsgToClient, () =>
        {
            RuleFor(m => m.ClientId)
                .NotEmpty().WithMessage("ClientId is required when Type is 'msg-to-client'.");

            RuleFor(m => m.Payload)
                .NotEmpty().WithMessage("Payload is required when Type is 'msg-to-client'.");
        });

        // You can optionally enforce that 'host' type doesn't require anything
        When(m => m.Type == SignalMessageTypes.Host, () =>
        {
            // No additional rules
        });
    }
}