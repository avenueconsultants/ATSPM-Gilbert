using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Xunit;
namespace ApplicationTests.Business.TurningMovementCounts;
public abstract class TurningMovementCountDecoderContractTests<T> where T : ITurningMovementCountDecoder
{
    protected abstract (T Decoder, TmcDecodeRequest Request) Create();
    [Fact]
    public async Task CountsRespectWindowIntervalAndMovementContract()
    {
        var (decoder, request) = Create();
        var result = await decoder.DecodeAsync(request, CancellationToken.None);
        Assert.NotEmpty(result.Counts);
        Assert.All(result.Counts, count => {
            Assert.True(count.BinStart >= request.Options.Start && count.BinStart < request.Options.End);
            Assert.True(count.BinMinutes >= decoder.MinimumBinMinutes);
            Assert.True(count.Volume >= 0);
            Assert.True(count.Direction != Utah.Udot.Atspm.Data.Enums.DirectionTypes.NA || !string.IsNullOrEmpty(count.DirectionLabel));
            Assert.True(Enum.IsDefined(typeof(Utah.Udot.Atspm.Data.Enums.MovementTypes), count.Movement));
        });
    }
}
