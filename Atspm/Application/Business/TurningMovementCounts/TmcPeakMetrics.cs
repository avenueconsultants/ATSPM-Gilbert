using Utah.Udot.Atspm.Business.Common;
namespace Utah.Udot.Atspm.Business.TurningMovementCounts;
public static class TmcPeakMetrics
{
        public static void SetPeakHourVolume(TurningMovementCountsResult result)
        {
            if (!result.PeakHour.HasValue)
            {
                foreach (var lane in result.Table)
                    lane.PeakHourVolume = null;
                return;
            }

            var peakStart = result.PeakHour.Value.Key;
            const int AGG = 15;
            const int QUARTS = 4;

            foreach (var lane in result.Table)
            {
                int hourTotal = 0;

                for (int i = 0; i < QUARTS; i++)
                {
                    var binStart = peakStart.AddMinutes(i * AGG);
                    var binEnd = binStart.AddMinutes(AGG);

                    hourTotal += lane.Volumes
                        .Where(v => v.Timestamp >= binStart && v.Timestamp < binEnd)
                        .Sum(v => v.Value);
                }

                lane.PeakHourVolume = new DataPointForInt(peakStart, hourTotal);
            }
        }


        public static void ComputePeakHourAndFactor(
             TurningMovementCountsResult result,
             DateTime periodStart,
             DateTime periodEnd,
             int binSizeMinutes)
        {
            if (60 % binSizeMinutes != 0 || (periodEnd - periodStart).TotalMinutes < 60)
            {
                result.PeakHour = null;
                result.PeakHourFactor = null;
                return;
            }

            var allBins = result.Table
                .Where(l => l.LaneType == "Vehicle")
                .SelectMany(l => l.Volumes)
                .Where(v => v.Timestamp >= periodStart && v.Timestamp < periodEnd)
                .GroupBy(v => v.Timestamp)
                .Select(g => new { Time = g.Key, Sum = g.Sum(v => v.Value) })
                .OrderBy(x => x.Time)
                .ToList();

            int binsPerHour = 60 / binSizeMinutes;
            if (allBins.Count < binsPerHour)
            {
                result.PeakHour = null;
                result.PeakHourFactor = null;
                return;
            }

            int bestSum = 0;
            DateTime bestStart = DateTime.MinValue;
            for (int i = 0; i + binsPerHour <= allBins.Count; i++)
            {
                int windowSum = 0;
                for (int j = 0; j < binsPerHour; j++)
                    windowSum += allBins[i + j].Sum;

                if (windowSum > bestSum)
                {
                    bestSum = windowSum;
                    bestStart = allBins[i].Time;
                }
            }

            result.PeakHour = new KeyValuePair<DateTime, int>(bestStart, bestSum);

            if (15 % binSizeMinutes != 0)
            {
                result.PeakHourFactor = null;
                return;
            }

            var hourBins = allBins
                .Where(x => x.Time >= bestStart && x.Time < bestStart.AddHours(1))
                .Select(x => x.Sum)
                .ToList();

            if (hourBins.Count == 0)
            {
                result.PeakHourFactor = null;
                return;
            }

            var quarterSums = new int[4];
            foreach (var x in allBins.Where(b => b.Time >= bestStart && b.Time < bestStart.AddHours(1)))
            {
                int minsPast = (int)(x.Time - bestStart).TotalMinutes;
                int idx = Math.Min(3, minsPast / 15);
                quarterSums[idx] += x.Sum;
            }

            int peakQuarter = quarterSums.Max();
            int denom = peakQuarter * 4;

            result.PeakHourFactor = denom == 0
                ? (double?)null
                : Math.Round((double)bestSum / denom, 2);
        }

}
