using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Utah.Udot.Atspm.Business.TurningMovementCounts;
using Utah.Udot.Atspm.Data.Models.MeasureOptions;
using Utah.Udot.Atspm.Exceptions;
using Utah.Udot.Atspm.ReportApi.Controllers;
using Utah.Udot.Atspm.Services;

namespace ReportApiTests;

public class ReportControllerExceptionTests
{
    private sealed class ExampleController(IReportService<string, string> service)
        : ReportControllerBase<string, string>(service, NullLogger.Instance);

    private sealed class StatusAwareController(IReportService<string, string> service)
        : ReportExceptionControllerBase<string, string>(service, NullLogger.Instance);

    [Fact]
    public async Task GenericStatusHandlingWorksWithoutTmcTypes()
    {
        var service = new Mock<IReportService<string, string>>();
        service.Setup(s => s.ExecuteAsync(It.IsAny<string>(), It.IsAny<IProgress<int>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ReportException(503, "Unavailable"));
        var controller = new StatusAwareController(service.Object) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext(), RouteData = new RouteData() }
        };
        controller.RouteData.Values["controller"] = "Example";
        var result = Assert.IsType<ObjectResult>((await controller.GetReportData("options")).Result);
        Assert.Equal(503, result.StatusCode);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(502)]
    [InlineData(503)]
    public async Task TmcCustomReportFailuresPreserveStatus(int status)
    {
        var error = new ReportException(status, "Source unavailable", new InvalidOperationException("Underlying failure"));
        Assert.IsAssignableFrom<AtspmException>(error);
        var service = new Mock<IReportService<TurningMovementCountsOptions, TurningMovementCountsResult>>();
        service.Setup(s => s.ExecuteAsync(It.IsAny<TurningMovementCountsOptions>(), It.IsAny<IProgress<int>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(error);
        var controller = new TurningMovementCountsController(service.Object, NullLogger<TurningMovementCountsController>.Instance) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext(), RouteData = new RouteData() }
        };
        controller.RouteData.Values["controller"] = "TurningMovementCounts";
        var response = Assert.IsType<ObjectResult>((await controller.GetReportData(new TurningMovementCountsOptions())).Result);
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(error.Message, response.Value);
    }

    [Fact]
    public async Task OtherExceptionsKeepExistingBadRequestBehavior()
    {
        var response = await Execute(new InvalidOperationException("Existing report failure"));
        Assert.IsType<BadRequestObjectResult>(response);
        Assert.Equal(400, response.StatusCode);
    }

    [Fact]
    public async Task SharedControllerKeepsExistingHandlingEvenForCustomReportExceptions()
    {
        var response = await Execute(new ReportException(503, "Source unavailable"));
        Assert.IsType<BadRequestObjectResult>(response);
        Assert.Equal(400, response.StatusCode);
    }

    private static async Task<ObjectResult> Execute(Exception error)
    {
        var service = new Mock<IReportService<string, string>>();
        service.Setup(s => s.ExecuteAsync(It.IsAny<string>(), It.IsAny<IProgress<int>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(error);
        var controller = new ExampleController(service.Object) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext(), RouteData = new RouteData() }
        };
        controller.RouteData.Values["controller"] = "Example";
        return Assert.IsAssignableFrom<ObjectResult>((await controller.GetReportData("options")).Result);
    }
}
