using Utah.Udot.Atspm.Exceptions;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Moq;
using Utah.Udot.Atspm.Business.Common;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Enums;
using Utah.Udot.Atspm.Data.Models;
using Utah.Udot.Atspm.Data.Models.EventLogModels;
using Utah.Udot.Atspm.Data.Models.MeasureOptions;
using Utah.Udot.Atspm.Infrastructure.Services.TurningMovementCounts.Sources;
using Utah.Udot.Atspm.Repositories.EventLogRepositories;
using Xunit;

namespace InfrastructureTests.TurningMovementCounts;
public class IndianaCountSourceTests
{
    [Fact] public async Task KeepsConfiguredDirectionLaneMetricEligibilityAndLatency()
    {
        var start=new DateTime(2026,9,25,10,7,0);
        var location=new Location{Id=1,LocationIdentifier="1"};
        var approach=new Approach{Id=1,Location=location,DirectionTypeId=DirectionTypes.SB};
        location.Approaches.Add(approach);
        Detector Detector(int id,bool eligible)=>new() { Id=id,Approach=approach,DetectorChannel=id,LaneNumber=3,
            LaneType=LaneTypes.V,MovementType=MovementTypes.R,LatencyCorrection=10,
            DetectionTypes=eligible?new List<DetectionType>{new(){MeasureTypes=new List<MeasureType>{new(){Id=5}}}}:new List<DetectionType>() };
        approach.Detectors.Add(Detector(1,true)); approach.Detectors.Add(Detector(2,false));
        var events=new List<IndianaEvent> {
            new(){EventCode=82,EventParam=1,Timestamp=start.AddMinutes(15).AddSeconds(5)},
            new(){EventCode=82,EventParam=2,Timestamp=start.AddMinutes(20)},
            new(){EventCode=81,EventParam=1,Timestamp=start.AddMinutes(20)} };
        var repository=new Mock<IIndianaEventLogRepository>();
        repository.Setup(r=>r.GetEventsBetweenDates("1",start.AddHours(-12),start.AddHours(13))).Returns(events);
        var options=new TurningMovementCountsOptions{Start=start,End=start.AddHours(1),BinSize=15};
        var source=await new IndianaCountSource(repository.Object,new PlanService()).ReadAsync(new(location,options),default);
        Assert.Equal(start,source.BinOrigin);
        Assert.Equal(new[]{1,0,0,0},source.Counts.Select(c=>c.Volume));
        Assert.All(source.Counts,c=>{Assert.Equal(DirectionTypes.SB,c.Direction);Assert.Equal(MovementTypes.R,c.Movement);
            Assert.Equal(3,c.LaneNumber);Assert.True(c.ExplicitLane);});
        var report=new TmcResultBuilder().Build(location,options,source.Counts,source.Plans,source.Label,source.Warnings,source.BinOrigin);
        Assert.Equal(start,report.Table.Single().Volumes.First().Timestamp);
        Assert.Equal(1,report.Charts.Single().TotalVolume);
        Assert.Equal(3,report.Charts.Single().Lanes.Single().LaneNumber);
    }
    [Fact] public async Task MissingEventsRetainsIndianaError()
    {
        var repository=new Mock<IIndianaEventLogRepository>();
        repository.Setup(r=>r.GetEventsBetweenDates(It.IsAny<string>(),It.IsAny<DateTime>(),It.IsAny<DateTime>())).Returns(new List<IndianaEvent>());
        var request=new TmcCountSourceRequest(new Location{LocationIdentifier="1"},new TurningMovementCountsOptions{Start=new(2026,9,25),End=new(2026,9,26),BinSize=15});
        var ex=await Assert.ThrowsAsync<ReportException>(()=>new IndianaCountSource(repository.Object,new PlanService()).ReadAsync(request,default));
        Assert.Equal(400,ex.StatusCode);
    }
}
