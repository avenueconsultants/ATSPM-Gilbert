#region license
// Copyright 2026 Utah Departement of Transportation
// for ApplicationTests - Utah.Udot.ATSPM.ApplicationTests.Business.TurningMovementCounts/TurningMovementCountsServiceTests.cs
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
#endregion

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Data.Models.MeasureOptions;
using Xunit;

namespace Utah.Udot.ATSPM.ApplicationTests.Business.TurningMovementCounts;

public class TurningMovementCountsServiceTests
{
    private static readonly DateTime Start = new(2026, 4, 1, 8, 0, 0);

    [Theory]
    [InlineData(5, 120)]
    [InlineData(15, 40)]
    [InlineData(60, 10)]
    public async Task FullBin_RetainsHourlyRateAndRawCount(int binSize, int expectedHourlyVolume)
    {
        var result = await Run(Events(1, 10), binSize, binSize);

        Assert.Equal(expectedHourlyVolume, Assert.Single(result.TotalHourlyVolumes).Value);
        Assert.Equal(expectedHourlyVolume, Assert.Single(Assert.Single(result.Lanes).Volume).Value);
        Assert.Equal(10, Assert.Single(result.TotalVolumes).Value);
        Assert.Equal(10, result.TotalVolume);
    }

    [Fact]
    public async Task Counts_ExcludeEventsOutsideHalfOpenReportRange()
    {
        var end = Start.AddMinutes(16);
        var events = new[] { Start.AddTicks(-1), Start, Start.AddMinutes(15), end.AddTicks(-1), end, end.AddMinutes(1) }
            .Select(timestamp => Event(1, timestamp)).ToList();

        var result = await Run(events, 15, 16);

        Assert.Equal(new[] { 1, 2 }, result.TotalVolumes.Select(v => v.Value));
        Assert.Equal(new[] { 4, 120 }, result.TotalHourlyVolumes.Select(v => v.Value));
        Assert.Equal(3, result.TotalVolume);
        Assert.Equal(3, result.MinuteVolumes.Sum(v => v.Value));
    }

    [Fact]
    public async Task PartialFinalBin_UsesObservedDurationForHourlyRate()
    {
        var events = Enumerable.Range(0, 10)
            .Select(second => Event(1, Start.AddMinutes(15).AddSeconds(second))).ToList();

        var result = await Run(events, 15, 16);

        Assert.Equal(10, result.TotalVolumes.Last().Value);
        Assert.Equal(600, result.TotalHourlyVolumes.Last().Value);
        Assert.Equal(600, Assert.Single(result.Lanes).Volume.Last().Value);
        Assert.Equal(10, result.TotalVolume);
    }

    [Theory]
    [InlineData(8, 3, 23)]
    [InlineData(11, 1, 5)]
    [InlineData(24, 1, 3)]
    public async Task PartialBin_RoundsHourlyRateToNearestVehicleAwayFromZero(
        int durationMinutes, int count, int expectedHourlyVolume)
    {
        var result = await Run(Events(1, count), 60, durationMinutes);

        Assert.Equal(expectedHourlyVolume, Assert.Single(result.TotalHourlyVolumes).Value);
        Assert.Equal(expectedHourlyVolume, Assert.Single(Assert.Single(result.Lanes).Volume).Value);
        Assert.Equal(count, result.TotalVolume);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CombinedCounts_AreNormalizedBeforeRounding(bool sameLane)
    {
        var detectors = new[] { Detector(1, 1), Detector(2, sameLane ? 1 : 2) };
        var result = await Run(new List<IndianaEvent> { Event(1, Start), Event(2, Start.AddSeconds(1)) },
            15, 7, detectors);

        Assert.Equal(2, result.TotalVolume);
        Assert.Equal(17, Assert.Single(result.TotalHourlyVolumes).Value);
        if (sameLane)
            Assert.Equal(17, Assert.Single(Assert.Single(result.Lanes).Volume).Value);
        else
        {
            Assert.Equal(2, result.Lanes.Count);
            Assert.All(result.Lanes, lane => Assert.Equal(9, Assert.Single(lane.Volume).Value));
        }
    }

    private static Detector Detector(int channel, int lane) => new()
    {
        DetectorChannel = channel, LaneNumber = lane, LaneType = LaneTypes.V, MovementType = MovementTypes.T
    };

    private static IndianaEvent Event(short channel, DateTime timestamp) => new()
    {
        LocationIdentifier = "1001", EventCode = 82, EventParam = channel, Timestamp = timestamp
    };

    private static List<IndianaEvent> Events(short channel, int count) => Enumerable.Range(0, count)
        .Select(second => Event(channel, Start.AddSeconds(second))).ToList();

    private static Task<TurningMovementCountsLanesResult> Run(
        List<IndianaEvent> events, int binSize, int durationMinutes, IEnumerable<Detector> detectors = null) =>
        new TurningMovementCountsService().GetChartData(
            (detectors ?? new[] { Detector(1, 1) }).ToList(), LaneTypes.V, "Thru", DirectionTypes.NB,
            new TurningMovementCountsOptions
            {
                LocationIdentifier = "1001", Start = Start, End = Start.AddMinutes(durationMinutes), BinSize = binSize
            }, events, new List<Plan>(), "1001", "Main / State");
}