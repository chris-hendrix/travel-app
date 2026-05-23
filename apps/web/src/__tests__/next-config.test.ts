import { describe, it, expect, vi } from 'vitest';

// Mock @ducanh2912/next-pwa before importing anything from next.config
// This prevents the PWA plugin from initializing - we only test createNextConfig
vi.mock('@ducanh2912/next-pwa', () => ({
  default: () => (config: unknown) => config,
}));

import { createNextConfig } from '../../next.config';

describe('createNextConfig', () => {
  it('returns standalone output when NEXT_EXPORT is not set', () => {
    const config = createNextConfig({});
    expect(config.output).toBe('standalone');
  });

  it('returns export output when NEXT_EXPORT=true', () => {
    const config = createNextConfig({ NEXT_EXPORT: 'true' });
    expect(config.output).toBe('export');
  });

  it('enables images.unoptimized when NEXT_EXPORT=true', () => {
    const config = createNextConfig({ NEXT_EXPORT: 'true' });
    expect(config.images).toEqual({ unoptimized: true });
  });

  it('does NOT set images.unoptimized when NEXT_EXPORT is not set', () => {
    const config = createNextConfig({});
    expect(config.images?.unoptimized).toBeUndefined();
  });

  it('keeps standalone output when NEXT_EXPORT is any other value', () => {
    const config = createNextConfig({ NEXT_EXPORT: 'false' });
    expect(config.output).toBe('standalone');
  });

  it('preserves transpilePackages in both modes', () => {
    const exportConfig = createNextConfig({ NEXT_EXPORT: 'true' });
    const standaloneConfig = createNextConfig({});
    expect(exportConfig.transpilePackages).toContain('@journiful/shared');
    expect(standaloneConfig.transpilePackages).toContain('@journiful/shared');
  });
});
