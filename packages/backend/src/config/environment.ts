/**
 * Environment configuration utilities
 */

export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== 'production';
};

export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

export const getNodeEnv = (): string => {
  return process.env.NODE_ENV || 'development';
};
