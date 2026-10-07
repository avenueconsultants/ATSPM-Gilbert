using Utah.Udot.Atspm.Exceptions;
using Microsoft.Extensions.DependencyInjection;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Repositories.EventLogRepositories;
using Utah.Udot.ATSPM.Infrastructure.Services.EventLogDecoders;

namespace Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Decoders.EconoliteVision;

/// <summary>Builds TMC reports from archived camera statistics without contacting the camera.</summary>
public sealed class VisionBinStatisticsStored(IServiceScopeFactory scopes) : ITurningMovementCountDecoder
{
    public string DeviceLabel => "camera";
    public int MinimumBinMinutes => 15;
    public void ValidateDevice(Device device) => _ = VisionCameraAPI.CameraIndex(device);
    public Task<string> IdentityAsync(Device device, CancellationToken token)
        => Task.FromResult($"{VisionCameraAPI.Manager(device)}/{VisionCameraAPI.CameraIndex(device)}");
    public IReadOnlyList<MovementCount> MergeCounts(IEnumerable<MovementCount> counts, ICollection<string> warnings)
        => VisionCountNormalizer.Combine(counts, warnings);
    public bool CanDecode(Device device) => VisionCameraAPI.IsVisionCamera(device)
        && device.LoggingEnabled
        && (device.DeviceConfiguration?.Decoders?.Contains(nameof(JsonToVisionCameraStatisticEventDecoder)) ?? false);

    public async Task<TmcDecodeResult> DecodeAsync(TmcDecodeRequest request, CancellationToken cancellationToken)
    {
        var device = request.Device;
        if (!CanDecode(device)) throw new ReportException(400, $"Device {device.Id} cannot use {nameof(VisionBinStatisticsStored)}.");
        if (request.Options.BinSize < 15 || request.Options.BinSize % 15 != 0)
            throw new ReportException(400, $"Device {device.Id}: bin size must be a multiple of 15 minutes.");
        var zone = TimeZoneInfo.FindSystemTimeZoneById(GeoTimeZone.TimeZoneLookup.GetTimeZone(request.Location.Latitude, request.Location.Longitude).Result);
        var rows = new List<VisionCameraStatisticsEvent>();
        // A separate DbContext per camera is required: EF contexts do not support parallel reads.
        using var scope = scopes.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IEventLogRepository>();
        var utcStart = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(request.Options.Start, DateTimeKind.Unspecified), zone);
        var utcEnd = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(request.Options.End, DateTimeKind.Unspecified), zone);
        // Standard statistics archives are indexed by UTC; older archives may use local wall time.
        await foreach (var block in repository.GetData<VisionCameraStatisticsEvent>(request.Location.LocationIdentifier,
            DateTime.SpecifyKind(utcStart, DateTimeKind.Unspecified), DateTime.SpecifyKind(utcEnd, DateTimeKind.Unspecified), device.Id).WithCancellation(cancellationToken))
            rows.AddRange(block.Data.Where(r => r.Timestamp.Kind == DateTimeKind.Utc));
        await foreach (var block in repository.GetData<VisionCameraStatisticsEvent>(request.Location.LocationIdentifier,
            request.Options.Start, request.Options.End, device.Id).WithCancellation(cancellationToken))
            rows.AddRange(block.Data.Where(r => r.Timestamp.Kind != DateTimeKind.Utc));
        var mapped = VisionZoneMapper.Map(request, rows, 15, zone, true);
        return rows.Count == 0
            ? mapped with { Warnings = mapped.Warnings.Append($"Camera {device.DeviceIdentifier}: no bins in the requested range.").ToArray() }
            : mapped;
    }
}
