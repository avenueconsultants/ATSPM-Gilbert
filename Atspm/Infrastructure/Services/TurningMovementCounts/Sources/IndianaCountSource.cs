using Utah.Udot.Atspm.Exceptions;
using Utah.Udot.Atspm.TempExtensions;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Extensions;
using Utah.Udot.Atspm.Repositories.EventLogRepositories;

namespace Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Sources;

public sealed class IndianaCountSource(IIndianaEventLogRepository repository, PlanService planService) : ITurningMovementCountSource
{
    public Task<TmcCountSourceResult> ReadAsync(TmcCountSourceRequest request, CancellationToken token)
    {
        var options = request.Options;
        var location = request.Location;
        var events = repository.GetEventsBetweenDates(location.LocationIdentifier, options.Start.AddHours(-12), options.End.AddHours(12)).ToList();
        if (events.Count == 0) throw new ReportException(400, "No Controller Event Logs found for Location");
        var plans = planService.GetBasicPlans(options.Start, options.End, location.LocationIdentifier,
            events.GetPlanEvents(options.Start.AddHours(-12), options.End.AddHours(12)).ToList()).ToList();
        var counts = new List<MovementCount>();
        foreach (var approach in location.Approaches)
        foreach (var detector in approach.GetDetectorsForMetricType(options.MetricTypeId))
        {
            token.ThrowIfCancellationRequested();
            if (detector.MovementType is not (MovementTypes.T or MovementTypes.TR or MovementTypes.TL or MovementTypes.L or MovementTypes.R)) continue;
            var rows = events.GetEventsByEventCodesParamWithOffsetAndLatencyCorrection(options.Start, options.End,
                new short[] { 82 }, detector.DetectorChannel, detector.GetOffset(), detector.LatencyCorrection);
            var bins = new VolumeCollection(options.Start, options.End, rows.ToList(), options.BinSize);
            counts.AddRange(bins.Items.Select(bin => new MovementCount(approach.DirectionTypeId, detector.MovementType,
                detector.LaneType, detector.LaneNumber, bin.StartTime, options.BinSize, bin.DetectorCount) {
                ExplicitLane = true, ContributorId = $"detector:{detector.Id}" }));
        }
        return Task.FromResult(new TmcCountSourceResult("Indiana Events (ATSPM)", counts, Array.Empty<string>()) { Plans = plans, BinOrigin = options.Start });
    }
}
