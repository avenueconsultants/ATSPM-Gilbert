using Utah.Udot.Atspm.Business.TurningMovementCounts;

namespace Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Decoders.EconoliteVision;

public static class VisionCountNormalizer
{
    public static IReadOnlyList<MovementCount> Combine(IEnumerable<MovementCount> input, ICollection<string> messages)
    {
        var counts = input.ToList();
        // Cameras on one approach can observe different advance setbacks.
        // Select the nearest across the entire location, not just within each camera.
        var closest = counts.Where(c => c.AdvanceSetback > 0).GroupBy(c => (c.Direction, c.DirectionLabel))
            .ToDictionary(g => g.Key, g => g.Min(c => c.AdvanceSetback));
        foreach (var farther in counts.Where(c => c.AdvanceSetback > 0 && c.AdvanceSetback != closest[(c.Direction, c.DirectionLabel)]).Select(c => c.ZoneName).Distinct())
            messages.Add($"Ignored advance zone {farther}: using the closest setback across cameras.");
        counts = counts.Where(c => c.AdvanceSetback == 0 || c.AdvanceSetback == closest[(c.Direction, c.DirectionLabel)]).ToList();
        // A shared zone drawn on two cameras represents the same detection, not extra traffic.
        var owners = counts.Where(c => !string.IsNullOrEmpty(c.ZoneName)).GroupBy(c => ZoneKey(c.ZoneName), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Min(c => c.DeviceId), StringComparer.OrdinalIgnoreCase);
        foreach (var group in counts.Where(c => !string.IsNullOrEmpty(c.ZoneName)).GroupBy(c => ZoneKey(c.ZoneName), StringComparer.OrdinalIgnoreCase))
            if (group.Select(c => c.DeviceId).Distinct().Count() > 1)
                messages.Add($"Duplicate zone {group.Key} on multiple cameras; using device {owners[group.Key]}.");
        counts = counts.Where(c => string.IsNullOrEmpty(c.ZoneName) || c.DeviceId == owners[ZoneKey(c.ZoneName)]).ToList();
        return counts;
    }

    private static string ZoneKey(string name) => System.Text.RegularExpressions.Regex.IsMatch(name, @"^(RR|A|[NSEWLRBP])[1-8]\d*(-|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase) ? name.Split('-')[0] : name;

}
