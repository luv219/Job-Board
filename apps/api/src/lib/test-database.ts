export function assertSafeTestDatabase(nodeEnvironment: string, mongoUri: string): void {
  if (nodeEnvironment !== 'test') {
    throw new Error('Database cleanup is permitted only when NODE_ENV is test.');
  }

  const databaseName = new URL(mongoUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error('Test database name must end with _test.');
  }
}
