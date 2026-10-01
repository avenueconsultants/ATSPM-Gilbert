using Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Sources;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Decoders.EconoliteVision;

namespace Utah.Udot.Atspm.Infrastructure.Extensions;

public static class TmcServiceExtensions
{
    public static IServiceCollection AddTmcDecoder<T>(this IServiceCollection services) where T : class, ITurningMovementCountDecoder
        => services.AddTmcDecoder(typeof(T));

    private static IServiceCollection AddTmcDecoder(this IServiceCollection services, Type decoderType)
    {
        services.TryAddScoped(decoderType);
        services.AddKeyedScoped<ITurningMovementCountDecoder>(decoderType.Name,
            (provider, _) => (ITurningMovementCountDecoder)provider.GetRequiredService(decoderType));
        services.AddKeyedScoped(typeof(ITurningMovementCountSource), decoderType.Name,
            typeof(DeviceCountSource<>).MakeGenericType(decoderType));
        return services;
    }
    public static IServiceCollection AddTmcCountSource<T>(this IServiceCollection services, string key)
        where T : class, ITurningMovementCountSource
    {
        services.TryAddScoped<T>();
        services.AddKeyedScoped<ITurningMovementCountSource>(key, (provider, _) => provider.GetRequiredService<T>());
        return services;
    }
    public static IServiceCollection AddTmcCountSources(this IServiceCollection services)
    {
        services.AddHttpClient("TmcCamera").ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false });
        services.TryAddSingleton<TmcCameraConcurrency>();
        services.AddScoped<TmcResultBuilder>();
        // Use the same implementation discovery as AddEventLogDecoders. Device properties
        // choose the decoder at runtime; a new implementation does not need a startup list entry.
        services.RegisterServicesByInterface<ITurningMovementCountDecoder>();
        var decoderTypes = services.Where(d => d.ServiceType == typeof(ITurningMovementCountDecoder) && !d.IsKeyedService)
            .Select(d => d.ImplementationType).Where(t => t != null).Distinct().ToArray();
        foreach (var decoderType in decoderTypes)
            services.AddTmcDecoder(decoderType);

        return services.AddTmcCountSource<IndianaCountSource>("atspm");
    }
}
