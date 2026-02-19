/**
 * Load all cases
 *
 * Import this file to register all cases with the system.
 */

// Import cases in order - they register themselves
import './case-01-harrens-death.js';
import './case-02-the-runaway.js';

// Re-export the registry
export * from './index.js';
