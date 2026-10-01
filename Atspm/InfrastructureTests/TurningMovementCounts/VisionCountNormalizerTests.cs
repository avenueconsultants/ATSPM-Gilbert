using System;
using System.Collections.Generic;
using System.Linq;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Decoders.EconoliteVision;
using Xunit;

namespace InfrastructureTests.TurningMovementCounts;
public class VisionCountNormalizerTests
{
    private static MovementCount Count(string name, int volume, int device = 1, int setback = 0) =>
        new(DirectionTypes.NB, MovementTypes.T, LaneTypes.V, null, new DateTime(2026,9,25,10,0,0),15,volume) {
            ZoneName=name, DeviceId=device, AdvanceSetback=setback };
    [Fact] public void DuplicateEncodedZonesAcrossCamerasKeepOneOwner()
    {
        var warnings = new List<string>();
        var result = VisionCountNormalizer.Combine(new[]{Count("N21-1",10),Count("N21-99",10,2),Count("N22-2",5,2)},warnings);
        Assert.Equal(15,result.Sum(c=>c.Volume));
        Assert.Contains(warnings,w=>w.Contains("Duplicate zone"));
    }
    [Fact] public void NearestAdvanceSetbackIsSelectedAcrossCameras()
    {
        var warnings = new List<string>();
        var result = VisionCountNormalizer.Combine(new[]{Count("A221-1",10,1,2),Count("A231-2",30,2,3)},warnings);
        Assert.Equal(10,result.Sum(c=>c.Volume));
        Assert.NotEmpty(warnings);
    }
}
