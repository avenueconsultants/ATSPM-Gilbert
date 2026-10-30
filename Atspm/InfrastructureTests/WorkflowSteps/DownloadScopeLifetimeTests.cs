using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Utah.Udot.Atspm.Infrastructure.Configuration;
using Utah.Udot.Atspm.Infrastructure.Services.HostedServices;
using Utah.Udot.Atspm.Repositories.ConfigurationRepositories;
using Utah.Udot.ATSPM.Infrastructure.Workflows;
using Utah.Udot.NetStandardToolkit.Common;
using Xunit;
using System.Collections.Generic;
using System.Threading;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Services;
using Utah.Udot.ATSPM.Infrastructure.WorkflowSteps;

namespace InfrastructureTests.WorkflowSteps;

public class DownloadScopeLifetimeTests
{
    private sealed class ScopeLifetime : IDisposable
    {
        public bool Disposed { get; private set; }
        public void Dispose() => Disposed = true;
    }
    private sealed class DownloadStep(IServiceScopeFactory factory) : DownloadDeviceData(factory)
    {
        public IAsyncEnumerable<Tuple<Device, FileInfo>> Run(Device device) => Process(device);
    }
    private static async IAsyncEnumerable<Tuple<Device, FileInfo>> CheckScope(ScopeLifetime lifetime, Device device)
    {
        await Task.Yield();
        Assert.False(lifetime.Disposed);
        yield return Tuple.Create(device, new FileInfo("unused"));
        Assert.False(lifetime.Disposed);
    }

    [Fact]
    public async Task DownloadKeepsRepositoryScopeAliveUntilEnumerationCompletes()
    {
        ScopeLifetime lifetime = null;
        using var services = new ServiceCollection()
            .AddScoped(_ => lifetime = new ScopeLifetime())
            .AddScoped<IDeviceDownloader>(provider =>
            {
                var scope = provider.GetRequiredService<ScopeLifetime>();
                var downloader = new Mock<IDeviceDownloader>();
                downloader.Setup(d => d.CanExecute(It.IsAny<Device>())).Returns(true);
                downloader.Setup(d => d.Execute(It.IsAny<Device>(), It.IsAny<CancellationToken>()))
                    .Returns((Device device, CancellationToken _) => CheckScope(scope, device));
                return downloader.Object;
            }).BuildServiceProvider();
        var step = new DownloadStep(services.GetRequiredService<IServiceScopeFactory>());
        Assert.Single(await step.Run(new Device()).ToListAsync());
        Assert.True(lifetime.Disposed);
    }
}
