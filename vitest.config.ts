import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          include: ['tests/domain/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: { '@': path.resolve(__dirname, './src') },
        },
      },
      {
        test: {
          name: 'application',
          include: ['tests/application/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: { '@': path.resolve(__dirname, './src') },
        },
      },
      {
        test: {
          name: 'infrastructure',
          include: ['tests/infrastructure/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: { '@': path.resolve(__dirname, './src') },
        },
      },
      {
        // Layering guards. They read files rather than import them, which is why they
        // are their own project: nothing here exercises the app, it polices it.
        test: {
          name: 'structure',
          include: ['tests/structure/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: { '@': path.resolve(__dirname, './src') },
        },
      },
    ],
  },
});
