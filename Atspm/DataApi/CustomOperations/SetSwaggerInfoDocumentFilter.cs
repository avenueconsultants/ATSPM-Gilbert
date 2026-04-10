using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Utah.Udot.Atspm.DataApi.CustomOperations;

public class SetSwaggerInfoDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Info.Title = "Atspm Data Api";
        swaggerDoc.Info.Description = "Download Atspm Event Logs and Aggregations";
    }
}
