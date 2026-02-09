/**
 * Password Strength Validator
 * Uses zxcvbn to validate password strength on backend
 */

import zxcvbn from 'zxcvbn';

export interface PasswordValidationResult {
  isValid: boolean;
  score: number;
  message?: string;
  feedback?: {
    warning?: string;
    suggestions?: string[];
  };
}

/**
 * Validates password strength
 * @param password - Password to validate
 * @param userInputs - Optional user inputs (email, name, etc) to check against
 * @param minScore - Minimum required score (0-4), default is 2
 * @returns Validation result
 */
export const validatePasswordStrength = (
  password: string,
  userInputs: string[] = [],
  minScore: number = 2
): PasswordValidationResult => {
  // Basic validation
  if (!password || password.length < 8) {
    return {
      isValid: false,
      score: 0,
      message: 'A senha deve ter pelo menos 8 caracteres',
    };
  }

  // Filter out empty user inputs
  const filteredInputs = userInputs.filter(input => input && input.trim().length > 0);

  // Use zxcvbn to calculate strength
  const result = zxcvbn(password, filteredInputs);

  // Check if meets minimum score
  if (result.score < minScore) {
    return {
      isValid: false,
      score: result.score,
      message: 'A senha é muito fraca. Por favor, escolha uma senha mais forte.',
      feedback: {
        warning: result.feedback.warning,
        suggestions: result.feedback.suggestions,
      },
    };
  }

  return {
    isValid: true,
    score: result.score,
  };
};
