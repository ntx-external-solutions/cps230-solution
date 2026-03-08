import {
  ValidationError,
  validateProcessInput,
  validateSystemInput,
  validateControlInput,
  validateCriticalOperationInput,
  validateUserProfileInput,
  validateSettingInput,
  isValidUUID,
} from './validation';

describe('Validation Utilities', () => {
  describe('ValidationError', () => {
    it('should create a ValidationError with correct name', () => {
      const error = new ValidationError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test error');
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });
  });

  describe('validateProcessInput', () => {
    it('should validate and sanitize valid process input', () => {
      const input = {
        process_name: 'Test Process',
        process_unique_id: 'test-123',
        owner_username: 'user@example.com',
        regions: ['US', 'EU'],
        extraField: 'should be removed',
      };

      const result = validateProcessInput(input);
      expect(result.process_name).toBe('Test Process');
      expect(result.process_unique_id).toBe('test-123');
      expect(result.owner_username).toBe('user@example.com');
      expect(result.regions).toEqual(['US', 'EU']);
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when process_name is missing', () => {
      const input = {
        process_unique_id: 'test-123',
      };

      expect(() => validateProcessInput(input)).toThrow(ValidationError);
      expect(() => validateProcessInput(input)).toThrow('process_name is required');
    });

    it('should throw error when process_unique_id is missing', () => {
      const input = {
        process_name: 'Test Process',
      };

      expect(() => validateProcessInput(input)).toThrow(ValidationError);
      expect(() => validateProcessInput(input)).toThrow('process_unique_id is required');
    });

    it('should throw error when regions is not an array', () => {
      const input = {
        process_name: 'Test Process',
        process_unique_id: 'test-123',
        regions: 'not-an-array',
      };

      expect(() => validateProcessInput(input)).toThrow(ValidationError);
      expect(() => validateProcessInput(input)).toThrow('regions must be an array');
    });
  });

  describe('validateSystemInput', () => {
    it('should validate and sanitize valid system input', () => {
      const input = {
        system_name: 'Test System',
        system_id: 'sys-123',
        description: 'A test system',
        extraField: 'should be removed',
      };

      const result = validateSystemInput(input);
      expect(result.system_name).toBe('Test System');
      expect(result.system_id).toBe('sys-123');
      expect(result.description).toBe('A test system');
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when system_name is missing', () => {
      const input = {
        system_id: 'sys-123',
      };

      expect(() => validateSystemInput(input)).toThrow(ValidationError);
      expect(() => validateSystemInput(input)).toThrow('system_name is required');
    });

    it('should throw error when system_id is missing', () => {
      const input = {
        system_name: 'Test System',
      };

      expect(() => validateSystemInput(input)).toThrow(ValidationError);
      expect(() => validateSystemInput(input)).toThrow('system_id is required');
    });
  });

  describe('validateControlInput', () => {
    it('should validate and sanitize valid control input', () => {
      const input = {
        control_name: 'Test Control',
        description: 'A test control',
        regions: ['US'],
        extraField: 'should be removed',
      };

      const result = validateControlInput(input);
      expect(result.control_name).toBe('Test Control');
      expect(result.description).toBe('A test control');
      expect(result.regions).toEqual(['US']);
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when control_name is missing', () => {
      const input = {
        description: 'A test control',
      };

      expect(() => validateControlInput(input)).toThrow(ValidationError);
      expect(() => validateControlInput(input)).toThrow('control_name is required');
    });

    it('should throw error when regions is not an array', () => {
      const input = {
        control_name: 'Test Control',
        regions: 'not-an-array',
      };

      expect(() => validateControlInput(input)).toThrow(ValidationError);
      expect(() => validateControlInput(input)).toThrow('regions must be an array');
    });
  });

  describe('validateCriticalOperationInput', () => {
    it('should validate and sanitize valid critical operation input', () => {
      const input = {
        operation_name: 'Test Operation',
        description: 'A test operation',
        color_code: '#FF0000',
        extraField: 'should be removed',
      };

      const result = validateCriticalOperationInput(input);
      expect(result.operation_name).toBe('Test Operation');
      expect(result.description).toBe('A test operation');
      expect(result.color_code).toBe('#FF0000');
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when operation_name is missing', () => {
      const input = {
        description: 'A test operation',
      };

      expect(() => validateCriticalOperationInput(input)).toThrow(ValidationError);
      expect(() => validateCriticalOperationInput(input)).toThrow('operation_name is required');
    });
  });

  describe('validateUserProfileInput', () => {
    it('should validate and sanitize valid user profile input', () => {
      const input = {
        entra_id_object_id: 'user-123',
        email: 'user@example.com',
        full_name: 'Test User',
        role: 'business_analyst',
        extraField: 'should be removed',
      };

      const result = validateUserProfileInput(input);
      expect(result.entra_id_object_id).toBe('user-123');
      expect(result.email).toBe('user@example.com');
      expect(result.full_name).toBe('Test User');
      expect(result.role).toBe('business_analyst');
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when email is not a string', () => {
      const input = {
        email: 123,
      };

      expect(() => validateUserProfileInput(input)).toThrow(ValidationError);
      expect(() => validateUserProfileInput(input)).toThrow('email must be a string');
    });

    it('should throw error when role is invalid', () => {
      const input = {
        role: 'invalid_role',
      };

      expect(() => validateUserProfileInput(input)).toThrow(ValidationError);
      expect(() => validateUserProfileInput(input)).toThrow('role must be one of');
    });

    it('should accept valid roles', () => {
      const validRoles = ['user', 'business_analyst', 'promaster'];
      validRoles.forEach((role) => {
        const input = { role };
        const result = validateUserProfileInput(input);
        expect(result.role).toBe(role);
      });
    });
  });

  describe('validateSettingInput', () => {
    it('should validate and sanitize valid setting input', () => {
      const input = {
        key: 'test_setting',
        value: 'test_value',
        description: 'A test setting',
        is_sensitive: false,
        extraField: 'should be removed',
      };

      const result = validateSettingInput(input);
      expect(result.key).toBe('test_setting');
      expect(result.value).toBe('test_value');
      expect(result.description).toBe('A test setting');
      expect(result.is_sensitive).toBe(false);
      expect(result.extraField).toBeUndefined();
    });

    it('should throw error when key is missing', () => {
      const input = {
        value: 'test_value',
      };

      expect(() => validateSettingInput(input)).toThrow(ValidationError);
      expect(() => validateSettingInput(input)).toThrow('key is required');
    });

    it('should throw error when value is missing', () => {
      const input = {
        key: 'test_setting',
      };

      expect(() => validateSettingInput(input)).toThrow(ValidationError);
      expect(() => validateSettingInput(input)).toThrow('value is required');
    });

    it('should throw error when is_sensitive is not a boolean', () => {
      const input = {
        key: 'test_setting',
        value: 'test_value',
        is_sensitive: 'not-a-boolean',
      };

      expect(() => validateSettingInput(input)).toThrow(ValidationError);
      expect(() => validateSettingInput(input)).toThrow('is_sensitive must be a boolean');
    });
  });
});
