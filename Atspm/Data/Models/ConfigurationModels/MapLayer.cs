using Utah.Udot.Atspm.Data.Models.ConfigurationModels;

namespace Utah.Udot.Atspm.Data.Models
{
    /// <summary>
    /// Map Layer
    /// </summary>
    public partial class MapLayer : AtspmConfigModelBase<int>
    {
        /// <summary>Map name</summary>
        public string Name { get; set; }

        /// <summary>
        /// Service Type
        /// </summary>
        public string ServiceType { get; set; }

        /// <summary>Show By Default</summary>
        public bool ShowByDefault { get; set; }

        /// <summary>
        /// Base endpoint URL:
        ///  - WMS/WFS: https://.../geoserver/ows
        ///  - ArcGIS Map: https://.../MapServer
        ///  - ArcGIS Feature: https://.../FeatureServer
        /// </summary>
        public string? MapLayerUrl { get; set; } = null;

        /// <summary>
        /// Resource identifier for the service:
        ///  - WMS: layer name (e.g., "workspace:roads")
        ///  - WFS: typeName (e.g., "workspace:roads")
        ///  - ARCGIS_FEATURE: layer id (e.g., "0")
        ///  - ARCGIS_MAP: null
        /// </summary>
        public string? ResourceId { get; set; }

        /// <summary>
        /// Optional style hint:
        ///  - WMS: named style (e.g., "simple_roads")
        ///  - Others: unused
        /// </summary>
        public string? Style { get; set; }


        /// <summary>
        /// The interval at which the map layer should refresh, in seconds.
        /// </summary>
        public int? RefreshIntervalSeconds { get; set; }

        /// <inheritdoc/>
        public override string ToString() => $"{Id} - {Name}";
    }
}