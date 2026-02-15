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
 * Validate and sanitize process-system junction input
 */
export function validateProcessSystemInput(input: any): any {
  const allowedFields = [
    'process_id',
    'system_id',
    'process_step',
    'activity_description',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.process_id || typeof sanitized.process_id !== 'string') {
    throw new ValidationError('process_id is required and must be a string');
  }

  if (!sanitized.system_id || typeof sanitized.system_id !== 'string') {
    throw new ValidationError('system_id is required and must be a string');
  }

  if (!isValidUUID(sanitized.process_id)) {
    throw new ValidationError('process_id must be a valid UUID');
  }

  if (!isValidUUID(sanitized.system_id)) {
    throw new ValidationError('system_id must be a valid UUID');
  }

  return sanitized;
}

/**
 * Validate and sanitize process-control junction input
 */
export function validateProcessControlInput(input: any): any {
  const allowedFields = [
    'process_id',
    'control_id',
    'process_step',
    'activity_description',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.process_id || typeof sanitized.process_id !== 'string') {
    throw new ValidationError('process_id is required and must be a string');
  }

  if (!sanitized.control_id || typeof sanitized.control_id !== 'string') {
    throw new ValidationError('control_id is required and must be a string');
  }

  if (!isValidUUID(sanitized.process_id)) {
    throw new ValidationError('process_id must be a valid UUID');
  }

  if (!isValidUUID(sanitized.control_id)) {
    throw new ValidationError('control_id must be a valid UUID');
  }

  return sanitized;
}

/**
 * Validate and sanitize user profile input
 */
export function validateUserProfileInput(input: any): any {
  const allowedFields = [
    'azure_ad_object_id',
    'email',
    'full_name',
    'role',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (sanitized.email && typeof sanitized.email !== 'string') {
    throw new ValidationError('email must be a string');
  }

  if (sanitized.role && !['user', 'business_analyst', 'promaster'].includes(sanitized.role)) {
    throw new ValidationError('role must be one of: user, business_analyst, promaster');
  }

  return sanitized;
}

/**
 * Validate and sanitize settings input
 */
export function validateSettingInput(input: any): any {
  const allowedFields = [
    'key',
    'value',
    'description',
    'is_sensitive',
  ];

  const sanitized: any = {};

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }

  if (!sanitized.key || typeof sanitized.key !== 'string') {
    throw new ValidationError('key is required and must be a string');
  }

  if (!sanitized.value) {
    throw new ValidationError('value is required');
  }

  if (sanitized.is_sensitive !== undefined && typeof sanitized.is_sensitive !== 'boolean') {
    throw new ValidationError('is_sensitive must be a boolean');
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
