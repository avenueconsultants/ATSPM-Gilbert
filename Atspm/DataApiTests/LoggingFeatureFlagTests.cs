using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.DataApi.Controllers;
using Utah.Udot.Atspm.Repositories.ConfigurationRepositories;
using Xunit;

namespace DataApiTests;

public class LoggingFeatureFlagTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public async Task DisabledOrMissingFlagBlocksDownloadBeforeAccessingDevices(string? value)
    {
        var repo = new Mock<IDeviceRepository>(MockBehavior.Strict);
        var controller = Create(repo.Object, value);
        Assert.False(controller.TestDownloadEnabled());
        var response = await controller.SyncDeviceEventsAsync(new() { DeviceIds = new[] { 1 } }, default);
        Assert.Equal(403, Assert.IsType<ObjectResult>(response.Result).StatusCode);
        repo.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task EnabledFlagAllowsExistingDeviceSelection()
    {
        var repo = new Mock<IDeviceRepository>(MockBehavior.Strict);
        repo.Setup(r => r.GetList()).Returns(Array.Empty<Device>().AsQueryable());
        var controller = Create(repo.Object, "true");
        Assert.True(controller.TestDownloadEnabled());
        var response = await controller.SyncDeviceEventsAsync(new() { DeviceIds = new[] { 1 } }, default);
        Assert.Empty(response.Value!);
        repo.Verify(r => r.GetList(), Times.Once);
    }

    [Fact]
    public async Task EnabledFlagPreservesRequestValidation()
    {
        var controller = Create(Mock.Of<IDeviceRepository>(), "true");
        var response = await controller.SyncDeviceEventsAsync(new() { DeviceIds = Array.Empty<int>() }, default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    private static LoggingController Create(IDeviceRepository repo, string? value)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(value == null
            ? new Dictionary<string, string?>()
            : new Dictionary<string, string?> { ["Features:DeviceTestDownload"] = value }).Build();
        return new(repo, new Mock<IServiceScopeFactory>(MockBehavior.Strict).Object,
            NullLogger<LoggingController>.Instance, config);
    }
}
