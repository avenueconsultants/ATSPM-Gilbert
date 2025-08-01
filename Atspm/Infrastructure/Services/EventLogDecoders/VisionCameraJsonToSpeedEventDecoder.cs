﻿using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Infrastructure.Services.EventLogDecoders;


namespace Utah.Udot.ATSPM.Infrastructure.Services.EventLogDecoders
{
    public class VisionCameraJsonToSpeedEventDecoder : EventLogDecoderBase<SpeedEvent>
    {
        public override IEnumerable<SpeedEvent> Decode(Device device, Stream stream, CancellationToken cancelToken = default)
        {
            var memoryStream = (MemoryStream)stream;
            var rootStats = memoryStream.ToArray().FromEncodedJson<Root>().detections;
            List<Detector> detectors = device.Location.Approaches.SelectMany(x => x.Detectors).ToList();

            var response = rootStats
                .SelectMany(visionCameraDetection =>
                {
                    var matchingDetectors = detectors
                        .Where(x => x.DectectorIdentifier == visionCameraDetection.zoneName)
                        .ToList();

                    if (!matchingDetectors.Any())
                    {
                        // No matching detectors, return empty result
                        return Enumerable.Empty<SpeedEvent>();
                    }

                    var timestamp = visionCameraDetection.time;
                    var mph = (int)visionCameraDetection.speed;
                    var kph = ConvertMphToKph(mph);

                    return matchingDetectors.Select(detector => new SpeedEvent
                    {
                        LocationIdentifier = device.Location.LocationIdentifier,
                        Timestamp = timestamp,
                        DetectorId = detector.Id.ToString(),
                        Mph = mph,
                        Kph = kph
                    });
                })
                .ToList();

            return response;
        }

        private class Root
        {
            public List<VisionCameraDetections> detections { get; set; }
        }

        private class VisionCameraDetections
        {
            public int zoneId { get; set; }
            public string zoneName { get; set; }
            public DateTime time { get; set; }
            public string objectType { get; set; }
            public double speed { get; set; }
            public double length { get; set; }
            public string direction { get; set; }
        }

        public int ConvertMphToKph(double mph)
        {
            return (int)Math.Round(mph * 1.60934);
        }
    }
}