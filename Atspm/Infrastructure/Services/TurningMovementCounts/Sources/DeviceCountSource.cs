using Utah.Udot.Atspm.Exceptions;
using System.Text.RegularExpressions;
using Utah.Udot.Atspm.Business.TurningMovementCounts;

namespace Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Sources;

/// <summary>Adapts a device decoder to a count source, without depending on a particular manufacturer.</summary>
public sealed class DeviceCountSource<TDecoder>(TDecoder decoder) : IDeviceCountSource
    where TDecoder : class, ITurningMovementCountDecoder
{
    public async Task<TmcCountSourceResult> ReadAsync(TmcCountSourceRequest request, CancellationToken token)
    {
        var selected = request.Devices.OrderBy(d => d.Id).ToList();
        if (request.Options.ReconcileLanes && !decoder.SupportsLaneReconciliation)
            throw new ReportException(400, $"Decoder {typeof(TDecoder).Name} does not provide lane reconciliation evidence.");
        if (selected.Count == 0) throw new ReportException(400, "Select at least one device.");
        foreach (var device in selected)
        {
            if (!decoder.CanDecode(device)) throw new ReportException(400, $"Device {device.Id} cannot use decoder {typeof(TDecoder).Name}.");
            if (request.Options.BinSize % decoder.MinimumBinMinutes != 0)
                throw new ReportException(400, $"Device {device.Id}: bin size must be a multiple of {decoder.MinimumBinMinutes} minutes.");
            decoder.ValidateDevice(device);
        }
        var warnings = new List<string>();
        var identities = await Task.WhenAll(selected.Select(async d => (Device: d, Key: await decoder.IdentityAsync(d, token))));
        selected = identities.GroupBy(x => x.Key).Select(g => {
            if (g.Count() > 1) warnings.Add($"Duplicate {decoder.DeviceLabel} {g.Key}; using device {g.First().Device.Id} only.");
            return g.First().Device;
        }).ToList();
        var results = await Task.WhenAll(selected.Select(device => decoder.DecodeAsync(new TmcDecodeRequest(request.Location, device,
            device.DeviceProperties ?? new(), request.Options) { Cameras = selected }, token)));
        if (results.All(r => !r.Responded)) throw new ReportException(503, "None of the selected devices responded. " + string.Join(" ", results.SelectMany(r => r.Warnings)));
        warnings.AddRange(results.SelectMany(r => r.Warnings));
        var counts = decoder.MergeCounts(results.SelectMany(r => r.Counts), warnings);
        var label = Regex.Replace(Regex.Replace(typeof(TDecoder).Name, @"([A-Z]+)([A-Z][a-z])", "$1 $2"), @"([a-z0-9])([A-Z])", "$1 $2");
        return new($"{label} ({selected.Count} {decoder.DeviceLabel}{(selected.Count == 1 ? "" : "s")})", counts, warnings.Distinct().ToArray()) {
            ZoneEvidence = results.SelectMany(r => r.ZoneEvidence).ToArray()
        };
    }
}
