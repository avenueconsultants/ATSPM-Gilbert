using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Infrastructure.Configuration;
using Utah.Udot.Atspm.Infrastructure.Services.DeviceDownloaders;
using Utah.Udot.Atspm.Repositories.EventLogRepositories;
using Utah.Udot.Atspm.Services;
using Xunit;

namespace InfrastructureTests.DeviceDownloaderTests;

public class DownloadRecoveryTests
{
    private static Device Device() => new() { Id = 17, DeviceIdentifier = "1", Ipaddress = "10.10.10.26", LoggingEnabled = true,
        Location = new Location { LocationIdentifier = "1" }, DeviceConfiguration = new() { Protocol = TransportProtocols.Http } };
    private static DeviceDownloader Create(IEventLogRepository events = null, IDownloaderClient client = null)
    {
        var options = new Mock<IOptionsSnapshot<DeviceDownloaderConfiguration>>();
        options.Setup(o => o.Get(It.IsAny<string>())).Returns(new DeviceDownloaderConfiguration { MaximumLookbackMinutes = 1440 });
        return new(client == null ? Array.Empty<IDownloaderClient>() : new[] { client }, NullLogger<IDeviceDownloader>.Instance, options.Object, events);
    }
    private static async IAsyncEnumerable<CompressedEventLogBase> Archives(params CompressedEventLogBase[] rows)
    { foreach (var row in rows) yield return row; await Task.CompletedTask; }

    [Theory]
    [InlineData(5)]
    [InlineData(90)]
    [InlineData(600)]
    public async Task ResumesFromStoredEventAcrossFrequentLateAndFailedRuns(int minutes)
    {
        var end = new DateTime(2026, 10, 28, 12, 0, 0, DateTimeKind.Local);
        var last = end.AddMinutes(-minutes).ToUniversalTime();
        var repository = new Mock<IEventLogRepository>();
        repository.Setup(r => r.GetData("1", It.IsAny<DateTime>(), It.IsAny<DateTime>(), 17))
            .Returns(() => Archives(new CompressedEventLogs<VisionCameraStatisticsEvent> { Data = new[] { new VisionCameraStatisticsEvent { Timestamp = last } } }));
        var downloader = Create(repository.Object);
        Assert.Equal(last.ToLocalTime(), await downloader.GetStoredWindowStart(Device(), end, default));
        repository.Verify(r => r.GetData("1", It.Is<DateTime>(t => t.Kind == DateTimeKind.Unspecified),
            It.Is<DateTime>(t => t.Kind == DateTimeKind.Unspecified), 17), Times.Once);
        // An unsuccessful attempt stores nothing, so retry must use the same boundary.
        Assert.Equal(last.ToLocalTime(), await downloader.GetStoredWindowStart(Device(), end, default));
    }

    [Fact]
    public async Task EmptyOrStaleHistoryUsesBoundedLookback()
    {
        var end = new DateTime(2026, 10, 28, 12, 0, 0, DateTimeKind.Local);
        var repository = new Mock<IEventLogRepository>();
        repository.Setup(r => r.GetData("1", It.IsAny<DateTime>(), It.IsAny<DateTime>(), 17)).Returns(Archives());
        Assert.Equal(end.AddDays(-1), await Create(repository.Object).GetStoredWindowStart(Device(), end, default));
    }

    [Fact]
    public async Task MixedUtcAndDeviceLocalStreamsResumeAtLeastAdvancedStream()
    {
        var end = new DateTime(2026, 10, 28, 18, 0, 0, DateTimeKind.Utc).ToLocalTime();
        var device = Device(); device.Location.Latitude = 33.35; device.Location.Longitude = -111.79;
        var repository = new Mock<IEventLogRepository>();
        repository.Setup(r => r.GetData("1", It.IsAny<DateTime>(), It.IsAny<DateTime>(), 17))
            .Returns(Archives(
                new CompressedEventLogs<VisionCameraStatisticsEvent> { Data = new[] { new VisionCameraStatisticsEvent { Timestamp = end.AddMinutes(-15).ToUniversalTime() } } },
                new CompressedEventLogs<IndianaEvent> { Data = new[] { new IndianaEvent { Timestamp = new DateTime(2026, 10, 28, 10, 0, 0) } } }));
        Assert.Equal(new DateTime(2026, 10, 28, 17, 0, 0, DateTimeKind.Utc).ToLocalTime(),
            await Create(repository.Object).GetStoredWindowStart(device, end, default));
    }

    [Theory]
    [InlineData("bad address", "1")]
    [InlineData("10.10.10.26", null)]
    [InlineData("10.10.10.26", " ")]
    public async Task InvalidDeviceDoesNotContactDownloader(string address, string identifier)
    {
        var client = new Mock<IDownloaderClient>(MockBehavior.Strict);
        client.SetupGet(c => c.Protocol).Returns(TransportProtocols.Http);
        var device = Device(); device.Ipaddress = address; device.DeviceIdentifier = identifier;
        if (address == "bad address")
            await Assert.ThrowsAsync<Utah.Udot.Atspm.Exceptions.InvalidDeviceIpAddressException>(async () =>
                await Create(client: client.Object).Execute(device).ToListAsync());
        else
            Assert.Empty(await Create(client: client.Object).Execute(device).ToListAsync());
        client.VerifyGet(c => c.Protocol, Times.Once);
        client.VerifyNoOtherCalls();
    }

    [Fact]
    public void AllWindowTokensUseOneCapturedBoundary()
    {
        var start = new DateTime(2026, 10, 27, 23, 59, 0, DateTimeKind.Local);
        var end = start.AddMinutes(90);
        var result = new ObjectPropertyParser(Device(), "[StartTime]/[EndTime]/[EndTime]", start, end).ToString();
        Assert.Equal($"{new DateTimeOffset(start):yyyy-MM-dd'T'HH:mm:sszzz}/{new DateTimeOffset(end):yyyy-MM-dd'T'HH:mm:sszzz}/{new DateTimeOffset(end):yyyy-MM-dd'T'HH:mm:sszzz}", result);
    }
}
