using System.ComponentModel.DataAnnotations;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Data.Models.MeasureOptions;
using Utah.Udot.NetStandardToolkit.Extensions;

namespace Utah.Udot.Atspm.Business.TurningMovementCounts;

public sealed class TmcResultBuilder
{
    public TurningMovementCountsResult Build(Location location, TurningMovementCountsOptions options,
        IEnumerable<MovementCount> input, IReadOnlyList<Plan> plans, string source, IEnumerable<string> warnings, DateTime? sourceBinOrigin = null)
    {
        var messages = warnings.ToList();
        var counts = input.Where(c => c.BinStart >= options.Start && c.BinStart < options.End).ToList();
        var result = new TurningMovementCountsResult { Source = source, Charts = new(), Table = new() };
        var bins = new List<DateTime>();
        var binOrigin = sourceBinOrigin ?? options.Start.Date.AddMinutes(Math.Ceiling(options.Start.TimeOfDay.TotalMinutes / options.BinSize) * options.BinSize);
        // Keep camera bin-start labels when a request begins between bin boundaries.
        counts = counts.Where(c => c.BinStart >= binOrigin).ToList();
        for (var time = binOrigin; time < options.End; time = time.AddMinutes(options.BinSize)) bins.Add(time);
        var combinedGroups = counts.GroupBy(c => (c.Direction, c.DirectionLabel, c.LaneType))
            .Where(g => g.Any(c => c.Movement == MovementTypes.T) && g.Any(c => c.Movement == MovementTypes.TR))
            .Select(g => g.Key).ToHashSet();
        foreach (var group in counts.GroupBy(c => new {
            Direction = c.DirectionLabel ?? Display(c.Direction), c.LaneType,
            Movement = options.CombineThruRight && combinedGroups.Contains((c.Direction, c.DirectionLabel, c.LaneType))
                && c.Movement is MovementTypes.T or MovementTypes.TR
                ? "Thru + Thru-Right" : Display(c.Movement) }))
        {
            if (!group.Any(c => c.Volume > 0)) continue;
            var lanes = new List<Lane>();
            var laneGroups = group.GroupBy(c => c.ExplicitLane ? $"lane:{c.LaneNumber}" : $"{c.DeviceId}:{c.ZoneName}")
                .OrderBy(g => g.First().LaneNumber).ThenBy(g => g.First().ZoneName);
            foreach (var lane in laneGroups)
            {
                var names = lane.Select(c => c.ZoneName).Distinct().OrderBy(n => n).ToArray();
                if (names.Length > 1) messages.Add($"Zones {string.Join(", ", names)} map to the same lane; counts summed.");
                var byBin = lane.GroupBy(c => binOrigin.AddMinutes(
                    Math.Floor((c.BinStart - binOrigin).TotalMinutes / options.BinSize) * options.BinSize))
                    .ToDictionary(g => g.Key, g => g.Sum(c => c.Volume));
                lanes.Add(new Lane { LaneNumber = lane.First().LaneNumber ?? lanes.Count + 1,
                    LaneType = group.Key.LaneType, MovementType = group.Key.Movement,
                    // Lane series, like the controller path, display hourly flow rates.
                    Volume = bins.Select(t => new DataPointForInt(t, (int)(byBin.GetValueOrDefault(t) * 60.0 / options.BinSize))).ToList() });
            }
            var totals = bins.Select(t => new DataPointForInt(t,
                group.Where(c => c.BinStart >= t && c.BinStart < t.AddMinutes(options.BinSize)).Sum(c => c.Volume))).ToList();
            var row = new TurningMovementCountData { Direction = group.Key.Direction, LaneType = Display(group.Key.LaneType),
                MovementType = group.Key.Movement, Volumes = totals };
            var metrics = new TurningMovementCountsResult { Table = new() { new TurningMovementCountData {
                LaneType = "Vehicle", Volumes = totals } } };
            TmcPeakMetrics.ComputePeakHourAndFactor(metrics, options.Start, options.End, options.BinSize);
            var contributors = group.Where(c => !string.IsNullOrEmpty(c.ContributorId)).Select(c => c.ContributorId).Distinct().Count();
            var utilizationDivisor = contributors > 0 ? contributors : lanes.Count;
            var highestLane = laneGroups.Select(g => g.Sum(c => c.Volume)).DefaultIfEmpty().Max();
            var peak = metrics.PeakHour;
            result.Charts.Add(new TurningMovementCountsLanesResult(location.LocationIdentifier,
                $"{location.PrimaryName} & {location.SecondaryName}".Trim(' ', '&'), options.Start, options.End,
                row.Direction, row.LaneType, row.MovementType, plans, lanes,
                totals.Select(v => new DataPointForInt(v.Timestamp, (int)(v.Value * 60.0 / options.BinSize))).ToList(),
                totals, totals.Sum(v => v.Value), peak.HasValue ? $"{peak.Value.Key:HH:mm} - {peak.Value.Key.AddHours(1):HH:mm}" : null,
                peak?.Value, metrics.PeakHourFactor, highestLane > 0 ? totals.Sum(v => v.Value) / (double)(utilizationDivisor * highestLane) : null));
            result.Table.Add(row);
        }
        TmcPeakMetrics.ComputePeakHourAndFactor(result, options.Start, options.End, options.BinSize);
        TmcPeakMetrics.SetPeakHourVolume(result);
        result.Warnings = messages.Distinct().ToArray();
        return result;
    }

    public static string Display<T>(T value) where T : Enum => value.GetAttributeOfType<DisplayAttribute>()?.Name ?? value.ToString();
}
