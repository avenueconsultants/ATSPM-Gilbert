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

public class WorkflowStartupTests
{
    [Fact]
    public async Task DecodeCommandInitializesAndCompletesWithEmptyFolder()
    {
        var path = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(path);
        try
        {
            using var services = new ServiceCollection().AddSingleton(Mock.Of<IDeviceRepository>()).BuildServiceProvider();
            using var scope = services.CreateScope();
            var service = new DecodeEventLogHostedService(NullLogger<DecodeEventLogHostedService>.Instance,
                services.GetRequiredService<IServiceScopeFactory>(), Options.Create(new DecodeEventsConfiguration { Path = path }));
            await service.Process(scope, Stopwatch.StartNew()).WaitAsync(TimeSpan.FromSeconds(10));
        }
        finally { Directory.Delete(path); }
    }

    [Fact]
    public async Task AggregationWorkflowInitializesAndCompletesWithoutInput()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var timeline = new Timeline<StartEndRange>(new DateTime(2026, 10, 28), new DateTime(2026, 10, 29), TimeSpan.FromMinutes(15));
        var workflow = new AggregationWorkflow(services.GetRequiredService<IServiceScopeFactory>(), timeline);
        await workflow.Initialize();
        Assert.NotNull(workflow.Input);
        Assert.NotNull(workflow.Output);
        workflow.Input.Complete();
        await workflow.Output.Completion.WaitAsync(TimeSpan.FromSeconds(10));
    }
}