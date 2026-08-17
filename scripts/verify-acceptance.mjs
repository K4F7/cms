/**
 * Production-shaped first-version acceptance (K4F7/cms#11).
 * Same seams as test:baseline, then writes redacted evidence.
 */
process.env.CMS_ACCEPTANCE_EVIDENCE = '1';
await import('./verify-baseline.mjs');
