#region license
// Copyright 2025 Utah Departement of Transportation
// for EventLogUtility - %Namespace%/Program.cs
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
// http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
#endregion

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.CommandLine.Builder;
using System.CommandLine.Hosting;
using System.CommandLine.Parsing;
using System.Diagnostics;
using Utah.Udot.Atspm.EventLogUtility.Commands;
using Utah.Udot.Atspm.Infrastructure.Extensions;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                if (!EventLog.SourceExists("Atspm"))
                    EventLog.CreateEventSource(AppDomain.CurrentDomain.FriendlyName, "Atspm");
            }

            var rootCmd = new EventLogCommands();
            var cmdBuilder = new CommandLineBuilder(rootCmd);

            cmdBuilder.UseDefaults();

            cmdBuilder.UseHost(hostBuilderFactory =>
            {
                return Host.CreateDefaultBuilder(args)
                    .UseConsoleLifetime()
                    .ApplyVolumeConfiguration()
                    .ConfigureAppConfiguration((h, c) =>
                    {
                        c.AddUserSecrets<Program>(optional: true); // Load secrets first
                        c.AddCommandLine(args);                    // Override with command-line args

                    })
                    .ConfigureLogging((context, logging) =>
                    {
                        if (OperatingSystem.IsWindows())
                        {
                            logging.AddEventLog(options =>
                            {
                                options.SourceName = AppDomain.CurrentDomain.FriendlyName;
                                options.LogName = "Atspm";
                            });
                        }

                        // Additional logging providers can be configured here
                    })
                    .ConfigureServices((context, services) =>
                    {
                        services.AddAtspmDbContext(context);
                        services.AddAtspmEFConfigRepositories();
                        services.AddAtspmEFEventLogRepositories();
                        services.AddAtspmEFAggregationRepositories();
                        services.AddDownloaderClients();
                        services.AddDeviceDownloaders(context);
                        services.AddEventLogDecoders();
                        services.AddEventLogImporters(context);
                    });
            },
            host =>
            {
                var cmd = host.GetInvocationContext().ParseResult.CommandResult.Command;
                host.ConfigureServices((context, services) =>
                {
                    if (cmd is ICommandOption opt)
                    {
                        opt.BindCommandOptions(context, services);
                    }
                });
            });

            var parser = cmdBuilder.Build();
            return await parser.InvokeAsync(args); //  Success exit code from command execution

        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Fatal error: {ex}");
            return 1; //  Non-zero exit code for Kubernetes to treat as failure
        }
    }
}
