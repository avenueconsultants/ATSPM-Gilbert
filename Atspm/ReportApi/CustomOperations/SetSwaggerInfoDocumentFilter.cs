using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Utah.Udot.Atspm.ReportApi.CustomOperations;

public class SetSwaggerInfoDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Info.Title = "Atspm Report Api";
        swaggerDoc.Info.Description = "Generate Atspm Reports and Metrics";
    }
}
