using Utah.Udot.Atspm.Exceptions;
using Utah.Udot.Atspm.Business.TurningMovementCounts;

namespace Utah.Udot.Atspm.ReportApi.ReportServices;

public sealed class TurningMovementCountReportService(ILocationRepository locations, TmcCountSourceResolver resolver,
    TmcResultBuilder builder) : ReportServiceBase<TurningMovementCountsOptions, TurningMovementCountsResult>
{
    public override async Task<TurningMovementCountsResult> ExecuteAsync(TurningMovementCountsOptions options,
        IProgress<int> progress = null, CancellationToken cancelToken = default)
    {
        if (options.BinSize < 1 || options.BinSize > 1440 || options.End <= options.Start || (options.End - options.Start).TotalDays > 31)
            throw new ReportException(400, "Choose a bin size from 1 to 1440 minutes and a date range of up to 31 days.");
        var location = locations.GetLatestVersionOfLocation(options.LocationIdentifier, options.Start)
            ?? throw new ReportException(400, "Location not found");
        var (source, request) = resolver.Resolve(location, options);
        var data = await source.ReadAsync(request, cancelToken);
        if (options.ReconcileLanes)
            return new TurningMovementCountsResult { Source = data.Label, Warnings = data.Warnings,
                ZoneEvidence = data.ZoneEvidence, Charts = new(), Table = new() };
        var plans = data.Plans.Count > 0 ? data.Plans : new[] { new Plan("0", options.Start, options.End) };
        return builder.Build(location, options, data.Counts, plans, data.Label, data.Warnings, data.BinOrigin);
    }
}
