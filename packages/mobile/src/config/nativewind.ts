/**
 * NativeWind Configuration - Jarvi Mobile
 * 
 * Configuração do NativeWind para o aplicativo mobile
 * seguindo o design system.
 */

import { create } from 'nativewind';

// ============================================================================
// CONFIGURAÇÃO DO NATIVEWIND
// ============================================================================

const { styled } = create();

// ============================================================================
// COMPONENTES ESTILIZADOS
// ============================================================================

export const StyledView = styled('View');
export const StyledText = styled('Text');
export const StyledScrollView = styled('ScrollView');
export const StyledTouchableOpacity = styled('TouchableOpacity');
export const StyledTextInput = styled('TextInput');
export const StyledImage = styled('Image');
export const StyledSafeAreaView = styled('SafeAreaView');

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Função para criar componente estilizado
 */
export function createStyledComponent(component: any) {
  return styled(component);
}

/**
 * Função para obter classes de tema
 */
export function getThemeClasses(isDark: boolean) {
  return {
    // Backgrounds
    bgPrimary: isDark ? 'bg-neutral-900' : 'bg-neutral-0',
    bgSecondary: isDark ? 'bg-neutral-800' : 'bg-neutral-50',
    bgTertiary: isDark ? 'bg-neutral-700' : 'bg-neutral-100',
    
    // Surfaces
    surfacePrimary: isDark ? 'bg-neutral-800' : 'bg-neutral-0',
    surfaceSecondary: isDark ? 'bg-neutral-700' : 'bg-neutral-50',
    surfaceTertiary: isDark ? 'bg-neutral-600' : 'bg-neutral-100',
    surfaceElevated: isDark ? 'bg-neutral-700' : 'bg-neutral-0',
    
    // Text
    textPrimary: isDark ? 'text-neutral-0' : 'text-neutral-900',
    textSecondary: isDark ? 'text-neutral-200' : 'text-neutral-700',
    textTertiary: isDark ? 'text-neutral-400' : 'text-neutral-600',
    textInverse: isDark ? 'text-neutral-900' : 'text-neutral-0',
    textDisabled: isDark ? 'text-neutral-600' : 'text-neutral-400',
    
    // Borders
    borderPrimary: isDark ? 'border-neutral-600' : 'border-neutral-200',
    borderSecondary: isDark ? 'border-neutral-500' : 'border-neutral-300',
    borderFocus: isDark ? 'border-primary-400' : 'border-primary-600',
    borderError: isDark ? 'border-error-400' : 'border-error-600',
    
    // Brand
    brandPrimary: isDark ? 'bg-primary-400' : 'bg-primary-600',
    brandSecondary: isDark ? 'bg-secondary-400' : 'bg-secondary-600',
    
    // Semantic
    semanticSuccess: isDark ? 'bg-success-400' : 'bg-success-600',
    semanticWarning: isDark ? 'bg-warning-400' : 'bg-warning-600',
    semanticError: isDark ? 'bg-error-400' : 'bg-error-600',
    semanticInfo: isDark ? 'bg-info-400' : 'bg-info-600',
  };
}

/**
 * Função para obter estilos de tema
 */
export function getThemeStyles(isDark: boolean) {
  return {
    // Backgrounds
    backgroundPrimary: {
      backgroundColor: isDark ? '#111827' : '#ffffff',
    },
    backgroundSecondary: {
      backgroundColor: isDark ? '#1f2937' : '#f9fafb',
    },
    backgroundTertiary: {
      backgroundColor: isDark ? '#374151' : '#f3f4f6',
    },
    
    // Surfaces
    surfacePrimary: {
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
    },
    surfaceSecondary: {
      backgroundColor: isDark ? '#374151' : '#f9fafb',
    },
    surfaceTertiary: {
      backgroundColor: isDark ? '#4b5563' : '#f3f4f6',
    },
    surfaceElevated: {
      backgroundColor: isDark ? '#374151' : '#ffffff',
    },
    
    // Text
    textPrimary: {
      color: isDark ? '#f9fafb' : '#111827',
    },
    textSecondary: {
      color: isDark ? '#e5e7eb' : '#4b5563',
    },
    textTertiary: {
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    textInverse: {
      color: isDark ? '#111827' : '#f9fafb',
    },
    textDisabled: {
      color: isDark ? '#6b7280' : '#9ca3af',
    },
    
    // Borders
    borderPrimary: {
      borderColor: isDark ? '#4b5563' : '#e5e7eb',
    },
    borderSecondary: {
      borderColor: isDark ? '#6b7280' : '#d1d5db',
    },
    borderFocus: {
      borderColor: isDark ? '#7dd3fc' : '#0284c7',
    },
    borderError: {
      borderColor: isDark ? '#f87171' : '#dc2626',
    },
    
    // Brand
    brandPrimary: {
      backgroundColor: isDark ? '#7dd3fc' : '#0284c7',
    },
    brandSecondary: {
      backgroundColor: isDark ? '#d8b4fe' : '#9333ea',
    },
    
    // Semantic
    semanticSuccess: {
      backgroundColor: isDark ? '#6ee7b7' : '#10b981',
    },
    semanticWarning: {
      backgroundColor: isDark ? '#fcd34d' : '#f59e0b',
    },
    semanticError: {
      backgroundColor: isDark ? '#f87171' : '#ef4444',
    },
    semanticInfo: {
      backgroundColor: isDark ? '#93c5fd' : '#3b82f6',
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default styled;

