using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Utah.Udot.Atspm.Data;

namespace ConfigApiTests;

[TestClass]
public class MapLayerMigrationTests
{
    [DataTestMethod]
    [DataRow("Sql")]
    [DataRow("Oracle")]
    [DataRow("SqlLite")]
    public void ProviderCanGenerateMapLayerUpgradeAndDowngrade(string provider)
    {
        var options = new DbContextOptionsBuilder<ConfigContext>();
        var assembly = provider switch
        {
            "Sql" => typeof(Utah.Udot.ATSPM.SqlDatabaseProvider.Migrations.Add_Map_Layers).Assembly.GetName().Name,
            "Oracle" => typeof(Utah.Udot.ATSPM.OracleDatabaseProvider.Migrations.Add_Map_Layers).Assembly.GetName().Name,
            _ => typeof(Utah.Udot.ATSPM.SqlLiteDatabaseProvider.Migrations.Add_Map_Layers).Assembly.GetName().Name
        };
        if (provider == "Sql") options.UseSqlServer("Server=localhost;Database=unused;Integrated Security=true", o => o.MigrationsAssembly(assembly));
        else if (provider == "Oracle") options.UseOracle("Data Source=unused;User Id=unused;Password=unused", o => o.MigrationsAssembly(assembly));
        else options.UseSqlite("Data Source=:memory:", o => o.MigrationsAssembly(assembly));
        using var context = new ConfigContext(options.Options);
        var migrations = context.GetService<IMigrationsAssembly>();
        var target = "20261028120000_Add_Map_Layers";
        Assert.IsTrue(migrations.Migrations.ContainsKey(target));
        var previous = migrations.Migrations.Keys.Where(k => string.CompareOrdinal(k, target) < 0).Last();
        var migrator = context.GetService<IMigrator>();
        var upgrade = migrator.GenerateScript(previous, target);
        StringAssert.Contains(upgrade, "CREATE TABLE");
        StringAssert.Contains(upgrade, "MapLayer");
        StringAssert.Contains(upgrade, "IX_MapLayer_Name");
        StringAssert.Contains(migrator.GenerateScript(target, previous), "DROP TABLE");
        // Apply just the new migration to an empty in-memory SQLite database.
        // Other providers are script-validated without touching deployed databases.
        if (provider == "SqlLite")
        {
            context.Database.OpenConnection();
            context.Database.ExecuteSqlRaw(context.GetService<IHistoryRepository>().GetCreateIfNotExistsScript());
            context.Database.ExecuteSqlRaw(upgrade);
            using var command = context.Database.GetDbConnection().CreateCommand();
            command.CommandText = "INSERT INTO MapLayer (Name, ServiceType, ShowByDefault) VALUES ('Test', 'WMS', 1); SELECT COUNT(*) FROM MapLayer;";
            Assert.AreEqual(1L, command.ExecuteScalar());
        }
    }
}
