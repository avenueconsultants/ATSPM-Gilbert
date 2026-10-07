#region license
// Copyright 2026 Utah Departement of Transportation
// for ReportApi - Utah.Udot.Atspm.ReportApi.Controllers/TurningMovementCountsController.cs
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

using Asp.Versioning;
using Utah.Udot.Atspm.Business.TurningMovementCounts;

namespace Utah.Udot.Atspm.ReportApi.Controllers
{
    /// <summary>
    /// Turning movement count report controller
    /// </summary>
    [ApiVersion(1.0)]
    public class TurningMovementCountsController : ReportExceptionControllerBase<TurningMovementCountsOptions, TurningMovementCountsResult>
    {
        /// <summary>
        /// Indicates whether device-based TMC report sources are enabled. Uses the standard
        /// configuration providers: Features:TmcDeviceSources in configuration, or
        /// Features__TmcDeviceSources as an environment variable. Defaults to false when absent.
        /// The default ATSPM/Indiana report source and scheduled device logging are unaffected.
        /// </summary>
        [Microsoft.AspNetCore.Mvc.HttpGet("deviceSourcesEnabled")]
        public bool DeviceSourcesEnabled([Microsoft.AspNetCore.Mvc.FromServices] IConfiguration configuration) => configuration.GetValue<bool>("Features:TmcDeviceSources");

        /// <inheritdoc/>
        public TurningMovementCountsController(IReportService<TurningMovementCountsOptions, TurningMovementCountsResult> reportService, ILogger<TurningMovementCountsController> logger) : base(reportService, logger) { }
    }
}
