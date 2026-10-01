using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Infrastructure.Configuration;
using Utah.Udot.Atspm.Infrastructure.Services.EventLogImporters;
using Utah.Udot.Atspm.Infrastructure.Services.EventLogDecoders;
using Utah.Udot.Atspm.Services;
using Utah.Udot.ATSPM.Infrastructure.Services.EventLogDecoders;
using Xunit;
using Utah.Udot.NetStandardToolkit.Common;
using Utah.Udot.NetStandardToolkit.BaseClasses;

namespace InfrastructureTests.TurningMovementCounts;

public class CameraImportTimestampTests
{
    private sealed class Archive : Utah.Udot.ATSPM.Infrastructure.WorkflowSteps.ArchiveDataEvents
    {
        public IAsyncEnumerable<CompressedEventLogBase> Run(Tuple<Device,EventLogModelBase>[] rows) => Process(rows);
    }

    [Fact]
    public async Task ArchiveKeepsControllerLocalEventsAndTimelineRangeUnchanged()
    {
        var row = new IndianaEvent { LocationIdentifier = "1",
            Timestamp = new DateTime(2026, 9, 25, 13, 45, 0), EventCode = 82, EventParam = 18 };
        await foreach (var block in new Archive().Run(new[] { Tuple.Create(new Device { Id = 2 }, (EventLogModelBase)row) }))
        {
            Assert.Equal(new DateTime(2026, 9, 25, 13, 0, 0), block.Start);
            Assert.Equal(new DateTime(2026, 9, 25, 14, 0, 0), block.End);
            Assert.Equal(DateTimeKind.Unspecified, block.Start.Kind);
            Assert.Equal(DateTimeKind.Unspecified, block.End.Kind);
            var payload = Assert.Single(((CompressedEventLogs<IndianaEvent>)block).Data);
            Assert.Equal(new DateTime(2026, 9, 25, 13, 45, 0), payload.Timestamp);
            Assert.Equal(DateTimeKind.Unspecified, payload.Timestamp.Kind);
            Assert.Equal(82, payload.EventCode);
            Assert.Equal(18, payload.EventParam);
        }
    }
    [Theory]
    [InlineData(0, DateTimeKind.Utc)]
    [InlineData(45, DateTimeKind.Utc)]
    [InlineData(0, DateTimeKind.Unspecified)]
    [InlineData(45, DateTimeKind.Unspecified)]
    [InlineData(45, DateTimeKind.Local)]
    public async Task ArchivePreservesTimelineBoundsAndPayloadWithUnspecifiedDatabaseKeys(int minute, DateTimeKind kind)
    {
        var row = new VisionCameraStatisticsEvent { LocationIdentifier="1", Timestamp=new DateTime(2026,9,25,19,minute,0,kind), Volume=2 };
        var timeline = new Timeline<StartEndRange>(new List<VisionCameraStatisticsEvent> { row }, TimeSpan.FromHours(1));
        await foreach(var block in new Archive().Run(new[]{Tuple.Create(new Device { Id=2 }, (EventLogModelBase)row)})) {
            Assert.Equal(DateTimeKind.Unspecified, block.Start.Kind);
            Assert.Equal(DateTimeKind.Unspecified, block.End.Kind);
            Assert.Equal(timeline.Start.Ticks, block.Start.Ticks);
            Assert.Equal(timeline.End.Ticks, block.End.Ticks);
            var payload = Assert.Single(((CompressedEventLogs<VisionCameraStatisticsEvent>)block).Data);
            Assert.Equal(row.Timestamp.Ticks, payload.Timestamp.Ticks);
            Assert.Equal(kind, payload.Timestamp.Kind);
        }
    }
    [Theory] [InlineData("America/Denver",13,"2026-09-25T19:45:00Z")] [InlineData("America/Phoenix",12,"2026-09-25T19:45:00Z")] [InlineData("America/Denver",13,"2026-09-25T13:45:00-06:00")]
    public async Task VisionIndianaDecoderImportsIntoLocalControllerTime(string timezone, int hour, string timestamp)
    {
        var options=new Mock<IOptionsSnapshot<EventLogImporterConfiguration>>();
        options.Setup(o=>o.Get(It.IsAny<string>())).Returns(new EventLogImporterConfiguration());
        var decoder=new VisionCameraJsonToIndianaEventDecoder();
        var device=VisionCameraAPITests.Request().Device;
        device.DeviceConfiguration.Decoders=new[]{nameof(VisionCameraJsonToIndianaEventDecoder)};
        device.Location.Latitude = timezone == "America/Denver" ? 39.32 : 33.35;
        device.Location.Longitude = timezone == "America/Denver" ? -111.09 : -111.79;
        device.Location.Approaches.Add(new Approach { Detectors=new List<Detector> { new Detector { DectectorIdentifier="NB-18", DetectorChannel=18, MovementType=Utah.Udot.Atspm.Data.Enums.MovementTypes.T } } });
        var file=Path.GetTempFileName();
        try {
            await File.WriteAllTextAsync(file,"{\"detections\":[{\"zoneName\":\"NB-18\",\"direction\":\"Through\",\"time\":\""+timestamp+"\"}]}");
            var importer=new EventLogFileImporter(new[]{decoder},NullLogger<IEventLogImporter>.Instance,options.Object);
            var rows=new List<EventLogModelBase>();
            await foreach(var item in importer.Execute(Tuple.Create(device,new FileInfo(file)))) rows.Add(item.Item2);
            var row=Assert.IsType<IndianaEvent>(Assert.Single(rows));
            Assert.Equal(82,row.EventCode); Assert.Equal(18,row.EventParam);
            Assert.Equal(hour,row.Timestamp.Hour); Assert.Equal(DateTimeKind.Unspecified,row.Timestamp.Kind);
        } finally { File.Delete(file); }
    }
    [Theory]
    [InlineData(39.32, -111.09, "2026-07-01T19:45:00Z", 13)]
    [InlineData(39.32, -111.09, "2026-01-01T19:45:00Z", 12)]
    [InlineData(33.35, -111.79, "2026-07-01T19:45:00Z", 12)]
    [InlineData(33.35, -111.79, "2026-01-01T19:45:00Z", 12)]
    [InlineData(39.32, -111.09, "2026-07-01T13:45:00-06:00", 13)]
    [InlineData(0, 0, "2026-07-01T13:45:00", 13)]
    public void VisionDecoderAloneUsesDeviceTimezoneAndPreservesUnspecified(double latitude, double longitude, string timestamp, int hour)
    {
        var device = IndianaDevice(latitude, longitude);
        using var stream = DetectionStream(timestamp);
        var row = Assert.Single(new VisionCameraJsonToIndianaEventDecoder().Decode(device, stream));
        Assert.Equal(hour, row.Timestamp.Hour);
        Assert.Equal(45, row.Timestamp.Minute);
        Assert.Equal(DateTimeKind.Unspecified, row.Timestamp.Kind);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(91, -111)]
    [InlineData(39, 181)]
    [InlineData(double.NaN, -111)]
    public void VisionDecoderRejectsMissingOrInvalidCoordinatesForUtc(double latitude, double longitude)
    {
        using var stream = DetectionStream("2026-07-01T19:45:00Z");
        var error = Assert.Throws<InvalidOperationException>(() => new VisionCameraJsonToIndianaEventDecoder()
            .Decode(IndianaDevice(latitude, longitude), stream).ToList());
        Assert.Contains("location coordinates", error.Message);
    }

    private static Device IndianaDevice(double latitude, double longitude)
    {
        var device = VisionCameraAPITests.Request().Device;
        device.Location.Latitude = latitude;
        device.Location.Longitude = longitude;
        device.Location.Approaches.Add(new Approach { Detectors = new List<Detector> {
            new Detector { DectectorIdentifier = "NB-18", DetectorChannel = 18,
                MovementType = Utah.Udot.Atspm.Data.Enums.MovementTypes.T } } });
        return device;
    }

    private static MemoryStream DetectionStream(string timestamp) => new(Encoding.UTF8.GetBytes(
        "{\"detections\":[{\"zoneName\":\"NB-18\",\"direction\":\"Through\",\"time\":\"" + timestamp + "\"}]}"));

    [Theory]
    [InlineData("America/Los_Angeles", 39.32, -111.09, 7, 13)]
    [InlineData("UTC", 39.32, -111.09, 1, 12)]
    [InlineData("UTC", 33.35, -111.79, 7, 12)]
    [InlineData("America/Los_Angeles", 33.35, -111.79, 1, 12)]
    public async Task VisionImportValidatesAgainstDeviceClockNotLogger(string loggerZone, double latitude, double longitude, int month, int hour)
    {
        var device = IndianaDevice(latitude, longitude);
        var now = new DateTimeOffset(2026, month, 25, 20, 0, 0, TimeSpan.Zero);
        var json = "{\"detections\":[" +
            $"{{\"zoneName\":\"NB-18\",\"direction\":\"Through\",\"time\":\"2026-{month:00}-25T19:45:00Z\"}}," +
            $"{{\"zoneName\":\"NB-18\",\"direction\":\"Through\",\"time\":\"2026-{month:00}-25T20:15:00Z\"}}]}}";
        var rows = await Import(new VisionCameraJsonToIndianaEventDecoder(), device, json, now, loggerZone);
        var row = Assert.IsType<IndianaEvent>(Assert.Single(rows));
        Assert.Equal(new DateTime(2026, month, 25, hour, 45, 0), row.Timestamp);
        Assert.Equal(DateTimeKind.Unspecified, row.Timestamp.Kind);
    }

    [Theory]
    [InlineData("America/Phoenix")]
    [InlineData("UTC")]
    public async Task UtcStatisticsAreValidatedInUtcAndStoredUnchanged(string loggerZone)
    {
        var json = "{\"statistics\":[{\"time\":\"2026-09-25T19:45:00Z\",\"zoneName\":\"NB-18\"},{\"time\":\"2026-09-25T20:15:00Z\"}]}";
        var rows = await Import(new JsonToVisionCameraStatisticEventDecoder(), IndianaDevice(0, 0), json,
            new DateTimeOffset(2026, 9, 25, 20, 0, 0, TimeSpan.Zero), loggerZone);
        var row = Assert.IsType<VisionCameraStatisticsEvent>(Assert.Single(rows));
        Assert.Equal(new DateTime(2026, 9, 25, 19, 45, 0, DateTimeKind.Utc), row.Timestamp);
        Assert.Equal(DateTimeKind.Utc, row.Timestamp.Kind);
    }

    [Theory]
    [InlineData(39.32, -111.09, 13)] // Device-local Denver time, an hour ahead of the logger.
    [InlineData(0, 0, 12)] // Legacy devices without coordinates keep logger-local validation.
    public async Task ControllerLocalTimestampsAndEarliestCutoffArePreserved(double latitude, double longitude, int hour)
    {
        var accepted = new DateTime(2026, 9, 25, hour, 45, 0);
        var decoder = new TimestampDecoder(new[] { accepted, accepted.AddHours(1), new DateTime(2025, 1, 1) });
        var rows = await Import(decoder, IndianaDevice(latitude, longitude), "{}",
            new DateTimeOffset(2026, 9, 25, 20, 0, 0, TimeSpan.Zero), "America/Phoenix");
        Assert.Equal(accepted, Assert.Single(rows).Timestamp);
        Assert.Equal(DateTimeKind.Unspecified, rows[0].Timestamp.Kind);
    }

    private sealed class TimestampDecoder(DateTime[] timestamps) : EventLogDecoderBase<IndianaEvent>
    {
        public override IEnumerable<IndianaEvent> Decode(Device device, Stream stream, CancellationToken cancelToken = default)
            => timestamps.Select(t => new IndianaEvent { Timestamp = t, EventCode = 82 });
    }

    private static async Task<List<EventLogModelBase>> Import(IEventLogDecoder decoder, Device device,
        string json, DateTimeOffset now, string loggerZone)
    {
        var clock = new Mock<TimeProvider>();
        clock.Setup(c => c.GetUtcNow()).Returns(now);
        clock.Setup(c => c.LocalTimeZone).Returns(TimeZoneInfo.FindSystemTimeZoneById(loggerZone));
        var options = new Mock<IOptionsSnapshot<EventLogImporterConfiguration>>();
        options.Setup(o => o.Get(It.IsAny<string>())).Returns(new EventLogImporterConfiguration {
            EarliestAcceptableDate = new DateTime(2026, 1, 1) });
        device.DeviceConfiguration.Decoders = new[] { decoder.GetType().Name };
        var file = Path.GetTempFileName();
        try
        {
            await File.WriteAllTextAsync(file, json);
            var importer = new EventLogFileImporter(new[] { decoder }, NullLogger<IEventLogImporter>.Instance, options.Object, clock.Object);
            var rows = new List<EventLogModelBase>();
            await foreach (var item in importer.Execute(Tuple.Create(device, new FileInfo(file)))) rows.Add(item.Item2);
            return rows;
        }
        finally { File.Delete(file); }
    }

}
