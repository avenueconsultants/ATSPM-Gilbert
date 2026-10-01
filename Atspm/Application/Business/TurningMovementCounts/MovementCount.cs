using Utah.Udot.Atspm.Data.Enums;

namespace Utah.Udot.Atspm.Business.TurningMovementCounts;

public record MovementCount(DirectionTypes Direction, MovementTypes Movement, LaneTypes LaneType,
    int? LaneNumber, DateTime BinStart, int BinMinutes, int Volume)
{
    public string ZoneName { get; init; } = "";
    public string DirectionLabel { get; init; }
    public int DeviceId { get; init; }
    public string ContributorId { get; init; } = "";
    public bool ExplicitLane { get; init; }
    public int AdvanceSetback { get; init; }
}
