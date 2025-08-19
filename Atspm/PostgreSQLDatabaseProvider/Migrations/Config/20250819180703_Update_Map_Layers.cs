using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Utah.Udot.ATSPM.PostgreSQLDatabaseProvider.Migrations.Config
{
    /// <inheritdoc />
    public partial class Update_Map_Layers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedOn",
                table: "MapLayer");

            migrationBuilder.DropColumn(
                name: "DeletedOn",
                table: "MapLayer");

            migrationBuilder.DropColumn(
                name: "UpdatedOn",
                table: "MapLayer");

            migrationBuilder.RenameColumn(
                name: "UpdatedBy",
                table: "MapLayer",
                newName: "Style");

            migrationBuilder.RenameColumn(
                name: "DeletedBy",
                table: "MapLayer",
                newName: "ResourceId");

            migrationBuilder.AlterColumn<DateTime>(
                name: "Date",
                table: "VersionHistory",
                type: "timestamp",
                nullable: false,
                defaultValue: new DateTime(2025, 8, 19, 12, 7, 2, 736, DateTimeKind.Local).AddTicks(9572),
                oldClrType: typeof(DateTime),
                oldType: "timestamp",
                oldDefaultValue: new DateTime(2025, 7, 3, 6, 55, 1, 778, DateTimeKind.Local).AddTicks(1158));

            migrationBuilder.AlterColumn<string>(
                name: "ServiceType",
                table: "MapLayer",
                type: "text",
                unicode: false,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldUnicode: false,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "MapLayer",
                type: "text",
                unicode: false,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldUnicode: false,
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Style",
                table: "MapLayer",
                newName: "UpdatedBy");

            migrationBuilder.RenameColumn(
                name: "ResourceId",
                table: "MapLayer",
                newName: "DeletedBy");

            migrationBuilder.AlterColumn<DateTime>(
                name: "Date",
                table: "VersionHistory",
                type: "timestamp",
                nullable: false,
                defaultValue: new DateTime(2025, 7, 3, 6, 55, 1, 778, DateTimeKind.Local).AddTicks(1158),
                oldClrType: typeof(DateTime),
                oldType: "timestamp",
                oldDefaultValue: new DateTime(2025, 8, 19, 12, 7, 2, 736, DateTimeKind.Local).AddTicks(9572));

            migrationBuilder.AlterColumn<string>(
                name: "ServiceType",
                table: "MapLayer",
                type: "text",
                unicode: false,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldUnicode: false);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "MapLayer",
                type: "text",
                unicode: false,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldUnicode: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedOn",
                table: "MapLayer",
                type: "timestamp",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedOn",
                table: "MapLayer",
                type: "timestamp",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedOn",
                table: "MapLayer",
                type: "timestamp",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }
    }
}
