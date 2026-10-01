using System;
using System.Collections.Generic;
using System.Linq;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Data.Models.MeasureOptions;
using Xunit;
using System.Threading.Tasks;
using Utah.Udot.Atspm.Data.Models.EventLogModels;

namespace ApplicationTests.Business.TurningMovementCounts;

public class TmcResultBuilderTests
{
    private static readonly DateTime Start = new(2026, 9, 25, 10, 0, 0);
    private static TurningMovementCountsOptions Options(int bin = 15, bool combine = false) => new() {
        Start = Start, End = Start.AddHours(1), BinSize = bin, CombineThruRight = combine, LocationIdentifier = "1" };
    private static MovementCount Count(int minute, int volume, string name = "N21-1", int device = 1, MovementTypes movement = MovementTypes.T) =>
        new(DirectionTypes.NB, movement, LaneTypes.V, null, Start.AddMinutes(minute), 15, volume) { ZoneName = name, DeviceId = device };
    private static TurningMovementCountsResult Build(IEnumerable<MovementCount> counts, TurningMovementCountsOptions options = null) =>
        new TmcResultBuilder().Build(new Location { LocationIdentifier = "1", PrimaryName = "Test" }, options ?? Options(), counts,
            new[] { new Plan("0", Start, Start.AddHours(1)) }, "Vision", Array.Empty<string>());

    [Fact]
    public void FillsMissingBinsAndCalculatesIntersectionPeakHourAndPhf()
    {
        var result = Build(new[] { Count(0, 10), Count(30, 20), Count(45, 10) });
        Assert.Equal(new[] { 10, 0, 20, 10 }, result.Table.Single().Volumes.Select(v => v.Value));
        Assert.Equal(40, result.PeakHour.Value.Value);
        Assert.Equal(0.5, result.PeakHourFactor);
        Assert.Equal(1, result.Charts.Single().Lanes.Single().LaneNumber);
        Assert.Equal("Unknown", result.Charts.Single().Plans.Single().PlanDescription);
    }
    [Fact]
    public void UnalignedRequestPreservesCameraBinStartLabels()
    {
        var options = Options(); options.Start = Start.AddMinutes(7);
        var result = Build(new[] { Count(15, 10), Count(30, 20) }, options);
        Assert.Equal(Start.AddMinutes(15), result.Table.Single().Volumes.First().Timestamp);
        Assert.Equal(30, result.Charts.Single().TotalVolume);
    }
    [Fact]
    public void CombinesThroughAndSharedThroughRightButKeepsDedicatedRightSeparate()
    {
        var result = Build(new[] { Count(0, 10), Count(0, 3, movement: MovementTypes.R), Count(0, 2, movement: MovementTypes.TR) }, Options(combine: true));
        Assert.Equal(12, result.Charts.Single(c => c.MovementType == "Thru + Thru-Right").TotalVolume);
        Assert.Equal(3, result.Charts.Single(c => c.MovementType == "Right").TotalVolume);
    }
    [Fact]
    public void CombineOptionKeepsCameraThroughAndRightSeriesWhenThereAreNoSharedLanes()
    {
        var result = Build(new[] { Count(0, 34), Count(0, 1, movement: MovementTypes.R) }, Options(combine: true));
        Assert.Equal(34, result.Charts.Single(c => c.MovementType == "Thru").TotalVolume);
        Assert.Equal(1, result.Charts.Single(c => c.MovementType == "Right").TotalVolume);
    }
    [Fact]
    public void StoredBinsRollUpAndPhfIsAbsentForThirtyMinuteBins()
    {
        var result = Build(new[] { Count(0, 10), Count(15, 20), Count(30, 5) }, Options(30));
        Assert.Equal(new[] { 30, 5 }, result.Table.Single().Volumes.Select(v => v.Value));
        Assert.Null(result.PeakHourFactor);
    }
    [Fact]
    public void UnmatchedZoneNamesRemainSeparateDirectionsAcrossCameras()
    {
        var result = Build(new[] {
            Count(0, 10, "Loading-Dock A") with { Direction = DirectionTypes.NA, DirectionLabel = "Loading-Dock A" },
            Count(0, 20, "Loading-Dock B", 2) with { Direction = DirectionTypes.NA, DirectionLabel = "Loading-Dock B" }
        });
        Assert.Equal(2, result.Charts.Count);
        Assert.Equal(30, result.Charts.Sum(c => c.TotalVolume));
        Assert.Contains(result.Charts, c => c.Direction == "Loading-Dock A");
        Assert.Contains(result.Charts, c => c.Direction == "Loading-Dock B");
    }
    [Fact]
    public void GenericBuilderDoesNotDiscardSameNamedContributorsFromDifferentSources()
    {
        var result = Build(new[] { Count(0, 10), Count(0, 20, device: 2) });
        Assert.Equal(30, result.Charts.Single().TotalVolume);
        Assert.Empty(result.Warnings);
    }
    [Fact]
    public void EmptyDataReturnsEmptyChartsAndTable()
    {
        var result = Build(Array.Empty<MovementCount>());
        Assert.Empty(result.Charts); Assert.Empty(result.Table); Assert.Null(result.PeakHour);
    }
    [Fact]
    public async Task ControllerFixtureAndNormalizedCountsHaveSameTotalsPeakHourAndPhf()
    {
        var bins = new[] { 10, 5, 20, 10 };
        var events = bins.SelectMany((volume, bin) => Enumerable.Range(0, volume).Select(i => new IndianaEvent {
            LocationIdentifier = "1", EventCode = 82, EventParam = 1, Timestamp = Start.AddMinutes(bin * 15).AddSeconds(i + 1)
        })).ToList();
        var controller = await new TurningMovementCountsService().GetChartData(
            new List<Detector> { new() { DetectorChannel = 1, LaneNumber = 1, LaneType = LaneTypes.V, MovementType = MovementTypes.T } },
            LaneTypes.V, "Thru", DirectionTypes.NB, Options(), events, new List<Plan>(), "1", "Test");
        var device = Build(bins.Select((volume, bin) => Count(bin * 15, volume))).Charts.Single();
        Assert.Equal(controller.TotalVolume, device.TotalVolume);
        Assert.Equal(controller.TotalVolumes.Select(v => v.Value), device.TotalVolumes.Select(v => v.Value));
        Assert.Equal(controller.PeakHour, device.PeakHour);
        Assert.Equal(controller.PeakHourVolume, device.PeakHourVolume);
        Assert.Equal(controller.PeakHourFactor, device.PeakHourFactor);
    }
}
