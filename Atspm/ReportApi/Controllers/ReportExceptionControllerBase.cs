#region license
// Copyright 2026 Utah Departement of Transportation
// for ReportApi - Utah.Udot.Atspm.ReportApi.Controllers/ReportExceptionControllerBase.cs
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
#endregion

using Microsoft.AspNetCore.Mvc;
using Utah.Udot.Atspm.Exceptions;
using Utah.Udot.Atspm.Infrastructure.LogMessages;

namespace Utah.Udot.Atspm.ReportApi.Controllers;

/// <summary>
/// Optional generic report controller that preserves HTTP statuses from ReportException.
/// Keeps the existing ReportControllerBase behavior unchanged for controllers that do not opt in.
/// </summary>
/// <typeparam name="Tin">Report options.</typeparam>
/// <typeparam name="Tout">Report result.</typeparam>
public abstract class ReportExceptionControllerBase<Tin, Tout> : ReportControllerBase<Tin, Tout>
{
    private readonly IReportService<Tin, Tout> _reportService;
    private readonly ReportsLoggerLogMessages<Tin, Tout> _reportLog;

    /// <inheritdoc/>
    protected ReportExceptionControllerBase(IReportService<Tin, Tout> reportService, ILogger logger)
        : base(reportService, logger)
    {
        _reportService = reportService;
        _reportLog = new(logger, reportService);
    }

    /// <inheritdoc/>
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public override async Task<ActionResult<Tout>> GetReportData([FromBody] Tin options)
    {
        // The original action catches every exception as 400, so wrapping base.GetReportData
        // cannot preserve custom statuses. Override here once for any report that needs them.
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var controllerName = ControllerContext.RouteData.Values["controller"].ToString();
            _reportLog.ReportStartedMessage(DateTime.Now, controllerName);
            var result = await _reportService.ExecuteAsync(options, null, HttpContext.RequestAborted);
            _reportLog.ReportCompletedMessage(DateTime.Now, controllerName);
            return Ok(result);
        }
        catch (ReportException e)
        {
            _reportLog.ReportExecutionException(e);
            return StatusCode(e.StatusCode, e.Message);
        }
        catch (Exception e)
        {
            _reportLog.ReportExecutionException(e);
            return BadRequest(e.Message);
        }
    }
}
