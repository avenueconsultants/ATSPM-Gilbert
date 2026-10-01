namespace Utah.Udot.Atspm.Infrastructure.Extensions;

internal static class DeviceTimeZoneExtensions
{
    // Share coordinate lookup so decoding and import validation agree on device-local time.
    // Null means the location has no usable coordinates; the caller decides whether a fallback is safe.
    internal static TimeZoneInfo GetTimeZoneFromLocation(this Device device)
    {
        var location = device?.Location;
        if (location == null || !double.IsFinite(location.Latitude) || !double.IsFinite(location.Longitude)
            || location.Latitude < -90 || location.Latitude > 90
            || location.Longitude < -180 || location.Longitude > 180
            || (location.Latitude == 0 && location.Longitude == 0))
            return null;

        return TimeZoneInfo.FindSystemTimeZoneById(
            GeoTimeZone.TimeZoneLookup.GetTimeZone(location.Latitude, location.Longitude).Result);
    }
}
