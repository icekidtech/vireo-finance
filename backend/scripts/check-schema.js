/**
 * Fails when the code expects a column that the migrations did not create.
 *
 * Run it after `migration:run` against a throwaway database (CI does this). TypeORM's entities
 * decide which columns the application queries, so a migration that names or spells a column
 * differently only breaks at runtime, as a "column ... does not exist" error. This catches it
 * before deploy.
 *
 *   node scripts/check-schema.js
 *
 * Needs a build first (`pnpm build`) and the usual DB_* variables.
 */
const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'reflect-metadata'));
const dataSource = require(path.join(__dirname, '..', 'dist', 'database', 'data-source.js')).default;

(async () => {
  await dataSource.initialize();
  try {
    const problems = [];
    for (const meta of dataSource.entityMetadatas) {
      if (meta.tableType !== 'regular') continue;
      const rows = await dataSource.query(
        'select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1',
        [meta.tableName],
      );
      if (rows.length === 0) {
        problems.push(`${meta.tableName}: table does not exist (entity ${meta.name})`);
        continue;
      }
      const actual = new Set(rows.map((r) => r.column_name));
      const missing = meta.columns
        .filter((c) => !c.isVirtual)
        .map((c) => c.databaseName)
        .filter((name) => !actual.has(name));
      if (missing.length) problems.push(`${meta.tableName}: missing column(s) ${missing.join(', ')} (entity ${meta.name})`);
    }
    if (problems.length) {
      console.error('Schema check FAILED. The code expects columns the database does not have:');
      problems.forEach((p) => console.error(`  - ${p}`));
      process.exitCode = 1;
    } else {
      console.log(`Schema check passed: every column the code uses exists (${dataSource.entityMetadatas.length} entities).`);
    }
  } finally {
    await dataSource.destroy();
  }
})().catch((e) => {
  console.error('Schema check could not run:', e.message);
  process.exit(1);
});
