#region license
// Copyright 2026 Utah Departement of Transportation
// for Application - Utah.Udot.Atspm.Business.TurningMovementCounts/TurningMovementCountsService.cs
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

using System.ComponentModel.DataAnnotations;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.NetStandardToolkit.Extensions;

namespace Utah.Udot.Atspm.Business.TurningMovementCounts
{
    public class TMCData
    {
        public string Direction { get; set; }
        public string MovementType { get; set; }
        public string LaneType { get; set; }
        public DateTime Timestamp { get; set; }
        public int Count { get; set; }
    }

    public class TurningMovementCountsService
    {
        private const string CombinedThruRightMovementType = "Thru + Thru-Right";

        public Task<TurningMovementCountsLanesResult> GetChartData(
            List<Detector> detectorsByMovementType,
            LaneTypes laneType,
            string movementTypeLabel,
            DirectionTypes directionType,
            TurningMovementCountsOptions options,
            List<IndianaEvent> detectorEvents,
            List<Plan> plans,
            string locationIdentifier,
            string LocationDescription)
        {
            Validator.ValidateObject(options, new ValidationContext(options), true);

            var tmcDetectors = detectorsByMovementType
                .Where(detector => detector.LaneType == laneType)
                .ToList();
            if (tmcDetectors.Count == 0)
                return Task.FromResult<TurningMovementCountsLanesResult>(null);

            var resolvedMovementTypeLabel = GetMovementTypeLabel(tmcDetectors, movementTypeLabel, options.CombineThruRight);
            var eventsByChannel = detectorEvents
                .Where(e => e.EventCode == 82 && e.Timestamp >= options.Start && e.Timestamp < options.End)
                .ToLookup(e => (int)e.EventParam);
            var channelVolumes = tmcDetectors.GroupBy(d => d.DetectorChannel).Select(group =>
            {
                // A channel is one count source. Conflicting assignments cannot identify a physical lane.
                var laneNumbers = group.Select(d => d.LaneNumber).Distinct().ToList();
                return new
                {
                    LaneNumber = laneNumbers.Count == 1 ? laneNumbers[0] : null,
                    Volume = new VolumeCollection(options.Start, options.End, eventsByChannel[group.Key].ToList(), options.BinSize)
                };
            }).ToList();
            var allLanesMovementVolumes = new VolumeCollection(channelVolumes.Select(c => c.Volume).ToList(), options.BinSize);
            var laneVolumes = channelVolumes.GroupBy(c => c.LaneNumber).Select(group => new
            {
                LaneNumber = group.Key,
                Volume = new VolumeCollection(group.Select(c => c.Volume).ToList(), options.BinSize)
            }).ToList();
            var lanes = laneVolumes.Select(lane => new Lane
            {
                LaneNumber = lane.LaneNumber,
                MovementType = resolvedMovementTypeLabel,
                LaneType = laneType,
                Volume = lane.Volume.Items.Select(i => new DataPointForInt(i.StartTime, GetHourlyVolume(i, options.End))).ToList()
            }).ToList();

            var totalDetectorCounts = allLanesMovementVolumes.TotalDetectorCounts;
            var highestLaneCount = laneVolumes.Max(l => l.Volume.TotalDetectorCounts);
            double? laneUtilizationFactor = laneVolumes.All(l => l.LaneNumber.HasValue) && highestLaneCount > 0
                ? totalDetectorCounts / (laneVolumes.Count * (double)highestLaneCount)
                : null;

            // Keep one-minute counts for peak-hour statistics regardless of the display bin size.
            var channels = tmcDetectors.Select(d => d.DetectorChannel).ToHashSet();
            var countsByMinute = detectorEvents
                .Where(e => e.EventCode == 82 && channels.Contains(e.EventParam) &&
                    e.Timestamp >= options.Start && e.Timestamp < options.End)
                .GroupBy(e => (e.Timestamp - options.Start).Ticks / TimeSpan.TicksPerMinute)
                .ToDictionary(g => g.Key, g => g.Count());
            var minuteVolumes = new List<DataPointForInt>();
            for (var minute = options.Start; minute < options.End; minute = minute.AddMinutes(1))
                minuteVolumes.Add(new DataPointForInt(minute,
                    countsByMinute.GetValueOrDefault((minute - options.Start).Ticks / TimeSpan.TicksPerMinute)));
            var statistics = TurningMovementCountsStatistics.Calculate(minuteVolumes, options.Start, options.End, options.BinSize);

            string peakHourLabel = null;
            if (statistics.PeakHour.HasValue)
            {
                var peakStart = statistics.PeakHour.Value.Key;
                var peakEnd = peakStart.AddHours(1);
                var format = options.Start.Date == options.End.AddTicks(-1).Date ? "HH:mm" : "yyyy-MM-dd HH:mm";
                peakHourLabel = $"{peakStart.ToString(format)} - {peakEnd.ToString(format)}";
            }

            var result = new TurningMovementCountsLanesResult(
                locationIdentifier,
                LocationDescription,
                options.Start,
                options.End,
                directionType.GetAttributeOfType<DisplayAttribute>().Name,
                laneType.GetAttributeOfType<DisplayAttribute>().Name,
                resolvedMovementTypeLabel,
                plans,
                lanes,
                allLanesMovementVolumes.Items.Select(i => new DataPointForInt(i.StartTime, GetHourlyVolume(i, options.End))).ToList(),
                allLanesMovementVolumes.Items.Select(i => new DataPointForInt(i.StartTime, i.DetectorCount)).ToList(),
                totalDetectorCounts,
                peakHourLabel,
                statistics.PeakHour?.Value,
                statistics.PeakHourFactor,
                laneUtilizationFactor)
            {
                MinuteVolumes = minuteVolumes
            };
            return Task.FromResult(result);
        }

        private static int GetHourlyVolume(Utah.Udot.Atspm.Business.Common.Volume volume, DateTime reportEnd)
        {
            // Normalize the final display bin using only the observed part of that bin.
            var end = volume.EndTime < reportEnd ? volume.EndTime : reportEnd;
            return (int)Math.Round(volume.DetectorCount / (end - volume.StartTime).TotalHours,
                MidpointRounding.AwayFromZero);
        }

        private static string GetMovementTypeLabel(
            List<Detector> tmcDetectors,
            string movementTypeLabel,
            bool combineThruRight)
        {
            if (!combineThruRight || movementTypeLabel != CombinedThruRightMovementType)
            {
                return movementTypeLabel;
            }

            var hasThru = tmcDetectors.Any(detector => detector.MovementType == MovementTypes.T);
            var hasThruRight = tmcDetectors.Any(detector => detector.MovementType == MovementTypes.TR);

            if (hasThru && hasThruRight)
            {
                return CombinedThruRightMovementType;
            }

            if (hasThru)
            {
                return MovementTypes.T.GetAttributeOfType<DisplayAttribute>().Name;
            }

            if (hasThruRight)
            {
                return MovementTypes.TR.GetAttributeOfType<DisplayAttribute>().Name;
            }

            return movementTypeLabel;
        }
    }
}
