#region license
// Copyright 2026 Utah Departement of Transportation
// for ReportApi - Utah.Udot.Atspm.ReportApi.ReportServices/TurningMovementCountReportService.cs
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
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models.EventLogModels;

namespace Utah.Udot.Atspm.ReportApi.ReportServices
{
    /// <summary>
    /// Turning movement count report service
    /// </summary>
    public class TurningMovementCountReportService : ReportServiceBase<TurningMovementCountsOptions, TurningMovementCountsResult>
    {
        private const string CombinedThruRightMovementType = "Thru + Thru-Right";
        private readonly IIndianaEventLogRepository controllerEventLogRepository;
        private readonly TurningMovementCountsService turningMovementCountsService;
        private readonly ILocationRepository LocationRepository;
        private readonly PlanService planService;

        /// <inheritdoc/>
        public TurningMovementCountReportService(
            IIndianaEventLogRepository controllerEventLogRepository,
            TurningMovementCountsService turningMovementCountsService,
            ILocationRepository LocationRepository,
            PlanService planService
            )
        {
            this.controllerEventLogRepository = controllerEventLogRepository;
            this.turningMovementCountsService = turningMovementCountsService;
            this.LocationRepository = LocationRepository;
            this.planService = planService;
        }

        /// <inheritdoc/>
        public override async Task<TurningMovementCountsResult> ExecuteAsync(TurningMovementCountsOptions parameter, IProgress<int> progress = null, CancellationToken cancelToken = default)
        {
            Validator.ValidateObject(parameter, new ValidationContext(parameter), true);
            cancelToken.ThrowIfCancellationRequested();
            var Location = LocationRepository.GetLatestVersionOfLocation(parameter.LocationIdentifier, parameter.Start);

            if (Location == null)
            {
                //return BadRequest("Location not found");
                return await Task.FromException<TurningMovementCountsResult>(new NullReferenceException("Location not found"));
            }

            var configurationChange = LocationRepository.GetList()
                .Where(l => l.LocationIdentifier == parameter.LocationIdentifier &&
                    l.VersionAction != LocationVersionActions.Delete &&
                    l.Start > parameter.Start)
                .OrderBy(l => l.Start)
                .Select(l => (DateTime?)l.Start)
                .FirstOrDefault();
            if (configurationChange.HasValue && configurationChange.Value < parameter.End)
                throw new ValidationException($"Location configuration changes at {configurationChange.Value:yyyy-MM-dd HH:mm:ss}. Generate separate reports ending and starting at that time.");

            var detectorWindows = GetDetectorWindows(Location, parameter);
            ValidateConfigurationWindows(detectorWindows, Location.Start, configurationChange);
            ValidateChannelAssignments(detectorWindows);

            var controllerEventLogs = controllerEventLogRepository.GetEventsBetweenDates(Location.LocationIdentifier, parameter.Start.AddHours(-12), parameter.End.AddHours(12)).ToList();

            if (controllerEventLogs.IsNullOrEmpty())
            {
                //return Ok("No Controller Event Logs found for Location");
                return await Task.FromException<TurningMovementCountsResult>(new NullReferenceException("No Controller Event Logs found for Location"));
            }

            // Capture activity before plan processing can move a boundary event to the report start.
            var hasControllerActivityInRange = controllerEventLogs.Any(e =>
                e.Timestamp >= parameter.Start && e.Timestamp < parameter.End);

            var planEvents = controllerEventLogs.GetPlanEvents(
            parameter.Start.AddHours(-12),
                parameter.End.AddHours(12)).ToList();
            var plans = planService.GetBasicPlans(parameter.Start, parameter.End, parameter.LocationIdentifier, planEvents);
            var eventsByChannel = controllerEventLogs.Where(e => e.EventCode == 82).ToLookup(e => (int)e.EventParam);
            var tasks = new List<Task<IEnumerable<TurningMovementCountsLanesResult>>>();

            foreach (var laneType in Enum.GetValues(typeof(LaneTypes)))
            {
                cancelToken.ThrowIfCancellationRequested();
                tasks.Add(GetChartDataForLaneType(
                    Location, (LaneTypes)laneType, parameter, detectorWindows, eventsByChannel, plans.ToList()));
            }

            var results = await Task.WhenAll(tasks);

            var finalLaneResultcheck = results.Where(result => result != null).SelectMany(r => r).ToList();

            // Logs in the query padding alone do not establish zero traffic in the requested interval.
            // Corrected detector events may still supply counts even when their raw timestamps are outside it.
            if (!hasControllerActivityInRange && finalLaneResultcheck.All(chart => chart.TotalVolume == 0))
                finalLaneResultcheck.Clear();

            var finalResultcheck = new TurningMovementCountsResult
            {
                Charts = finalLaneResultcheck,
                Table = new List<TurningMovementCountData>()
            };

            //Get Lane results by direction and movement type and bin size anc create a list of TurningMovementCountData for each direction and movement type
            foreach (var direction in Location.Approaches.Select(a => a.DirectionTypeId).Distinct())
            {
                var distinctLaneTypesByDirection = finalLaneResultcheck.Where(r => r.Direction == direction.GetAttributeOfType<DisplayAttribute>().Name).Select(i => i.LaneType).Distinct().ToList();
                foreach (var laneTypeByDirection in distinctLaneTypesByDirection)
                {
                    var laneResultsByDirection = finalLaneResultcheck.Where(r => r.Direction == direction.GetAttributeOfType<DisplayAttribute>().Name && r.LaneType == laneTypeByDirection).ToList();
                    var movementTypes = laneResultsByDirection.Select(r => r.MovementType).Distinct().ToList();
                    foreach (var movementType in movementTypes)
                    {
                        var laneResultsByMovementType = laneResultsByDirection.Where(r => r.MovementType == movementType).ToList();
                        if (laneResultsByMovementType.IsNullOrEmpty())
                        {
                            continue;
                        }
                        var turningMovementCountData = new TurningMovementCountData
                        {
                            Direction = direction.GetAttributeOfType<DisplayAttribute>().Name,
                            LaneType = laneResultsByMovementType.FirstOrDefault().LaneType,
                            MovementType = movementType
                        };

                        //sum the totalVolumes.value grouped by toalVolume.Start and add to turningMovementCountData.Volumes
                        turningMovementCountData.Volumes = laneResultsByMovementType
                            .SelectMany(r => r.TotalVolumes)
                            .GroupBy(v => v.Timestamp)
                            .Select(g => new DataPointForInt(g.Key, g.Sum(v => v.Value)))
                            .ToList();
                        finalResultcheck.Table.Add(turningMovementCountData);
                    }
                }
            }
            ComputePeakHourAndFactor(finalResultcheck, parameter.Start, parameter.End, parameter.BinSize);
            SetPeakHourVolume(finalResultcheck);
            return finalResultcheck;
        }

        private void SetPeakHourVolume(TurningMovementCountsResult result)
        {
            foreach (var row in result.Table)
            {
                if (!result.PeakHour.HasValue)
                {
                    row.PeakHourVolume = null;
                    continue;
                }

                var start = result.PeakHour.Value.Key;
                var total = result.Charts
                    .Where(c => c.Direction == row.Direction && c.LaneType == row.LaneType && c.MovementType == row.MovementType)
                    .SelectMany(c => c.MinuteVolumes)
                    .Where(v => v.Timestamp >= start && v.Timestamp < start.AddHours(1))
                    .Sum(v => v.Value);
                row.PeakHourVolume = new DataPointForInt(start, total);
            }
        }

        private void ComputePeakHourAndFactor(TurningMovementCountsResult result, DateTime start, DateTime end, int binSize)
        {
            var vehicleLaneType = LaneTypes.V.GetAttributeOfType<DisplayAttribute>().Name;
            var minutes = result.Charts.Where(c => c.LaneType == vehicleLaneType)
                .SelectMany(c => c.MinuteVolumes).ToList();
            var statistics = TurningMovementCountsStatistics.Calculate(minutes, start, end, binSize);
            result.PeakHour = statistics.PeakHour;
            result.PeakHourFactor = statistics.PeakHourFactor;
        }

        private static IReadOnlyList<(string DisplayName, MovementTypes[] MovementTypes)> GetMovementTypeGroups(bool combineThruRight)
        {
            var groups = Enum.GetValues<MovementTypes>()
                .Where(m => !combineThruRight || (m != MovementTypes.T && m != MovementTypes.TR))
                .Select(m => (m.GetAttributeOfType<DisplayAttribute>().Name, new[] { m }))
                .ToList();
            if (combineThruRight)
                groups.Add((CombinedThruRightMovementType, new[] { MovementTypes.T, MovementTypes.TR }));
            return groups;
        }

        private sealed record DetectorWindow(Detector Detector, DateTime Start, DateTime End, double Offset);

        private static List<DetectorWindow> GetDetectorWindows(Location location, TurningMovementCountsOptions options)
        {
            var windows = new List<DetectorWindow>();
            foreach (var detector in location.Approaches.SelectMany(a => a.GetDetectorsForMetricType(options.MetricTypeId)))
            {
                var offset = detector.GetOffset();
                // Installation/retirement dates describe raw channel events, before travel-time correction.
                var start = options.Start.AddMilliseconds(-offset).AddSeconds(detector.LatencyCorrection);
                var end = options.End.AddMilliseconds(-offset).AddSeconds(detector.LatencyCorrection);
                if (detector.DateAdded > start)
                    start = detector.DateAdded;
                if (detector.DateDisabled.HasValue && detector.DateDisabled.Value < end)
                    end = detector.DateDisabled.Value;
                if (start < end)
                    windows.Add(new DetectorWindow(detector, start, end, offset));
            }
            return windows;
        }

        private static void ValidateConfigurationWindows(List<DetectorWindow> windows, DateTime versionStart, DateTime? nextVersionStart)
        {
            foreach (var window in windows)
            {
                if (window.Start < versionStart)
                    throw new ValidationException($"Detector timing correction crosses the location configuration change at {versionStart:yyyy-MM-dd HH:mm:ss}. Choose a later report start.");
                if (nextVersionStart.HasValue && window.End > nextVersionStart.Value)
                    throw new ValidationException($"Detector timing correction crosses the location configuration change at {nextVersionStart.Value:yyyy-MM-dd HH:mm:ss}. Choose an earlier report end.");
            }
        }

        private static void ValidateChannelAssignments(List<DetectorWindow> windows)
        {
            foreach (var channel in windows.GroupBy(w => w.Detector.DetectorChannel))
            {
                var assignments = channel.ToList();
                for (var i = 0; i < assignments.Count; i++)
                {
                    for (var j = i + 1; j < assignments.Count; j++)
                    {
                        var left = assignments[i];
                        var right = assignments[j];
                        if (left.Start >= right.End || right.Start >= left.End)
                            continue;
                        if (left.Detector.Approach.DirectionTypeId != right.Detector.Approach.DirectionTypeId ||
                            left.Detector.LaneType != right.Detector.LaneType ||
                            left.Detector.MovementType != right.Detector.MovementType ||
                            left.Offset != right.Offset ||
                            left.Detector.LatencyCorrection != right.Detector.LatencyCorrection)
                            throw new ValidationException($"Detector channel {channel.Key} has conflicting assignments or timing corrections during the selected range. Correct the detector configuration before generating turning movement counts.");
                    }
                }
            }
        }

        private async Task<IEnumerable<TurningMovementCountsLanesResult>> GetChartDataForLaneType(
            Location Location,
            LaneTypes laneType,
            TurningMovementCountsOptions options,
            List<DetectorWindow> detectorWindows,
            ILookup<int, IndianaEvent> eventsByChannel,
            List<Plan> plans)
        {
            if (!detectorWindows.Any(w => w.Detector.LaneType == laneType))
            {
                return null;
            }
            var directions = Location.Approaches.Select(a => a.DirectionTypeId).Distinct().ToList();
            var tasks = new List<Task<TurningMovementCountsLanesResult>>();
            foreach (var direction in directions)
            {
                var detectorsForDirection = detectorWindows.Where(w =>
                    w.Detector.Approach.DirectionTypeId == direction && w.Detector.LaneType == laneType).ToList();

                foreach (var movementTypeGroup in GetMovementTypeGroups(options.CombineThruRight))
                {
                    var movementTypeDetectors = detectorsForDirection
                        .Where(w => movementTypeGroup.MovementTypes.Contains(w.Detector.MovementType))
                        .ToList();

                    if (!movementTypeDetectors.IsNullOrEmpty())
                    {
                        tasks.Add(GetChartDataByMovementType(
                            options,
                            plans,
                            eventsByChannel,
                            movementTypeDetectors,
                            movementTypeGroup.DisplayName,
                            laneType,
                            Location.LocationIdentifier,
                            Location.LocationDescription(),
                            direction));
                    }
                }
            }

            var results = await Task.WhenAll(tasks);

            return results.Where(result => result != null).OrderBy(r => r.Direction).ThenBy(r => r.MovementType);
        }

        private async Task<TurningMovementCountsLanesResult> GetChartDataByMovementType(
            TurningMovementCountsOptions options,
            List<Plan> planEvents,
            ILookup<int, IndianaEvent> eventsByChannel,
            List<DetectorWindow> detectorWindows,
            string movementTypeLabel,
            LaneTypes laneType,
            string locationIdentifier,
            string LocationDescription,
            DirectionTypes directionType)
        {
            var detectorEvents = new List<IndianaEvent>();
            foreach (var channel in detectorWindows.GroupBy(w => w.Detector.DetectorChannel))
            {
                var assignments = channel.OrderBy(w => w.Detector.Id).ToList();
                foreach (var rawEvent in eventsByChannel[channel.Key])
                {
                    // Equivalent overlapping assignments share a source; disjoint assignments retain their own dates.
                    var assignment = assignments.FirstOrDefault(w => rawEvent.Timestamp >= w.Start && rawEvent.Timestamp < w.End);
                    if (assignment == null)
                        continue;
                    var timestamp = rawEvent.Timestamp.AddMilliseconds(assignment.Offset)
                        .AddSeconds(-assignment.Detector.LatencyCorrection);
                    if (timestamp >= options.Start && timestamp < options.End)
                        detectorEvents.Add(new IndianaEvent
                        {
                            LocationIdentifier = rawEvent.LocationIdentifier,
                            EventCode = rawEvent.EventCode,
                            EventParam = rawEvent.EventParam,
                            Timestamp = timestamp
                        });
                }
            }
            var result = turningMovementCountsService.GetChartData(
                detectorWindows.Select(w => w.Detector).ToList(),
                laneType,
                movementTypeLabel,
                directionType,
                options,
                detectorEvents,
                planEvents,
                locationIdentifier,
                LocationDescription);

            return await result;
        }
    }
}
