/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate and sanitize process input
 */
export function validateProcessInput(input: any): any {
  const allowedFields = [
    'process_name',
    'process_unique_id',
    'owner_username',
    'input_processes',
    'output_processes',
    'canvas_position',
    'metadata',
    'regions',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  // Validate required fields
  if (!sanitized.process_name || typeof sanitized.process_name !== 'string') {
    throw new ValidationError('process_name is required and must be a string');
  }

  if (!sanitized.process_unique_id || typeof sanitized.process_unique_id !== 'string') {
    throw new ValidationError('process_unique_id is required and must be a string');
  }

  // Validate arrays
  if (sanitized.input_processes && !Array.isArray(sanitized.input_processes)) {
    throw new ValidationError('input_processes must be an array');
  }

  if (sanitized.output_processes && !Array.isArray(sanitized.output_processes)) {
    throw new ValidationError('output_processes must be an array');
  }

  if (sanitized.regions && !Array.isArray(sanitized.regions)) {
    throw new ValidationError('regions must be an array');
  }

  return sanitized;
}

/**
 * Validate and sanitize system input
 */
export function validateSystemInput(input: any): any {
  const allowedFields = [
    'system_name',
    'system_id',
    'description',
    'metadata',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.system_name || typeof sanitized.system_name !== 'string') {
    throw new ValidationError('system_name is required and must be a string');
  }

  if (!sanitized.system_id || typeof sanitized.system_id !== 'string') {
    throw new ValidationError('system_id is required and must be a string');
  }

  return sanitized;
}

/**
 * Validate and sanitize control input
 */
export function validateControlInput(input: any): any {
  const allowedFields = [
    'control_name',
    'description',
    'critical_operation_id',
    'process_id',
    'system_id',
    'regions',
    'control_type',
    'pm_control_id',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.control_name || typeof sanitized.control_name !== 'string') {
    throw new ValidationError('control_name is required and must be a string');
  }

  if (sanitized.regions && !Array.isArray(sanitized.regions)) {
    throw new ValidationError('regions must be an array');
  }

  return sanitized;
}

/**
 * Validate and sanitize critical operation input
 */
export function validateCriticalOperationInput(input: any): any {
  const allowedFields = [
    'operation_name',
    'description',
    'system_id',
    'process_id',
    'color_code',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.operation_name || typeof sanitized.operation_name !== 'string') {
    throw new ValidationError('operation_name is required and must be a string');
  }

  return sanitized;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
