import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import type { TestProject } from 'vitest/node';

/**
 * Starts a throw-away single-node MongoDB replica set in memory. A replica set (not a
 * standalone server) is required for Change Streams. Nothing touches MongoDB Atlas.
 */
export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
