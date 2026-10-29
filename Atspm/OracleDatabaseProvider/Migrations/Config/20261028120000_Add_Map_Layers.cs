using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Oracle.EntityFrameworkCore.Metadata;
using Utah.Udot.Atspm.Data;

#nullable disable

namespace Utah.Udot.ATSPM.OracleDatabaseProvider.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(ConfigContext))]
    [Migration("20261028120000_Add_Map_Layers")]
    public partial class Add_Map_Layers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MapLayer",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:ValueGenerationStrategy", OracleValueGenerationStrategy.IdentityColumn),
                    Created = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    CreatedBy = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: true),
                    MapLayerUrl = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: true),
                    Modified = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    ModifiedBy = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: true),
                    Name = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: false),
                    RefreshIntervalSeconds = table.Column<int>(type: "NUMBER(10)", nullable: true),
                    ResourceId = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: true),
                    ServiceType = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: false),
                    ShowByDefault = table.Column<bool>(type: "BOOLEAN", nullable: false),
                    Style = table.Column<string>(type: "VARCHAR2(4000)", unicode: false, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MapLayer", x => x.Id);
                },
                comment: "Map Layer");

            migrationBuilder.CreateIndex(
                name: "IX_MapLayer_Name",
                table: "MapLayer",
                column: "Name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MapLayer");
        }
    }
}
